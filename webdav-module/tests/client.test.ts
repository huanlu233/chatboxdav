import { describe, expect, it, vi } from 'vitest'
import { WebDavClient } from '../src/core/client'
import { MAX_PROJECT_BYTES, type WebDavConfig, type WebDavTransport } from '../src/core/types'

const config: WebDavConfig = {
  serverUrl: 'https://webdav.example.test/webdav',
  remotePath: 'Chatbox',
  username: 'user',
  password: 'secret',
}

describe('WebDAV downloads', () => {
  it.each([301, 302, 303, 307, 308])('resolves relative redirects with status %i', async (status) => {
    const transport = vi.fn<WebDavTransport>()
      .mockResolvedValueOnce({ status, data: '', location: './resolved' })
      .mockResolvedValueOnce({ status: 200, data: 'project' })
    await expect(new WebDavClient(config, transport).download({ filename: 'p.chatbox-webdav.json', name: 'p' }))
      .resolves.toBe('project')
    expect(transport.mock.calls[1][0].url).toBe('https://webdav.example.test/webdav/Chatbox/resolved')
    expect(transport.mock.calls[1][0].headers.Authorization).toMatch(/^Basic /)
  })

  it('does not restore credentials after a CDN redirects back to the server', async () => {
    const transport = vi.fn<WebDavTransport>()
      .mockResolvedValueOnce({ status: 302, data: '', location: 'https://cdn.example.test/file' })
      .mockResolvedValueOnce({ status: 302, data: '', location: 'https://webdav.example.test/final' })
      .mockResolvedValueOnce({ status: 200, data: 'project' })
    await new WebDavClient(config, transport).download({ filename: 'p.chatbox-webdav.json', name: 'p' })
    expect(transport.mock.calls[2][0].headers).not.toHaveProperty('Authorization')
  })

  it('stops before the next hop when the operation is cancelled', async () => {
    const controller = new AbortController()
    const transport = vi.fn<WebDavTransport>().mockImplementation(async () => {
      controller.abort()
      return { status: 302, data: '', location: 'https://cdn.example.test/file' }
    })
    await expect(new WebDavClient(config, transport).download({ filename: 'p.chatbox-webdav.json', name: 'p' }, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(transport).toHaveBeenCalledOnce()
  })

  it('follows a CDN redirect and strips Basic auth before crossing origins', async () => {
    const transport = vi.fn<WebDavTransport>()
      .mockResolvedValueOnce({ status: 302, data: '', location: 'https://cdn.example.test/file?token=temporary' })
      .mockResolvedValueOnce({ status: 200, data: '{"archive":"ok"}' })

    const result = await new WebDavClient(config, transport).download({
      filename: 'project.chatbox-webdav.json',
      name: 'project',
    })

    expect(result).toBe('{"archive":"ok"}')
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[0][0].headers.Authorization).toMatch(/^Basic /)
    expect(transport.mock.calls[1][0]).toMatchObject({
      url: 'https://cdn.example.test/file?token=temporary',
      method: 'GET',
      maxResponseBytes: MAX_PROJECT_BYTES,
      headers: { Accept: 'application/json' },
    })
    expect(transport.mock.calls[1][0].headers).not.toHaveProperty('Authorization')
  })

  it('rejects HTTPS-to-HTTP redirects without making the second request', async () => {
    const transport = vi.fn<WebDavTransport>().mockResolvedValue({
      status: 302,
      data: '',
      location: 'http://cdn.example.test/file',
    })
    await expect(
      new WebDavClient(config, transport).download({ filename: 'project.chatbox-webdav.json', name: 'project' })
    ).rejects.toThrow('rejected for security')
    expect(transport).toHaveBeenCalledOnce()
  })

  it('rejects redirects containing URL credentials and enforces a hop limit', async () => {
    const credentialRedirect = vi.fn<WebDavTransport>().mockResolvedValue({
      status: 302,
      data: '',
      location: 'https://user:password@cdn.example.test/file',
    })
    await expect(
      new WebDavClient(config, credentialRedirect).download({ filename: 'project.chatbox-webdav.json', name: 'project' })
    ).rejects.toThrow('rejected for security')
    expect(credentialRedirect).toHaveBeenCalledOnce()

    const loop = vi.fn<WebDavTransport>().mockImplementation(async ({ url }) => ({
      status: 302,
      data: '',
      location: new URL(url).href,
    }))
    await expect(
      new WebDavClient(config, loop).download({ filename: 'project.chatbox-webdav.json', name: 'project' })
    ).rejects.toThrow('redirects')
    expect(loop).toHaveBeenCalledTimes(6)
    expect(loop.mock.calls.at(-1)?.[0].headers.Authorization).toMatch(/^Basic /)
  })
})
