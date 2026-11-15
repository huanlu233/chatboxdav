import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { root, upstream, manifest } from './common.mjs'
const require = createRequire(resolve(upstream, 'package.json'))
const { unzipSync, strFromU8 } = require('fflate')
const version = manifest().distributionVersion
const path = process.argv[2] || resolve(root, 'dist', `ChatboxDAV-${version}-android-unsigned.apk`)
const archive = unzipSync(readFileSync(path))
const plugins = JSON.parse(strFromU8(archive['assets/capacitor.plugins.json']))
if (plugins.filter(p => p.classpath === 'local.webdav.android.WebDavHttpPlugin').length !== 1) throw new Error('APK must register the external WebDAV plugin exactly once')
const dex = Object.entries(archive).filter(([name]) => /^classes\d*\.dex$/.test(name)).map(([, data]) => Buffer.from(data).toString('latin1')).join('')
if (!dex.includes('Llocal/webdav/android/WebDavHttpPlugin;')) throw new Error('External WebDAV native class is missing from APK')
if (dex.includes('Lxyz/chatboxapp/ce/webdav/WebDavHttpPlugin;')) throw new Error('Obsolete app-local WebDAV plugin is still packaged')
const js = Object.entries(archive).filter(([name]) => name.startsWith('assets/public/') && name.endsWith('.js')).map(([, data]) => strFromU8(data)).join('\n')
if (!js.includes('api.github.com/repos/huanlu233/chatboxdav/releases/latest')) throw new Error('Distribution update checker is not bundled')
if (!js.includes('https://github.com/huanlu233/chatboxdav/releases/latest')) throw new Error('Distribution update link is not bundled')
if (js.includes('/redirect_app/check_update/')) throw new Error('An upstream update link is still bundled')
console.log('APK verified: distribution update endpoints and one external native WebDAV plugin.')
