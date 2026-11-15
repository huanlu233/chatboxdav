import type { Exporter } from '@/platform/interfaces'

type Destination = (chunks: AsyncIterable<Uint8Array>, signal: AbortSignal) => Promise<void>
let active: { sink: Destination; used: boolean } | undefined

// Only the backup service's delivery call is routed here by the build hook.
// The original exporter and backup/import implementation remain untouched.
export function webdavExporter(original: Exporter): Pick<Exporter, 'exportStreamingFile'> {
  const current = active
  if (!current || current.used) return original
  current.used = true
  return {
    async exportStreamingFile(_filename, chunks, _mime, signal) {
      if (!signal) throw new Error('Upstream backup cancellation contract changed')
      signal.throwIfAborted()
      await current.sink(chunks(), signal)
      return { boundedMemory: false }
    },
  }
}

export async function withWebDavDestination<T>(sink: Destination, action: () => Promise<T>): Promise<T> {
  if (active) throw new Error('A WebDAV export is already in progress')
  const lease = { sink, used: false }
  active = lease
  try {
    const result = await action()
    if (!lease.used) throw new Error('The WebDAV export hook was not called')
    return result
  } finally {
    active = undefined
  }
}
