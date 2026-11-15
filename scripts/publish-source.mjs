import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { releasePatchAllowed } from './guard-release-patch.mjs'
import { root, git, run, manifest } from './common.mjs'
if (git(['rev-parse', 'HEAD'], root) !== process.env.GITHUB_SHA) throw new Error('Main changed during build; retry without overwriting')
const patch = readFileSync('dist/candidate.patch', 'utf8')
if (patch.trim()) {
  const files = execFileSync('git', ['apply', '--numstat', '-z', 'dist/candidate.patch'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const stat of files) {
    const path = stat.split('\t').slice(2).join('\t')
    if (path !== 'upstream.json' && !releasePatchAllowed(path)) throw new Error(`Forbidden release patch: ${path}`)
  }
  run('git', ['apply', '--check', 'dist/candidate.patch'])
  run('git', ['apply', 'dist/candidate.patch'])
}
const build = JSON.parse(readFileSync('dist/build.json', 'utf8'))
for (const key of ['commit', 'tag', 'releaseId', 'distributionVersion', 'versionCode']) if (build[key] !== manifest()[key]) throw new Error(`Release source does not match APK: ${key}`)
run('git', ['config', 'user.name', 'chatboxdav-release[bot]'])
run('git', ['config', 'user.email', 'chatboxdav-release@users.noreply.github.com'])
run('git', ['add', 'upstream.json', 'integration/plugin.mjs', 'integration/renderer', 'webdav-module/src', 'webdav-module/android/src'])
if (git(['diff', '--cached', '--name-only'], root)) run('git', ['commit', '-m', 'release: verified upstream and WebDAV integration'])
run('git', ['push', 'origin', 'HEAD:main'])
