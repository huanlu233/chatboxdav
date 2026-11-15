# WebDAV module

This is a standalone local module for WebDAV protocol handling and its Android
Capacitor transport. It is intentionally outside the Chatbox source checkout;
Chatbox imports this package through `link:../webdav-module` instead of copying
its protocol or native implementation into application source files.

## Layout

- `src/core`: WebDAV URL validation, project discovery, save/download protocol,
  limits and redirect policy. The transport is injected.
- `src/adapters/capacitor-android.ts`: cancellation-aware Capacitor transport
  adapter. Register the native plugin in the host app as `WebDavHttp`.
- `android`: reusable native HTTP plugin implementation, with redirects disabled
  at the HTTP layer so the core can inspect each redirect before following it.
- `tests`: isolated protocol and redirect-policy tests.
- `adapters/chatbox`: Chatbox's versioned project envelope and a backup bridge
  that exports only selected conversation IDs, excludes global data and imports
  only explicitly selected remote projects. The host supplies its backup API.

## 123pan download fix

The tested server accepts authenticated WebDAV `PROPFIND` requests and lists
projects. A project `GET` responds with HTTP 302 to a different HTTPS CDN host;
an unauthenticated GET to that CDN succeeds. The former implementation rejected
all redirects, which made imports fail after project discovery.

The core now follows at most five GET redirects, refuses HTTPS-to-HTTP
downgrades and credential-bearing redirect URLs, and permanently drops the Basic
Authorization header as soon as the redirect changes origin. Other methods
never follow redirects. The Android transport surfaces the `Location` header
without following it so this policy is enforced in one place. No credentials or
downloaded backup contents are included in this module.

## Host integration

Construct `WebDavClient` with the platform transport. On Android, register the
native class from `android/src/main/java/local/webdav/android/WebDavHttpPlugin.java`
with the Capacitor bridge under the name `WebDavHttp`, then pass
`createCapacitorWebDavTransport(plugin)` to the client. The Chatbox adapter
exports selected conversation IDs with settings, copilots and credentials
disabled, then imports only explicitly selected projects through the host's
backup bridge. Settings UI and overwrite confirmation remain host concerns.

The Chatbox checkout declares `@local/webdav-module: link:../webdav-module`.
Its `src/renderer/packages/webdav/client.ts` only supplies the platform transport
to this package's client; `transport.ts` selects the native or fetch adapter.
Conversation selection, backup inspection, cancellation and partial-import
reporting remain in the host's existing backup integration.

Run Capacitor sync after linking the dependency. Capacitor generates the Gradle
dependency and the `local.webdav.android.WebDavHttpPlugin` registration in
`capacitor.plugins.json`. Do not also register or copy the plugin in MainActivity.
Both the Java implementation and redirect policy live only in this module.

The browser fetch transport uses manual redirects. Browsers hide cross-origin
manual redirect locations, so cross-origin CDN redirects require a native
transport that can expose the response's `Location` header. This module targets
the Android flow; it does not silently forward credentials or auto-follow in a
browser.

## Verification

Run `pnpm install --frozen-lockfile` and `pnpm test` / `pnpm typecheck` from this
directory. The real-server smoke test read one 2,846-byte project into memory,
followed the CDN redirect without forwarding Authorization, and received HTTP
200. It did not import the backup or write its contents to disk.

The module is now wired into the sibling Chatbox checkout. To rebuild from the
parent folder in PowerShell, load the portable environment first:

```powershell
. ./portable-env.ps1
Set-Location ./chatbox
node $PortablePnpm install --frozen-lockfile --ignore-scripts
node $PortablePnpm run build:android-web
node node_modules/@capacitor/cli/bin/capacitor sync android
Set-Location ./android
./gradlew.bat assembleRelease --no-daemon
```

All tools, caches and build artifacts stay under the parent portable folder.
Release signing is separate; the local test APK uses the existing portable
debug certificate, not a production key. No WebDAV credentials are built in.
