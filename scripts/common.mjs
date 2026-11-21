import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { delimiter, dirname, resolve } from 'node:path'
export const root = resolve(import.meta.dirname, '..')
export const upstream = resolve(root, '.build/upstream')
export const manifest = () => JSON.parse(readFileSync(resolve(root, 'upstream.json'), 'utf8'))
export function useReleaseNode() {
  const expected = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim()
  if (process.versions.node !== expected) {
    throw new Error(`This build requires Node ${expected} (.nvmrc); got ${process.versions.node}. Select the release Node before building.`)
  }
  // Direct local invocations by absolute path must also pin pnpm's child processes.
  process.env.PATH = dirname(process.execPath) + delimiter + (process.env.PATH || '')
}
export function run(file, args, cwd = root, extra = {}) {
  return execFileSync(file, args, { cwd, stdio: 'inherit', ...extra })
}
export function git(args, cwd = upstream) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}
export function pnpm(args, cwd = upstream) {
  if (process.env.PNPM_CLI) return run(process.execPath, [process.env.PNPM_CLI, ...args], cwd)
  return run('pnpm', args, cwd)
}
