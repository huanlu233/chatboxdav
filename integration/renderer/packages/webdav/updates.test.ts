import { expect, it } from 'vitest'
import { releaseIsNewer, RELEASES_URL } from './updates'
const release = { tag_name: 'v1.0.3', assets: [{ name: 'ChatboxDAV-1.0.3-android.apk' }] }
it('checks only newer stable installable distribution releases', () => {
  expect(releaseIsNewer(release, '1.0.2')).toBe(true)
  expect(releaseIsNewer(release, '1.0.3')).toBe(false)
  expect(releaseIsNewer(release, '1.0.4')).toBe(false)
  expect(releaseIsNewer({ ...release, prerelease: true }, '1.0.2')).toBe(false)
  expect(releaseIsNewer({ ...release, draft: true }, '1.0.2')).toBe(false)
  expect(releaseIsNewer({ ...release, assets: [] }, '1.0.2')).toBe(false)
  expect(releaseIsNewer({ ...release, tag_name: 'bad-version' }, '1.0.2')).toBe(false)
  expect(releaseIsNewer(release, 'unknown')).toBe(false)
  expect(RELEASES_URL).toContain('/huanlu233/chatboxdav/')
})
