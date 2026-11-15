# WebDAV module

This is a standalone local module for WebDAV protocol handling and its Android
Capacitor transport. It is intentionally outside the Chatbox source checkout;
The distribution build links this package into its generated checkout instead
of copying protocol or native implementation into upstream source files.

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

The distribution's preparation script links `@local/webdav-module` without
modifying Chatbox's package manifest or lockfile. Its WebDAV client adapter only
supplies the platform transport; `transport.ts` selects the native or fetch adapter.
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

Run `node scripts/prepare.mjs` and `node scripts/check.mjs` from the distribution
root. The earlier real-server smoke test read one 2,846-byte project into memory,
followed the CDN redirect without forwarding Authorization, and received HTTP
200. It did not import the backup or write its contents to disk.

The module is wired into the pristine generated Chatbox checkout. To rebuild
from the distribution root, load your portable environment first:

```powershell
node scripts/prepare.mjs
node scripts/check.mjs
node scripts/build.mjs
```

All tools, caches and build artifacts stay under the parent portable folder.
Release signing is separate and uses a persistent private production key.
No WebDAV credentials are built in.
