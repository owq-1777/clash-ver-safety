# Security audit and remediation plan

This record tracks the repository security review and the staged remediation. It intentionally contains no deployment paths or server-specific details.

## Findings

- The WebDAV backup feature accepted credentials, skipped TLS certificate validation, and exposed remote backup operations. It duplicated local backup functionality and increased the attack surface.
- Local backup restore accepted user-controlled archive names and extracted archives without path, entry, or expansion limits. A restored startup script could run on the next launch.
- Deep links imported remote profiles automatically and could activate the first profile. Remote profile responses had no bounded body read.
- Icon downloads accepted arbitrary URLs and unbounded responses.
- Latency checks accepted non-HTTP schemes and treated them as raw TCP targets.
- Default hosted Web UI links included the controller secret in third-party URLs.
- The theme gradient used user-derived values in an HTML string sink. Tauri file and asset scopes were broader than required, and the build script interpolated paths into a shell command.

## Remediation status

## Risk progression

| Stage | Trigger | Result |
| --- | --- | --- |
| Configuration entry | A user enables remote backup, imports a deep link, or adds a remote icon | The application accepts a remote URL and begins a network request. |
| Trust boundary crossing | The URL points to a third-party, private, or oversized resource | Credentials, local network reachability, or memory/disk capacity can be exposed. |
| Persistent state | A profile or backup is imported and later reloaded | Unsafe paths or startup settings can affect future writes or process startup. |
| External execution | A controller URL or downloaded core is opened or installed | Secrets may leave the device or unverified bytes may execute with application privileges. |

The implemented guards stop this progression at configuration entry or the trust-boundary crossing for the affected paths. Core publisher verification remains the one open supply-chain step because it requires a trusted release key or manifest.

### Phase 1 — complete

- Removed WebDAV commands, backend client, settings fields, UI, status cache, translations, and documentation.
- Kept local backup creation, import, export, history, and restore.
- Removed the SVG `innerHTML` sink in favor of DOM node construction.
- Narrowed Tauri file and asset scopes and added a restrictive baseline CSP.

### Phase 2 — complete

- Validated local backup names as single `.zip` path components for every file operation.
- Added archive size, entry count, per-entry size, cumulative expansion, and enclosed-path checks.
- Cleared `startup_script` from restored configuration before saving it.
- Validated profile file names when loading `profiles.yaml` so restored metadata cannot escape the profile directory.

### Phase 3 — complete

- Deep-link subscription URLs are restricted to HTTP(S) and reject loopback, link-local, private, and unspecified IP literals. A first deep-link import no longer becomes the active profile.
- Bounded HTTP response bodies used for remote profiles.
- Restricted icon downloads to HTTP(S), rejected private address literals and redirects, added a timeout, and bounded image responses.
- Restricted latency checks to HTTP(S).
- Removed controller secret placeholders from default hosted Web UI URLs.

### Phase 4 — partial

- Replaced shell interpolation in the build permission step with `execFileSync` argument passing.
- Removed the unused WebDAV dependency and regenerated i18n metadata.
- Generated a random controller secret for new/default configurations and replaced the legacy placeholder when loading it.
- Created encryption keys with owner-only permissions on Unix systems.
- Removed the application self-updater, updater plugin/configuration, background update checks, update commands, update dialog, and update metadata scripts. Mihomo core upgrades remain available through the dedicated `upgrade_clash_core` path.
- Publisher signature/hash verification for core and build downloads still needs a trusted release manifest or publisher key; no trust anchor has been invented in this change.
- Encryption-key/config permission hardening and external-controller secret migration remain pending.

## Verification

- `node scripts/generate-i18n-keys.mjs` completed successfully.
- `cargo metadata --no-deps --format-version 1` completed successfully.
- `rustfmt --check` on changed Rust files and `node --check scripts/prebuild.mjs` passed.
- `pnpm prebuild` downloaded the required Mihomo core, service sidecars, and rule assets.
- `cargo check -p clash-verge --lib` passed after the native GTK/WebKit packages and sidecars were installed.
- `pnpm typecheck` passed using the pinned pnpm 12.10.0 runner.
- Linux x64 release packaging produced unsigned DEB and RPM artifacts. SHA-256 checksums were generated locally; no package signing key or Linux signing configuration exists in this repository.
- GitHub Release now supports optional GPG detached signatures for packages and checksums. Local validation with a passphrase-protected test key confirmed signing, verification, and rejection of modified payloads; the GitHub-hosted workflow has not yet run. Setup instructions are in `docs/github-release.md`.
- The requested release target is now Windows x64: the workflow builds an NSIS installer on `windows-2022` using `x86_64-pc-windows-msvc`, uploads it as an Actions artifact, and publishes tag builds from a separate Linux signing job. No Windows installer has been built locally on the Linux host.
