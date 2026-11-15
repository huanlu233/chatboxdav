# ChatboxDAV

ChatboxDAV is an independent Android distribution of [Chatbox](https://github.com/chatboxai/chatbox), with manually selected WebDAV conversation backups. It is not an official Chatbox release. Both the upstream license and attribution are retained under GPL-3.0.

## Features

- Configure WebDAV in Settings; save selected conversations manually with an editable project name.
- List remote projects and import only explicitly selected projects. An empty selection never means import everything.
- Native Android HTTP transport supports 123pan redirect downloads without leaking credentials to a CDN.
- Android update checks and the About update link use **huanlu233/chatboxdav Releases**, not Chatbox's update service. APK installation remains an explicit Android user action.

## Upstream is not patched

`upstream.json` pins the official release and exact commit. A pristine checkout is materialized under `.build/upstream`. No upstream tracked source file is rewritten or committed into this repository.

- `webdav-module/`: HTTP client, redirect/security logic, Capacitor plugin, isolated tests.
- `integration/renderer/`: WebDAV dialogs, settings, selective backup/import and distribution update checker.
- `integration/plugin.mjs`: six fail-closed, in-memory build hooks that call the extension from Settings, the conversation menu, backup delivery and both update entry points. They do not replace upstream backup algorithms.
- `scripts/verify-upstream.mjs`: refuses any changed upstream tracked file or mismatched commit.
- `scripts/guard-repair.mjs`: forbids automatic repair outside WebDAV production sources, including changes to existing tests and release scripts.

This is release-pin integration, **not a Git merge that rewrites Chatbox core**. If an upstream API or hook is incompatible, the release stops for WebDAV adapter maintenance.

## Automatic releases

The `Upstream sync and Android release` workflow checks every six hours, on manual dispatch, and on relevant pushes to `main`. It processes stable upstream versions in ascending order, ignores drafts/prereleases, runs WebDAV, backup and upstream unit tests plus TypeScript checks, builds Android, verifies the unchanged upstream tree, and signs on a separate clean runner. Only a passing build is published. Version names and Android version codes increase together. Failures create a GitHub issue instead of shipping an unchecked APK. Scheduled workflows may need re-enabling after GitHub disables an inactive repository's schedules.

Optional automatic bug repair requires the repository secret `OPENAI_API_KEY`. Without that secret, failed tests are **not** automatically fixed: the workflow blocks and reports them. When enabled, a bounded repair attempt can change only WebDAV code, and all checks run again. This can incur API charges and cannot guarantee detection or repair of every bug. Upstream-core failures are never repaired here.

Persistent signing secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEY_ALIAS
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_PASSWORD
```

`scripts/configure-signing.ps1` creates a private release key inside `.local/signing` and sends it to GitHub's encrypted repository secrets through an already authenticated `gh`. It never writes a global Git or CLI setting. Keep a secure backup of this key before deleting the project folder: future APK updates must use the same certificate. Do not commit or share `.local`. The old 1.0.1 test-signed APK uses a different certificate; export your conversations before uninstalling it to install this production-signed distribution.

## Local build

Use Node 22, pnpm 10.33.0, JDK 21 and Android SDK platform/build-tools 35. Toolchains and caches can live under a single parent folder; the existing portable environment can be dot-sourced before running these commands. No global installation is required.

```sh
node scripts/prepare.mjs
node scripts/check.mjs
node scripts/build.mjs
# Set SIGNING_KEYSTORE, SIGNING_ALIAS, SIGNING_STORE_PASSWORD, SIGNING_KEY_PASSWORD
node scripts/sign.mjs
```

Set `PNPM_CLI` to an absolute portable `pnpm.cjs` path when pnpm is not on PATH. All generated upstream files and build outputs are ignored. The Android package ID remains `xyz.chatboxapp.ce.webdav`. Release assets include the APK, checksums, exact build manifest, distribution source and pristine upstream source. No WebDAV account, password, user conversation, local download or private key is part of the repository or APK.

## Verification scope

Tests cover selected-conversation export, renamed projects, selected-project import, partial import errors, cancellation, redirect credential stripping and distribution version comparison. Automated tests and successful compilation are not a substitute for physical Android device testing.
