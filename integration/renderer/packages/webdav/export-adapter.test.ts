import { expect, it, vi } from 'vitest'
import type { Exporter } from '@/platform/interfaces'
import { webdavExporter, withWebDavDestination } from './export-adapter'
it('leaves ordinary exports alone', () => {
  const original = {} as Exporter
  expect(webdavExporter(original)).toBe(original)
})
it('restores ordinary export after failures and rejects missing hooks', async () => {
  const original = {} as Exporter
  await expect(withWebDavDestination(vi.fn(), async () => { throw new Error('fail') })).rejects.toThrow('fail')
  expect(webdavExporter(original)).toBe(original)
  await expect(withWebDavDestination(vi.fn(), async () => 1)).rejects.toThrow('hook was not called')
  expect(webdavExporter(original)).toBe(original)
})
it('uses the upstream cancellation signal and never mutates its exporter', async () => {
  const original = { exportStreamingFile: vi.fn() } as unknown as Exporter
  const sink = vi.fn()
  const signal = new AbortController().signal
  await withWebDavDestination(sink, () => webdavExporter(original).exportStreamingFile('backup.zip', async function* () { yield new Uint8Array([1]) }, 'application/zip', signal))
  expect(sink).toHaveBeenCalledWith(expect.anything(), signal)
  expect(original.exportStreamingFile).not.toHaveBeenCalled()
  expect(webdavExporter(original)).toBe(original)
})
