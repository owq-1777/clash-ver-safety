use crate::{
    config::{Config, IVerge},
    core::backup,
    process::AsyncHandler,
    utils::dirs::{PathBufExec as _, app_home_dir, local_backup_dir},
};
use anyhow::{Result, anyhow};
use chrono::Utc;
use clash_verge_logging::{Type, logging};
use serde::Serialize;
use smartstring::alias::String;
use std::io::Read as _;
use std::path::PathBuf;
use tokio::fs;

const MAX_BACKUP_BYTES: u64 = 64 * 1024 * 1024;
const MAX_BACKUP_ENTRIES: usize = 512;
const MAX_BACKUP_ENTRY_BYTES: u64 = 16 * 1024 * 1024;

fn validate_backup_filename(filename: &str) -> Result<()> {
    let path = std::path::Path::new(filename);
    if path.components().count() != 1
        || !matches!(path.components().next(), Some(std::path::Component::Normal(_)))
        || filename != path.file_name().and_then(|name| name.to_str()).unwrap_or_default()
        || !filename.to_ascii_lowercase().ends_with(".zip")
    {
        return Err(anyhow!("Invalid backup file name"));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct LocalBackupFile {
    pub filename: String,
    pub path: String,
    pub last_modified: String,
    pub content_length: u64,
}

pub async fn create_local_backup() -> Result<()> {
    create_local_backup_with_namer(|name| name.to_string().into())
        .await
        .map(|_| ())
}

pub async fn create_local_backup_with_namer<F>(namer: F) -> Result<String>
where
    F: FnOnce(&str) -> String,
{
    let (file_name, temp_file_path) = backup::create_backup().await.map_err(|err| {
        logging!(error, Type::Backup, "Failed to create local backup: {err:#}");
        err
    })?;

    let backup_dir = local_backup_dir()?;
    let final_name = namer(file_name.as_str());
    let target_path = backup_dir.join(final_name.as_str());

    if let Err(err) = move_file(temp_file_path.clone(), target_path.clone()).await {
        logging!(
            error,
            Type::Backup,
            "Failed to move local backup file to {}: {err:#}",
            target_path.display()
        );
        if let Err(clean_err) = temp_file_path.remove_if_exists().await {
            logging!(
                warn,
                Type::Backup,
                "Failed to remove temp backup file after move error: {clean_err:#}"
            );
        }
        return Err(err);
    }

    Ok(final_name)
}

#[tracing::instrument(skip_all, level = "info", fields(source = %source))]
pub async fn import_local_backup(source: String) -> Result<String> {
    let source_path = PathBuf::from(source.as_str());
    if !source_path.exists() {
        return Err(anyhow!("Backup file not found: {source}"));
    }
    if !source_path.is_file() {
        return Err(anyhow!("Backup path is not a file: {source}"));
    }

    let ext = source_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_default();
    if ext != "zip" {
        return Err(anyhow!("Only .zip backup files are supported"));
    }

    let file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow!("Invalid backup file name"))?;
    validate_backup_filename(file_name)?;

    let backup_dir = local_backup_dir()?;
    let target_path = backup_dir.join(file_name);

    if target_path == source_path {
        return Ok(file_name.to_string().into());
    }

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    if target_path.exists() {
        return Err(anyhow!("Backup file already exists: {file_name}"));
    }

    fs::copy(&source_path, &target_path)
        .await
        .map_err(|err| anyhow!("Failed to import backup file: {err:#}"))?;

    Ok(file_name.to_string().into())
}

async fn move_file(from: PathBuf, to: PathBuf) -> Result<()> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).await?;
    }

    match fs::rename(&from, &to).await {
        Ok(_) => Ok(()),
        Err(rename_err) => {
            // Rename can fail across filesystems; fall back to copy then remove.
            logging!(
                warn,
                Type::Backup,
                "Failed to rename backup file directly, fallback to copy/remove: {rename_err}"
            );
            fs::copy(&from, &to)
                .await
                .map_err(|err| anyhow!("Failed to copy backup file: {err:#}"))?;
            fs::remove_file(&from)
                .await
                .map_err(|err| anyhow!("Failed to remove temp backup file: {err:#}"))?;
            Ok(())
        }
    }
}

pub async fn list_local_backup() -> Result<Vec<LocalBackupFile>> {
    let backup_dir = local_backup_dir()?;
    if !backup_dir.exists() {
        return Ok(vec![]);
    }

    let mut backups = Vec::new();
    let mut dir = fs::read_dir(&backup_dir).await?;
    while let Some(entry) = dir.next_entry().await? {
        let path = entry.path();
        let metadata = entry.metadata().await?;
        if !metadata.is_file() {
            continue;
        }

        let file_name = match path.file_name().and_then(|name| name.to_str()) {
            Some(name) => name,
            None => continue,
        };
        let last_modified = metadata
            .modified()
            .map(|time| chrono::DateTime::<Utc>::from(time).to_rfc3339())
            .unwrap_or_default();
        backups.push(LocalBackupFile {
            filename: file_name.into(),
            path: path.to_string_lossy().into(),
            last_modified: last_modified.into(),
            content_length: metadata.len(),
        });
    }

    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(backups)
}

pub async fn delete_local_backup(filename: String) -> Result<()> {
    validate_backup_filename(filename.as_str())?;
    let backup_dir = local_backup_dir()?;
    let target_path = backup_dir.join(filename.as_str());
    if !target_path.exists() {
        logging!(debug, Type::Backup, "Local backup file not found: {}", filename);
        return Ok(());
    }
    target_path.remove_if_exists().await?;
    Ok(())
}

#[tracing::instrument(skip_all, level = "info", fields(filename = %filename))]
pub async fn restore_local_backup(filename: String) -> Result<()> {
    validate_backup_filename(filename.as_str())?;
    let backup_dir = local_backup_dir()?;
    let target_path = backup_dir.join(filename.as_str());
    if !target_path.exists() {
        return Err(anyhow!("Backup file not found: {}", filename));
    }

    let metadata = fs::metadata(&target_path).await?;
    if metadata.len() > MAX_BACKUP_BYTES {
        return Err(anyhow!("Backup archive is too large"));
    }
    let file = AsyncHandler::spawn_blocking(move || std::fs::File::open(&target_path)).await??;
    let mut zip = zip::ZipArchive::new(file)?;
    if zip.len() > MAX_BACKUP_ENTRIES {
        return Err(anyhow!("Backup archive contains too many files"));
    }
    let _profile_write = crate::config::profiles::PROFILE_WRITE_LOCK.lock().await;
    let app_home = app_home_dir()?;
    let mut total_uncompressed = 0u64;
    let mut extracted = Vec::new();
    for index in 0..zip.len() {
        let entry = zip.by_index(index)?;
        if entry.is_dir() {
            continue;
        }
        if entry.size() > MAX_BACKUP_ENTRY_BYTES {
            return Err(anyhow!("Backup entry is too large"));
        }
        total_uncompressed = total_uncompressed.saturating_add(entry.size());
        if total_uncompressed > MAX_BACKUP_BYTES {
            return Err(anyhow!("Backup archive expands beyond the allowed size"));
        }
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| anyhow!("Backup archive contains an unsafe path"))?;
        let output = app_home.join(relative);
        if !output.starts_with(&app_home) {
            return Err(anyhow!("Backup archive contains an unsafe path"));
        }
        let mut contents = Vec::with_capacity(entry.size() as usize);
        entry.take(MAX_BACKUP_ENTRY_BYTES + 1).read_to_end(&mut contents)?;
        if contents.len() as u64 > MAX_BACKUP_ENTRY_BYTES {
            return Err(anyhow!("Backup entry is too large"));
        }
        extracted.push((output, contents));
    }
    let restored_verge_path = app_home.join(crate::utils::dirs::VERGE_CONFIG);
    for (output, contents) in &mut extracted {
        if *output == restored_verge_path {
            let mut restored: IVerge = serde_yaml_ng::from_slice(contents)?;
            restored.startup_script = None;
            *contents = serde_yaml_ng::to_string(&restored)?.into_bytes();
        }
    }
    for (output, contents) in extracted {
        if let Some(parent) = output.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(output, contents)?;
    }
    let verge_path = crate::utils::dirs::verge_path()?;
    let mut current_verge: IVerge = serde_yaml_ng::from_str(&fs::read_to_string(&verge_path).await?)?;
    current_verge.startup_script = None;
    crate::utils::help::save_yaml(&verge_path, &current_verge, Some("# Clash Verge Config")).await?;

    Config::verge().await.discard();
    Ok(())
}

#[tracing::instrument(skip_all, level = "info", fields(filename = %filename, destination = %destination))]
pub async fn export_local_backup(filename: String, destination: String) -> Result<()> {
    validate_backup_filename(filename.as_str())?;
    let backup_dir = local_backup_dir()?;
    let source_path = backup_dir.join(filename.as_str());
    if !source_path.exists() {
        return Err(anyhow!("Backup file not found: {}", filename));
    }

    let dest_path = PathBuf::from(destination.as_str());
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    fs::copy(&source_path, &dest_path)
        .await
        .map(|_| ())
        .map_err(|err| anyhow!("Failed to export backup file: {err:#}"))?;
    Ok(())
}
