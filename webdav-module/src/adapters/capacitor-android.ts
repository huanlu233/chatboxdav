import { WebDavError, type WebDavRequest, type WebDavResponse, type WebDavTransport } from '../core/types'

export interface WebDavHttpPlugin {
  request(options: Omit<WebDavRequest, 'signal'> & { id: string }): Promise<WebDavResponse>
  cancel(options: { id: string }): Promise<void>
}

export function createCapacitorWebDavTransport(plugin: WebDavHttpPlugin): WebDavTransport {
  return async (request) => {
    request.signal?.throwIfAborted()
    const id = crypto.randomUUID()
    let rejectInterrupted!: (reason: Error) => void
    const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject })
    const cancel = () => {
      void plugin.cancel({ id }).catch(() => undefined)
      rejectInterrupted(new DOMException('WebDAV operation cancelled.', 'AbortError'))
    }
    request.signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => {
      void plugin.cancel({ id }).catch(() => undefined)
      rejectInterrupted(new WebDavError('WebDAV request timed out.'))
    }, 120_000)
    try {
      const { signal: _signal, ...options } = request
      const response = await Promise.race([plugin.request({ ...options, id }), interrupted])
      request.signal?.throwIfAborted()
      return response
    } catch (error) {
      request.signal?.throwIfAborted()
      if (error instanceof WebDavError) throw error
      if (error && typeof error === 'object' && 'code' in error && error.code === 'SIZE_LIMIT') {
        throw new WebDavError('WebDAV response is too large.')
      }
      throw new WebDavError('Could not connect to WebDAV. Check the address, network and server permissions.')
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', cancel)
    }
  }
}
