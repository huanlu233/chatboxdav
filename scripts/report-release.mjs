import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const title = 'ChatboxDAV release blocked'
export function reportRelease({ build, publish, repo, runUrl }, gh) {
  const failures = [['build', build], ['publish', publish]].filter(([, result]) => result === 'failure')
  const completed = build === 'success' && publish === 'success'
  if (!failures.length && !completed) return

  // The REST creator filter also finds legacy reports. Exclude pull requests
  // and match the exact title so unrelated issues are left alone.
  const numbers = gh('api', '--paginate', 'repos/' + repo + '/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100',
    '--jq', '.[] | select(.pull_request == null and .user.login == "github-actions[bot]" and .title == "ChatboxDAV release blocked") | .number')
    .trim().split(String.fromCharCode(10)).map(value => value.trim()).filter(Boolean)
  if (!failures.length) {
    for (const n of numbers) gh('issue', 'close', n, '--repo', repo, '--reason', 'completed', '--comment', 'Release published successfully: ' + runUrl)
    return
  }
  const body = 'Release blocked in ' + failures.map(([job]) => job).join(', ') + '. See the failed run: ' + runUrl
  if (numbers.length) gh('issue', 'edit', numbers[0], '--repo', repo, '--body', body)
  else gh('issue', 'create', '--repo', repo, '--title', title, '--body', body)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  reportRelease({ build: process.env.BUILD_RESULT, publish: process.env.PUBLISH_RESULT,
    repo: process.env.GITHUB_REPOSITORY, runUrl: process.env.RUN_URL },
  (...args) => execFileSync('gh', args, { encoding: 'utf8' }))
}
