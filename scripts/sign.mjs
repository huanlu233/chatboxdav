import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { root, run } from './common.mjs'
const build = JSON.parse(readFileSync(resolve(root, 'dist/build.json'), 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(build.distributionVersion)) throw new Error('Invalid build version')
const unsigned = resolve(root, 'dist', `ChatboxDAV-${build.distributionVersion}-android-unsigned.apk`)
if (createHash('sha256').update(readFileSync(unsigned)).digest('hex') !== build.sha256) throw new Error('Unsigned APK digest mismatch')
for (const name of ['SIGNING_KEYSTORE', 'SIGNING_ALIAS', 'SIGNING_STORE_PASSWORD', 'SIGNING_KEY_PASSWORD']) if (!process.env[name]) throw new Error(`Missing ${name}; release signing cannot use an ephemeral debug key`)
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdk) throw new Error('ANDROID_HOME is required')
const tools = resolve(sdk, 'build-tools', process.env.ANDROID_BUILD_TOOLS || '35.0.0')
const aligned = resolve(root, 'dist/aligned.apk')
const name = `ChatboxDAV-${build.distributionVersion}-android.apk`
const output = resolve(root, 'dist', name)
run(resolve(tools, process.platform === 'win32' ? 'zipalign.exe' : 'zipalign'), ['-f', '-p', '4', unsigned, aligned])
run('java', ['-jar', resolve(tools, 'lib/apksigner.jar'), 'sign', '--ks', process.env.SIGNING_KEYSTORE, '--ks-key-alias', process.env.SIGNING_ALIAS, '--ks-pass', 'env:SIGNING_STORE_PASSWORD', '--key-pass', 'env:SIGNING_KEY_PASSWORD', '--out', output, aligned])
run('java', ['-jar', resolve(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', output])
run(resolve(tools, process.platform === 'win32' ? 'zipalign.exe' : 'zipalign'), ['-c', '-p', '4', output])
const badging = execFileSync(resolve(tools, process.platform === 'win32' ? 'aapt.exe' : 'aapt'), ['dump', 'badging', output], { encoding: 'utf8' })
if (!badging.includes("package: name='xyz.chatboxapp.ce.webdav'") || !badging.includes(`versionCode='${build.versionCode}'`) || !badging.includes(`versionName='${build.distributionVersion}'`)) throw new Error('Signed APK identity/version differs from verified build manifest')
writeFileSync(resolve(root, 'dist/SHA256SUMS.txt'), `${createHash('sha256').update(readFileSync(output)).digest('hex')}  ${name}\n`)
console.log(`Signed and verified ${name}`)
