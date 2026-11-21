import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { root, manifest } from './common.mjs'
export function compare(a, b) {
  const left = a.replace(/^v/, '').split('.').map(Number)
  const right = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i]
  return 0
}
export function nextRelease(releases, current) {
  return releases.filter(r => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name) && compare(r.tag_name, current) > 0)
    .sort((a, b) => compare(a.tag_name, b.tag_name))[0]
}
export function releaseCandidate(pin, releases, latest, force) {
  // Publication can fail after the verified pin was pushed to main. Finish that
  // version before advancing to another upstream release or version code.
  const pending = latest && compare(pin.distributionVersion, latest.tag_name) > 0
  const next = pending ? undefined : nextRelease(releases, pin.tag)
  return { next, needed: Boolean(pending || next || !latest || force) }
}
async function api(path, allow404 = false) {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 404 && allow404) return null
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`)
  return response.json()
}
async function main() {
  const pin = manifest()
  const releases = await api('repos/chatboxai/chatbox/releases?per_page=100')
  if (releases.length === 100 && !releases.some(r => r.id === pin.releaseId)) throw new Error('Release history exceeds page; manual review required rather than skipping releases')
  const latest = await api('repos/huanlu233/chatboxdav/releases/latest', true)
  const { next, needed } = releaseCandidate(pin, releases, latest, process.env.FORCE_BUILD === 'true')
  const previousTag = pin.tag
  const previousCommit = pin.commit
  if (next) {
    let ref = (await api(`repos/chatboxai/chatbox/git/ref/tags/${encodeURIComponent(next.tag_name)}`)).object
    for (let i = 0; ref.type === 'tag' && i < 5; i++) ref = (await api(`repos/chatboxai/chatbox/git/tags/${ref.sha}`)).object
    if (ref.type !== 'commit' || !/^[a-f0-9]{40}$/.test(ref.sha)) throw new Error('Release does not resolve to a commit')
    pin.tag = next.tag_name
    pin.commit = ref.sha
    pin.releaseId = next.id
  }
  if (needed && latest && compare(pin.distributionVersion, latest.tag_name) <= 0) {
    const parts = latest.tag_name.replace(/^v/, '').split('.').map(Number)
    if (parts.length !== 3 || parts.some(n => !Number.isSafeInteger(n))) throw new Error('Invalid distribution release tag')
    pin.distributionVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`
    pin.versionCode++
  }
  writeFileSync(resolve(root, 'upstream.json'), JSON.stringify(pin, null, 2) + '\n')
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, [
    `needed=${needed}`,
    `version=${pin.distributionVersion}`,
    `upstream_changed=${next ? 'true' : 'false'}`,
    `previous_tag=${previousTag}`,
    `previous_commit=${previousCommit}`,
    '',
  ].join('\n'))
  console.log(JSON.stringify({ needed, upstream: pin.tag, version: pin.distributionVersion, upstreamChanged: !!next, previousTag }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
