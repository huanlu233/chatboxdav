import { WebDavError, type WebDavRequest, type WebDavResponse, type WebDavTransport } from './types'

export const fetchWebDavTransport: WebDavTransport = async (request: WebDavRequest): Promise<WebDavResponse> => {
  request.signal?.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort()
  request.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 120_000)
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
    })
    const reader = response.body?.getReader()
    if (!reader) {
      return { status: response.status, data: '', location: response.headers.get('Location') ?? undefined }
    }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let data = ''
    let bytes = 0
    try {
      while (true) {
        const entry = await reader.read()
        if (entry.done) break
        bytes += entry.value.byteLength
        if (bytes > request.maxResponseBytes) throw new WebDavError('WebDAV response is too large.')
        data += decoder.decode(entry.value, { stream: true })
      }
      data += decoder.decode()
      return { status: response.status, data, location: response.headers.get('Location') ?? undefined }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  } catch (error) {
    if (controller.signal.aborted) {
      if (request.signal?.aborted) throw new DOMException('WebDAV operation cancelled.', 'AbortError')
      throw new WebDavError('WebDAV request timed out.')
    }
    if (error instanceof WebDavError) throw error
    throw new WebDavError('Could not connect to WebDAV. Check the address, network and server permissions.')
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', abort)
  }
}
