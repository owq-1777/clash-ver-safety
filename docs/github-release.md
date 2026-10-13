# GitHub release signing

The Windows x64 workflow builds an NSIS `.exe` installer on a Windows runner and
publishes it with checksums on `v*` tag pushes. Manual **Run workflow** builds
upload an installer artifact without creating a release.
When the GPG secrets are configured, it also publishes detached ASCII signatures
for the installer and `SHA256SUMS`, plus `release-signing-key.asc`. Installer contents
are unchanged. GPG signatures verify downloads; they do not provide Windows
Authenticode publisher identity or remove SmartScreen warnings. Authenticode
requires a Windows code-signing certificate, which is not configured here.

## Create a release key

Generate the key on a trusted local machine, replacing the identity below:

```sh
gpg --quick-generate-key "YOUR NAME <YOUR EMAIL>" rsa4096 sign 1y
gpg --list-secret-keys --keyid-format long --fingerprint
```

Choose a strong passphrase at the prompt. Record the full uppercase fingerprint
without spaces, not the short key ID. Keep the key and its revocation certificate
in a secure backup; renew or replace the key before it expires.

Export it to a private temporary directory outside the repository:

```sh
release_fingerprint='REPLACE_WITH_FULL_FINGERPRINT'
release_key_dir=$(mktemp -d)
gpg --armor --export-secret-keys "$release_fingerprint" > "$release_key_dir/private-key.asc"
gpg --armor --export "$release_fingerprint" > "$release_key_dir/public-key.asc"
```

Never commit the private key or passphrase. Publish the public fingerprint through
a trusted channel so users can compare it with the key shipped in the release.

## Configure repository secrets

In GitHub, open **Settings → Secrets and variables → Actions → New repository
secret**, and configure:

| Secret | Value |
| --- | --- |
| `GPG_PRIVATE_KEY` | Entire `private-key.asc` content, including BEGIN/END lines. |
| `GPG_KEY_ID` | Full uppercase fingerprint, with no spaces. |
| `GPG_PASSPHRASE` | The passphrase chosen when creating the key. |

Alternatively, use GitHub CLI from your own machine:

```sh
release_repo='owq-1777/clash-ver-safety'
gh secret set GPG_PRIVATE_KEY --repo "$release_repo" < "$release_key_dir/private-key.asc"
gh secret set GPG_KEY_ID --repo "$release_repo" --body "$release_fingerprint"
gh secret set GPG_PASSPHRASE --repo "$release_repo"
```

Enter the passphrase interactively; do not put it in command history. Delete the
temporary exported private key after storing it in Secrets and retaining a secure
backup.

Release upload uses GitHub's built-in `GITHUB_TOKEN`; no personal access token is
required. Both `GPG_PRIVATE_KEY` and `GPG_KEY_ID` must be present to enable signing.
With neither configured, the workflow publishes unsigned packages. Once enabled,
key import, fingerprint mismatch, signing or verification failures stop publication.
Configuring only one of the private key and fingerprint also stops the workflow.

## Publish and verify

Commit consistent version fields before pushing the matching `v<version>` tag.
For example, version `2.5.8` requires tag `v2.5.8`.

Users should download the installer, `SHA256SUMS`, signatures, and the public key into
one directory. Compare the public fingerprint with the publisher's trusted copy
before importing it:

```sh
gpg --show-keys --with-fingerprint release-signing-key.asc
gpg --import release-signing-key.asc
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum --check SHA256SUMS
```

To verify an individual package, run `gpg --verify PACKAGE.asc PACKAGE`, replacing
both paths with the downloaded filenames.

On Windows with Gpg4win installed, the same `gpg --verify` command verifies the
`.exe` signature. PowerShell `Get-FileHash -Algorithm SHA256 -LiteralPath 'INSTALLER.exe'`
can be used to compare the installer hash with `SHA256SUMS`.
