import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { root, upstream, manifest, pnpm, run, useReleaseNode } from './common.mjs'
useReleaseNode()
const pin = manifest()
if (!/^\d+\.\d+\.\d+$/.test(pin.distributionVersion) || !Number.isSafeInteger(pin.versionCode) || pin.versionCode < 3 || pin.versionCode > 2100000000) throw new Error('Invalid Android version')
process.env.CHATBOX_BUILD_TARGET = 'mobile_app'
process.env.CHATBOX_BUILD_PLATFORM = 'android'
process.env.CHATBOX_ELECTRON_VITE_TARGET = 'renderer'
process.env.NODE_ENV = 'production'
pnpm(['exec', 'electron-vite', 'build', '--config', 'chatboxdav.vite.config.ts'])
if (!existsSync(resolve(upstream, 'android'))) pnpm(['exec', 'cap', 'add', 'android'])
pnpm(['exec', 'cap', 'sync', 'android'])
const gradle = resolve(upstream, 'android/app/build.gradle')
let text = readFileSync(gradle, 'utf8')
text = text.replace(/versionCode \d+/, `versionCode ${pin.versionCode}`).replace(/versionName "[^"]+"/, `versionName "${pin.distributionVersion}"`)
writeFileSync(gradle, text)
const xml = resolve(upstream, 'android/app/src/main/AndroidManifest.xml')
text = readFileSync(xml, 'utf8').replace('android:allowBackup="true"', 'android:allowBackup="false"')
// Preserve the original distribution's explicit HTTP/LAN endpoint support.
if (!text.includes('android:usesCleartextTraffic=')) text = text.replace('android:allowBackup="false"', 'android:allowBackup="false" android:usesCleartextTraffic="true"')
writeFileSync(xml, text)
const registered = JSON.parse(readFileSync(resolve(upstream, 'android/app/src/main/assets/capacitor.plugins.json'), 'utf8'))
if (registered.filter(p => p.classpath === 'local.webdav.android.WebDavHttpPlugin').length !== 1) throw new Error('Native WebDAV plugin is missing or registered twice')
const android = resolve(upstream, 'android')
run(process.platform === 'win32' ? 'cmd.exe' : './gradlew', process.platform === 'win32' ? ['/d', '/c', 'gradlew.bat', 'assembleRelease', '--no-daemon'] : ['assembleRelease', '--no-daemon'], android)
run(process.execPath, ['scripts/verify-upstream.mjs'])
mkdirSync(resolve(root, 'dist'), { recursive: true })
const apk = `ChatboxDAV-${pin.distributionVersion}-android-unsigned.apk`
cpSync(resolve(android, 'app/build/outputs/apk/release/app-release-unsigned.apk'), resolve(root, 'dist', apk))
writeFileSync(resolve(root, 'dist/build.json'), JSON.stringify({ ...pin, apk, sha256: createHash('sha256').update(readFileSync(resolve(root, 'dist', apk))).digest('hex') }, null, 2))
run(process.execPath, ['scripts/verify-apk.mjs'])
console.log(`Built ${apk}. Signing is a separate release stage.`)
