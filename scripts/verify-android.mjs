import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { root } from './common.mjs'

const gradle = readFileSync(resolve(root, 'webdav-module/android/build.gradle'), 'utf8')
const value = name => {
  const match = gradle.match(new RegExp(`\\b${name}\\s+(\\d+)`))
  if (!match) throw new Error(`Android ${name} is not declared`)
  return Number(match[1])
}
const compileSdk = value('compileSdk')
const minSdk = value('minSdk')
const targetSdk = value('targetSdk')
if (minSdk < 23) throw new Error(`Unsupported WebDAV Android minimum API: ${minSdk}`)
if (targetSdk < minSdk) throw new Error(`Android target SDK ${targetSdk} is below minimum API ${minSdk}`)
if (compileSdk < targetSdk) throw new Error(`Android compile SDK ${compileSdk} is below target SDK ${targetSdk}`)
console.log(JSON.stringify({ compileSdk, minSdk, targetSdk, supported: `Android API ${minSdk}+` }))
