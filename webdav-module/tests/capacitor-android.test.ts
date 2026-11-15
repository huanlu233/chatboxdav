import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCapacitorWebDavTransport, type WebDavHttpPlugin } from '../src/adapters/capacitor-android'
import { WebDavError, type WebDavRequest } from '../src/core/types'

const request: WebDavRequest = {
  url: 'https://dav.example.test/project.chatbox-webdav.json',
  method: 'GET',
  headers: { Authorization: 'Basic test' },
  maxResponseBytes: 1024,
}

afterEach(() => vi.useRealTimers())

describe('Capacitor WebDAV transport', () => {
  it('returns native redirect metadata to the core without following it', async () => {
    const response = { status: 302, data: '', location: 'https://cdn.example.test/project' }
    const plugin: WebDavHttpPlugin = { request: vi.fn().mockResolvedValue(response), cancel: vi.fn() }
    expect(await createCapacitorWebDavTransport(plugin)(request)).toEqual(response)
    expect(plugin.request).toHaveBeenCalledExactlyOnceWith({ ...request, id: expect.any(String) })
    expect(plugin.cancel).not.toHaveBeenCalled()
  })

  it('does not start a native request after cancellation', async () => {
    const plugin: WebDavHttpPlugin = { request: vi.fn(), cancel: vi.fn() }
    await expect(createCapacitorWebDavTransport(plugin)({ ...request, signal: AbortSignal.abort() }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(plugin.request).not.toHaveBeenCalled()
  })

  it('cancels the matching native request and stops waiting even if the plugin does not settle', async () => {
    const controller = new AbortController()
    const plugin = { request: vi.fn<WebDavHttpPlugin['request']>(() => new Promise<never>(() => {})), cancel: vi.fn().mockResolvedValue(undefined) }
    const result = createCapacitorWebDavTransport(plugin)({ ...request, signal: controller.signal })
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(plugin.cancel).toHaveBeenCalledExactlyOnceWith({ id: plugin.request.mock.calls[0][0].id })
  })

  it('bounds native requests with a timeout and cleans up the timer', async () => {
    vi.useFakeTimers()
    const plugin: WebDavHttpPlugin = { request: vi.fn(() => new Promise<never>(() => {})), cancel: vi.fn().mockResolvedValue(undefined) }
    const result = createCapacitorWebDavTransport(plugin)(request)
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    expect(plugin.cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps size errors and hides native error details', async () => {
    const plugin: WebDavHttpPlugin = { request: vi.fn().mockRejectedValue({ code: 'SIZE_LIMIT', message: 'private details' }), cancel: vi.fn() }
    await expect(createCapacitorWebDavTransport(plugin)(request)).rejects.toThrow('too large')
    plugin.request = vi.fn().mockRejectedValue(new Error('private details'))
    const error = await createCapacitorWebDavTransport(plugin)(request).catch((error) => error)
    expect(error).toBeInstanceOf(WebDavError)
    expect(String(error)).not.toContain('private details')
  })
})
