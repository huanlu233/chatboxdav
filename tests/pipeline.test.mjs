import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { transformSource, replaceOnce, hookPaths } from '../integration/plugin.mjs'
import { root, upstream } from '../scripts/common.mjs'
import { nextRelease, compare } from '../scripts/update-upstream.mjs'
import { buildReleaseNotes } from '../scripts/release-notes.mjs'
import { releasePatchAllowed } from '../scripts/guard-release-patch.mjs'
test('upstream releases are integrated sequentially, not skipped or downgraded', () => {
  const releases = ['v1.24.6', 'v1.24.5', 'v1.24.4', 'v1.23.0'].map(tag_name => ({ tag_name }))
  assert.equal(nextRelease(releases, 'v1.24.4').tag_name, 'v1.24.5')
  assert.equal(nextRelease(releases, 'v1.24.6'), undefined)
  assert.equal(nextRelease([{ tag_name: 'v2.0.0', prerelease: true }], 'v1.24.4'), undefined)
  assert.ok(compare('v1.10.0', 'v1.9.0') > 0)
})
test('release patches cannot change upstream core, tests, workflows or signing', () => {
  assert.ok(releasePatchAllowed('webdav-module/src/core/client.ts'))
  assert.ok(releasePatchAllowed('integration/plugin.mjs'))
  assert.ok(releasePatchAllowed('integration/renderer/packages/webdav/updates.ts'))
  for (const p of ['src/renderer/App.tsx', '.build/upstream/src/index.ts', 'scripts/sign.mjs', '.github/workflows/release.yml', 'webdav-module/src/core/client.test.ts', 'integration/renderer/../../scripts/build.mjs']) assert.equal(releasePatchAllowed(p), false)
})
test('missing or ambiguous integration anchors block a release', () => {
  assert.throws(() => replaceOnce('a a', 'a', 'b', 'test'))
  assert.throws(() => replaceOnce('c', 'a', 'b', 'test'))
  assert.equal(replaceOnce('a', 'a', 'b', 'test'), 'b')
})
test('unrelated upstream sources are never transformed', () => {
  assert.equal(transformSource('unchanged', 'packages/chatbox-core/src/index.ts'), null)
  assert.equal(transformSource('unchanged', 'src/main/main.ts'), null)
})
test('all pinned upstream hooks remain compatible', { skip: !existsSync(upstream) }, () => {
  for (const path of hookPaths) {
    const original = readFileSync(resolve(upstream, path), 'utf8')
    const transformed = transformSource(original, path)
    assert.ok(transformed && transformed !== original)
    if (path.endsWith('useVersion.ts')) assert.ok(!transformed.includes('remote.checkNeedUpdate('))
    if (path.endsWith('about.tsx')) assert.ok(!transformed.includes('/redirect_app/check_update/'))
    if (path.endsWith('DbSchemaGuardDialog.tsx')) assert.ok(!transformed.includes('/redirect_app/check_update/'))
    if (path.endsWith('renderer-backup.ts')) assert.ok(transformed.includes('webdavExporter(platform.exporter)'))
  }
})
test('translation additions cannot overwrite different upstream strings', () => {
  assert.throws(() => transformSource('{"x":"original"}', 'packages/chatbox-i18n/src/locales/en/translation.json', { en: { x: 'changed' } }))
})
test('release notes put English first and describe WebDAV changes', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'chatboxdav-release-'))
  try {
    mkdirSync(resolve(temp, 'dist'))
    writeFileSync(resolve(temp, 'dist/candidate.patch'), '+++ b/webdav-module/src/core/client.ts\n+++ b/integration/renderer/modals/WebDavSave.tsx\n')
    const notes = buildReleaseNotes({ root: temp, pin: { tag: 'v1.24.4', commit: 'abc' }, version: '1.0.3' })
    assert.match(notes, /^ChatboxDAV 1\.0\.3/)
    assert.match(notes, /WebDAV changes:/)
    assert.match(notes, /---[\s\S]*ChatboxDAV 1\.0\.3 中文说明/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
test('release notes identify an upstream-only synchronization', () => {
  const temp = mkdtempSync(resolve(tmpdir(), 'chatboxdav-release-'))
  try {
    const notes = buildReleaseNotes({ root: temp, pin: { tag: 'v1.25.0', commit: 'def' }, version: '1.0.4', upstreamChanged: true, previousTag: 'v1.24.4', previousCommit: 'abc' })
    assert.match(notes, /Synchronized Chatbox v1\.25\.0/)
    assert.match(notes, /已同步 Chatbox 上游 v1\.25\.0/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
