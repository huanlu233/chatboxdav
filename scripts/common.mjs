import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
export const root = resolve(import.meta.dirname, '..')
export const upstream = resolve(root, '.build/upstream')
export const manifest = () => JSON.parse(readFileSync(resolve(root, 'upstream.json'), 'utf8'))
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
