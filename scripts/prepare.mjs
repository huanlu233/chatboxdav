import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { root, upstream, manifest, run, git, pnpm } from './common.mjs'
import { hookPaths, transformSource } from '../integration/plugin.mjs'

const pin = manifest()
if (!/^v\d+\.\d+\.\d+$/.test(pin.tag) || !/^[a-f0-9]{40}$/.test(pin.commit) || pin.repository !== 'chatboxai/chatbox') throw new Error('Invalid upstream pin')
mkdirSync(dirname(upstream), { recursive: true })
if (!existsSync(resolve(upstream, '.git'))) run('git', ['clone', '--depth', '1', '--branch', pin.tag, 'https://github.com/chatboxai/chatbox.git', upstream])
if (git(['rev-parse', 'HEAD']) !== pin.commit) throw new Error('Upstream checkout differs from pinned commit; use a fresh .build/upstream directory')
if (git(['diff', 'HEAD', '--name-only'])) throw new Error('Upstream has modified tracked source')
const translations = JSON.parse(readFileSync(resolve(root, 'integration/translations.json'), 'utf8'))
for (const p of hookPaths) transformSource(readFileSync(resolve(upstream, p), 'utf8'), p, translations)

if (!process.argv.includes('--skip-install')) pnpm(['install', '--frozen-lockfile', '--ignore-scripts'])
const localPackage = resolve(upstream, 'node_modules/@local/webdav-module')
mkdirSync(dirname(localPackage), { recursive: true })
if (!existsSync(localPackage)) symlinkSync(resolve(root, 'webdav-module'), localPackage, process.platform === 'win32' ? 'junction' : 'dir')
if (realpathSync(localPackage) !== realpathSync(resolve(root, 'webdav-module'))) throw new Error('WebDAV module link points outside this distribution')
const moduleDependencies = resolve(root, 'webdav-module/node_modules')
if (!existsSync(moduleDependencies)) symlinkSync(resolve(upstream, 'node_modules'), moduleDependencies, process.platform === 'win32' ? 'junction' : 'dir')
const owned = ['packages/webdav', 'components/settings/WebDavControls.tsx', 'components/settings/WebDavProjectDialog.tsx', 'components/settings/WebDavProjectDialog.test.tsx', 'modals/WebDavSave.tsx']
for (const p of owned) {
  const dest = resolve(upstream, 'src/renderer', p)
  if (git(['ls-files', '--', `src/renderer/${p}`])) throw new Error(`Upstream now owns extension path: ${p}`)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(resolve(root, 'integration/renderer', p), dest, { recursive: true })
}
const plugin = JSON.stringify(resolve(root, 'integration/plugin.mjs').replaceAll('\\', '/'))
const distRoot = JSON.stringify(root.replaceAll('\\', '/'))
writeFileSync(resolve(upstream, 'chatboxdav.vite.config.ts'), `import base from './electron.vite.config'
import { webdavIntegration } from ${plugin}
export default async (env: any) => {
  const config = typeof base === 'function' ? await base(env) : await base
  if (!config.renderer) throw new Error('Upstream renderer build contract changed')
  config.renderer.plugins = [webdavIntegration(process.cwd(), ${distRoot}), ...(config.renderer.plugins || [])]
  return config
}
`)
writeFileSync(resolve(upstream, 'chatboxdav.vitest.config.ts'), `import base from './vitest.config'
import { webdavIntegration } from ${plugin}
export default async (env: any) => {
  const config = typeof base === 'function' ? await base(env) : await base
  config.plugins = [webdavIntegration(process.cwd(), ${distRoot}), ...(config.plugins || [])]
  return config
}
`)
const pkg = JSON.parse(readFileSync(resolve(upstream, 'package.json'), 'utf8'))
const dist = JSON.parse(readFileSync(resolve(root, 'distribution.json'), 'utf8'))
const plugins = [...new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}), '@local/webdav-module'])]
if (git(['ls-files', '--', 'capacitor.config.json', 'capacitor.config.ts', 'android']).length) throw new Error('Upstream now owns the native distribution; adapter review required')
writeFileSync(resolve(upstream, 'capacitor.config.json'), JSON.stringify({ appId: dist.appId, appName: dist.appName, webDir: 'release/app/dist/renderer', server: { androidScheme: 'https' }, android: { allowMixedContent: false }, includePlugins: plugins }, null, 2))
console.log(`Prepared ${pin.tag} without changing any upstream tracked source.`)
