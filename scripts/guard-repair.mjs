import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { root } from './common.mjs'
export function repairAllowed(path) {
  if (path.split('/').includes('..') || /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(path)) return false
  return (/^(webdav-module\/(src|android\/src)\/|integration\/renderer\/)/.test(path) || path === 'integration/plugin.mjs') && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
}
function fingerprint() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  return Object.fromEntries(files.map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]))
}
const snapshot = resolve(root, '.build/repair-baseline.json')
if (process.argv[2] === 'snapshot') {
  writeFileSync(snapshot, JSON.stringify(fingerprint()))
} else if (process.argv[2] === 'verify') {
  const before = JSON.parse(readFileSync(snapshot, 'utf8'))
  const after = fingerprint()
  for (const p of Object.keys(before)) if (before[p] !== after[p] && !repairAllowed(p)) throw new Error(`Repair modified protected file: ${p}`)
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  for (const p of untracked) if (!repairAllowed(p)) throw new Error(`Repair added forbidden file: ${p}`)
  for (const p of [...Object.keys(after), ...untracked]) if (lstatSync(resolve(root, p)).isSymbolicLink()) throw new Error(`Source symlink is forbidden: ${p}`)
  console.log('Repair touched only WebDAV production source; tests, workflows and upstream remain protected.')
}
