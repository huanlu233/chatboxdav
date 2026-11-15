import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeProject, encodeProject } from './project'
import { MAX_ARCHIVE_BYTES } from './types'

const { inspect } = vi.hoisted(() => ({ inspect: vi.fn() }))
vi.mock('@chatbox/core/backup-import', () => ({ inspectBackup: inspect }))
const selection = { sessions: true, settings: false, copilots: false, credentials: false }
async function* chunks() {
  yield new Uint8Array([1, 2])
  yield new Uint8Array([3, 4])
}

beforeEach(() => {
  inspect.mockReset().mockResolvedValue({ formatVersion: 3, selection })
})
afterEach(() => vi.restoreAllMocks())

describe('WebDAV project envelope', () => {
  it('roundtrips the exact archive bytes and stores no connection credentials', async () => {
    const encoded = await encodeProject('Renamed project', 2, chunks())
    const decoded = await decodeProject(encoded)
    expect(decoded.name).toBe('Renamed project')
    expect(decoded.sessionCount).toBe(2)
    expect([...new Uint8Array(await decoded.source.arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect(Object.keys(JSON.parse(encoded)).sort()).toEqual([
      'archive',
      'archiveEncoding',
      'archiveSha256',
      'createdAt',
      'format',
      'name',
      'sessionCount',
      'version',
    ])
  })
  it('rejects modified archive contents before inspecting or importing', async () => {
    const value = JSON.parse(await encodeProject('project', 1, chunks()))
    value.archive = 'AAAAAA=='
    await expect(decodeProject(JSON.stringify(value))).rejects.toThrow('integrity')
    expect(inspect).not.toHaveBeenCalled()
  })
  it.each([
    { selection: { ...selection, settings: true } },
    { selection: { ...selection, credentials: true } },
    { selection: { ...selection, copilots: true } },
    { selection: { ...selection, sessions: false } },
    { formatVersion: 2 },
  ])('refuses archives with unexpected categories or format: %j', async (override) => {
    inspect.mockResolvedValue({ formatVersion: 3, selection, ...override })
    await expect(decodeProject(await encodeProject('project', 1, chunks()))).rejects.toThrow('conversations only')
  })
  it('bounds export memory and stops reading when the archive exceeds the mobile limit', async () => {
    const ended = vi.fn()
    async function* oversized() {
      try {
        yield new Uint8Array(MAX_ARCHIVE_BYTES + 1)
      } finally {
        ended()
      }
    }
    await expect(encodeProject('project', 1, oversized())).rejects.toThrow('too large')
    expect(ended).toHaveBeenCalledOnce()
  })
  it.each(['{}', '[]', 'null', 'not json'])('rejects malformed projects: %s', async (text) => {
    await expect(decodeProject(text)).rejects.toThrow()
  })
  it('honors cancellation before export and inspection', async () => {
    await expect(encodeProject('project', 1, chunks(), AbortSignal.abort())).rejects.toThrow()
    await expect(decodeProject('{}', AbortSignal.abort())).rejects.toThrow()
  })
})
