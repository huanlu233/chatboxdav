import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { root, upstream, run } from './common.mjs'
const require = createRequire(resolve(upstream, 'package.json'))
const entry = require.resolve('electron/package.json')
const installer = resolve(entry, '..', 'install.js')
delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD
run(process.execPath, [installer], upstream)
