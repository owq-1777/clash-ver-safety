import { Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import type { Ref } from 'react'
import { useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef } from '@/components/base'
import { createLocalBackup, importLocalBackup } from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { errorDetail, showNotice } from '@/services/notice-service'

import { AutoBackupSettings } from './auto-backup-settings'
import { BackupHistoryViewer } from './backup-history-viewer'

export function BackupViewer({ ref }: { ref?: Ref<DialogRef> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(0)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }))

  const handleBackup = useLockFn(async () => {
    try { setBusy(true); await mutate(() => createLocalBackup(), { id: 'create-local-backup', errorNotice: false, successNotice: 'settings.modals.backup.messages.localBackupCreated' }) }
    catch (error) { showNotice.error('settings.modals.backup.messages.localBackupFailed', { error: errorDetail(error) }) }
    finally { setBusy(false) }
  })
  const handleImport = useLockFn(async () => {
    const selected = await openDialog({ multiple: false, filters: [{ name: 'Backup File', extensions: ['zip'] }] })
    if (!selected || Array.isArray(selected)) return
    try { setImporting(true); await mutate(() => importLocalBackup(selected), { id: 'import-local-backup', errorNotice: false, successNotice: 'settings.modals.backup.messages.localBackupImported' }); setHistoryPage(0); setHistoryOpen(true) }
    catch (error) { showNotice.error('settings.modals.backup.messages.localBackupImportFailed', { error: errorDetail(error) }) }
    finally { setImporting(false) }
  })

  return <BaseDialog open={open} title={t('settings.modals.backup.title')} contentSx={{ width: { xs: 360, sm: 520 } }} disableOk cancelBtn={t('shared.actions.close')} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
    <Stack spacing={2}>
      <Stack spacing={1} sx={{ border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2, p: 2 }}><Typography variant="subtitle1">{t('settings.modals.backup.auto.title')}</Typography><List disablePadding><AutoBackupSettings/></List></Stack>
      <Stack spacing={1} sx={{ border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2, p: 2 }}><Typography variant="subtitle1">{t('settings.modals.backup.manual.title')}</Typography><List disablePadding><ListItem disableGutters><Stack spacing={1} sx={{ width: '100%' }}><ListItemText primary={t('settings.modals.backup.tabs.local')} secondary={t('settings.modals.backup.manual.local')}/><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Button variant="contained" size="small" loading={busy} disabled={importing} onClick={() => void handleBackup()}>{t('settings.modals.backup.actions.backup')}</Button><Button variant="outlined" size="small" disabled={busy || importing} onClick={() => { setHistoryPage(0); setHistoryOpen(true) }}>{t('settings.modals.backup.actions.viewHistory')}</Button><Button variant="text" size="small" loading={importing} disabled={busy} onClick={() => void handleImport()}>{t('settings.modals.backup.actions.importBackup')}</Button></Stack></Stack></ListItem></List></Stack>
    </Stack>
    <BackupHistoryViewer open={historyOpen} page={historyPage} onPageChange={setHistoryPage} onClose={() => setHistoryOpen(false)}/>
  </BaseDialog>
}
