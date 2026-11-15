import { git, manifest } from './common.mjs'
if (git(['rev-parse', 'HEAD']) !== manifest().commit) throw new Error('Upstream commit changed')
const changes = git(['diff', 'HEAD', '--name-only'])
if (changes) throw new Error(`Forbidden upstream changes:\n${changes}`)
console.log('Upstream tracked source is unchanged.')
