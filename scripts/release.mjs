import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root, manifest, git, run } from './common.mjs'
import { buildReleaseNotes } from './release-notes.mjs'
const pin = manifest()
const repository = JSON.parse(readFileSync(resolve(root, 'distribution.json'), 'utf8')).repository
const version = pin.distributionVersion
if (!/^\d+\.\d+\.\d+$/.test(version) || repository !== 'huanlu233/chatboxdav') throw new Error('Invalid release destination')
const tag = `v${version}`
const commit = git(['rev-parse', 'HEAD'], root)
const notes = buildReleaseNotes({
  root,
  pin,
  version,
  upstreamChanged: process.env.UPSTREAM_CHANGED === 'true',
  previousTag: process.env.UPSTREAM_PREVIOUS_TAG,
  previousCommit: process.env.UPSTREAM_PREVIOUS_COMMIT,
})
const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000) })
if (response.status === 200) {
  const release = await response.json()
  if (!release.draft || release.target_commitish !== commit) throw new Error('Refusing to overwrite a published release or an unrelated draft')
} else if (response.status === 404) {
  run('gh', ['release', 'create', tag, '--repo', repository, '--draft', '--target', commit, '--title', `ChatboxDAV ${version}`, '--notes', notes])
} else throw new Error(`Cannot inspect release: GitHub API ${response.status}`)
run('git', ['archive', '--format=tar.gz', '-o', `dist/ChatboxDAV-${version}-source.tar.gz`, 'HEAD'])
run('gh', ['release', 'upload', tag, '--repo', repository, '--clobber', `dist/ChatboxDAV-${version}-android.apk`, 'dist/SHA256SUMS.txt', 'dist/build.json', `dist/ChatboxDAV-${version}-source.tar.gz`, 'dist/chatbox-upstream-source.tar.gz'])
run('gh', ['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest'])
