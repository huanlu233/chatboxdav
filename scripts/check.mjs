import { root, upstream, run, pnpm } from './common.mjs'
import { resolve } from 'node:path'
run(process.execPath, ['--test', 'tests/pipeline.test.mjs'])
pnpm(['exec', 'vitest', 'run', '--config', 'chatboxdav.vitest.config.ts', 'src/renderer/packages/webdav', 'src/renderer/components/settings/WebDavProjectDialog.test.tsx', 'src/renderer/app/renderer-backup.test.ts', 'packages/chatbox-core/src/backup-export', 'packages/chatbox-core/src/backup-import', 'packages/chatbox-core/src/backup-host', 'packages/chatbox-core/src/backup-v3', '--maxWorkers=2'])
run(process.execPath, [resolve(upstream, 'node_modules/vitest/vitest.mjs'), 'run', '--maxWorkers=2'], resolve(root, 'webdav-module'))
pnpm(['run', 'check'])
run(process.execPath, [resolve(upstream, 'node_modules/typescript/bin/tsc'), '--noEmit'], resolve(root, 'webdav-module'))
run(process.execPath, ['scripts/verify-upstream.mjs'])
