import { run, pnpm, useReleaseNode } from './common.mjs'
useReleaseNode()
run(process.execPath, ['scripts/check.mjs'])
pnpm(['run', 'test:unit', '--maxWorkers=2', '--bail=1'])
run(process.execPath, ['scripts/build.mjs'])
