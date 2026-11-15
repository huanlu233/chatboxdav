import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root, manifest, git, run } from './common.mjs'
const pin = manifest()
const repository = JSON.parse(readFileSync(resolve(root, 'distribution.json'), 'utf8')).repository
const version = pin.distributionVersion
if (!/^\d+\.\d+\.\d+$/.test(version) || repository !== 'huanlu233/chatboxdav') throw new Error('Invalid release destination')
const tag = `v${version}`
const commit = git(['rev-parse', 'HEAD'], root)
const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000) })
if (response.status === 200) {
  const release = await response.json()
  if (!release.draft || release.target_commitish !== commit) throw new Error('Refusing to overwrite a published release or an unrelated draft')
} else if (response.status === 404) {
  run('gh', ['release', 'create', tag, '--repo', repository, '--draft', '--target', commit, '--title', `ChatboxDAV ${version}`, '--notes', `Android distribution based on Chatbox ${pin.tag} (${pin.commit}). Verified WebDAV/backup tests, upstream unit suites, type checks, native plugin integration and APK signature. Corresponding source and SHA-256 are attached. Not an official Chatbox release. APK installation requires confirmation on your phone. The old test-signed 1.0.1 APK uses a different certificate; back up chats before replacing it.`])
} else throw new Error(`Cannot inspect release: GitHub API ${response.status}`)
run('git', ['archive', '--format=tar.gz', '-o', `dist/ChatboxDAV-${version}-source.tar.gz`, 'HEAD'])
run('gh', ['release', 'upload', tag, '--repo', repository, '--clobber', `dist/ChatboxDAV-${version}-android.apk`, 'dist/SHA256SUMS.txt', 'dist/build.json', `dist/ChatboxDAV-${version}-source.tar.gz`, 'dist/chatbox-upstream-source.tar.gz'])
run('gh', ['release', 'edit', tag, '--repo', repository, '--draft=false', '--latest'])
