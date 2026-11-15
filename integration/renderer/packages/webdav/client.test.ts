// @vitest-environment jsdom
import { Base64 } from 'js-base64'
import { describe, expect, it, vi } from 'vitest'
import { parseProjectList, validateProjectName, WebDavClient, webDavUrls } from './client'
import { MAX_PROJECT_BYTES, type WebDavConfig, type WebDavTransport } from './types'

const config: WebDavConfig = {
  serverUrl: 'https://dav.example.com/dav',
  remotePath: 'Chatbox/projects',
  username: 'user',
  password: 'secret',
  rememberPassword: false,
}
const listing = (entries: string) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${entries}</d:multistatus>`
const entry = (href: string, properties = '<d:getcontentlength>123</d:getcontentlength>', status = 200) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${properties}</d:prop>` +
  `<d:status>HTTP/1.1 ${status} OK</d:status></d:propstat></d:response>`

describe('WebDAV addresses and names', () => {
  it('preserves the server base path and encodes folder segments independently', () => {
    const urls = webDavUrls({ ...config, remotePath: 'my folder/\u5bf9\u8bdd' })
    expect(urls.server.href).toBe('https://dav.example.com/dav/')
    expect(urls.directory.href).toBe('https://dav.example.com/dav/my%20folder/%E5%AF%B9%E8%AF%9D/')
  })
  it.each(['ftp://host', 'https://u:p@host', 'https://host?key=secret', 'https://host#x', 'invalid'])(
    'rejects unsafe server address %s',
    (serverUrl) => {
      expect(() => webDavUrls({ ...config, serverUrl })).toThrow()
    }
  )
  it.each(['../escape', 'x/../y', 'x\\y', 'x/\u0000'])('rejects unsafe folder %s', (remotePath) => {
    expect(() => webDavUrls({ ...config, remotePath })).toThrow()
  })
  it.each(['', ' ', '..', '/', 'x\\y', '\u0001', 'x'.repeat(101)])('rejects invalid project name %s', (name) => {
    expect(() => validateProjectName(name)).toThrow()
  })
})

describe('WebDAV project discovery', () => {
  const directory = new URL('https://dav.example.com/dav/Chatbox/projects/')
  it('only returns immediate project files, never external or nested server hrefs', () => {
    const xml = listing(
      [
        entry('/dav/Chatbox/projects/', '<d:resourcetype><d:collection/></d:resourcetype>'),
        entry('/dav/Chatbox/projects/%E4%B8%AD%E6%96%87.chatbox-webdav.json'),
        entry('/dav/Chatbox/projects/ignored.txt'),
        entry('/dav/Chatbox/projects/private.chatbox-webdav.json', '', 403),
        entry('https://attacker.example/a.chatbox-webdav.json'),
        entry('https://user:pass@dav.example.com/dav/Chatbox/projects/a.chatbox-webdav.json'),
        entry('/dav/Chatbox/projects/nested/a.chatbox-webdav.json'),
        entry('/dav/Chatbox/projects/a%2fb.chatbox-webdav.json'),
        entry('/dav/other/a.chatbox-webdav.json'),
      ].join('')
    )
    expect(parseProjectList(xml, directory)).toEqual([
      { filename: '\u4e2d\u6587.chatbox-webdav.json', name: '\u4e2d\u6587', size: 123, modifiedAt: undefined },
    ])
  })
  it('supports alternate namespace prefixes, failed optional properties and deduplicates hrefs', () => {
    const xml = listing(entry('a.chatbox-webdav.json') + entry('a.chatbox-webdav.json'))
      .replaceAll('d:', 'dav:')
      .replace('xmlns:d=', 'xmlns:dav=')
    expect(parseProjectList(xml, directory)).toHaveLength(1)
  })
  it.each(['<html/>', '<d:multistatus xmlns:d="DAV:">', '<!DOCTYPE x><x/>'])('rejects invalid XML', (xml) => {
    expect(() => parseProjectList(xml, directory)).toThrow()
  })
})

describe('WebDAV requests', () => {
  it('tests the server without creating folders or uploading anything', async () => {
    const transport = vi.fn<WebDavTransport>().mockResolvedValue({ status: 207, data: listing('') })
    await new WebDavClient(config, transport).test()
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: 'PROPFIND',
        url: 'https://dav.example.com/dav/',
        headers: expect.objectContaining({ Depth: '0' }),
      })
    )
  })
  it('creates nested folders and saves a Chinese custom name without overwriting existing projects', async () => {
    const transport = vi.fn<WebDavTransport>().mockImplementation(async (request) => ({
      status: request.method === 'MKCOL' ? 405 : 201,
      data: '',
    }))
    const client = new WebDavClient({ ...config, username: '\u7528\u6237', password: 'p:\u5bc6\u7801' }, transport)
    const first = await client.save('\u81ea\u5b9a\u4e49 \u9879\u76ee', '{}')
    const second = await client.save('\u81ea\u5b9a\u4e49 \u9879\u76ee', '{}')
    expect(first.name).toBe('\u81ea\u5b9a\u4e49 \u9879\u76ee')
    expect(first.filename).not.toBe(second.filename)
    expect(transport.mock.calls.slice(0, 3).map(([request]) => request.method)).toEqual(['MKCOL', 'MKCOL', 'PUT'])
    const put = transport.mock.calls[2][0]
    expect(put.headers['If-None-Match']).toBe('*')
    expect(Base64.decode(put.headers.Authorization.slice(6))).toBe('\u7528\u6237:p:\u5bc6\u7801')
    expect(put.url).toContain('%E8%87%AA%E5%AE%9A%E4%B9%89%20%E9%A1%B9%E7%9B%AE')
    expect(put.body).toBe('{}')
  })
  it('treats a missing project folder as an empty list, without mutating the server', async () => {
    const transport = vi.fn<WebDavTransport>().mockResolvedValue({ status: 404, data: '' })
    expect(await new WebDavClient(config, transport).list()).toEqual([])
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('uses the WebDAV module to follow a CDN redirect without forwarding credentials', async () => {
    const transport = vi.fn<WebDavTransport>()
      .mockResolvedValueOnce({ status: 302, data: '', location: 'https://cdn.example.com/project?token=temporary' })
      .mockResolvedValueOnce({ status: 200, data: '{"format":"chatbox-webdav-project"}' })

    const result = await new WebDavClient(config, transport).download({
      filename: 'project.chatbox-webdav.json',
      name: 'project',
    })

    expect(result).toBe('{"format":"chatbox-webdav-project"}')
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[0][0].headers.Authorization).toMatch(/^Basic /)
    expect(transport.mock.calls[1][0]).toMatchObject({
      url: 'https://cdn.example.com/project?token=temporary',
      method: 'GET',
    })
    expect(transport.mock.calls[1][0].headers).not.toHaveProperty('Authorization')
  })
  it.each([401, 403, 507, 500])(
    'reports server status %i without disclosing the password or response body',
    async (status) => {
      const transport = vi.fn<WebDavTransport>().mockResolvedValue({ status, data: 'sensitive server details' })
      const error = await new WebDavClient(config, transport).test().catch((error: Error) => error)
      expect(error).toMatchObject({ status })
      expect(String(error)).not.toContain('secret')
      expect(String(error)).not.toContain('sensitive')
    }
  )
  it.each(['../x.chatbox-webdav.json', 'https://evil/x.chatbox-webdav.json', 'x.zip'])(
    'never downloads unsafe project filename %s',
    async (filename) => {
      const transport = vi.fn<WebDavTransport>()
      await expect(new WebDavClient(config, transport).download({ filename, name: 'x' })).rejects.toThrow()
      expect(transport).not.toHaveBeenCalled()
    }
  )
  it('rejects oversized projects before download and honors an already cancelled operation', async () => {
    const transport = vi.fn<WebDavTransport>()
    const client = new WebDavClient(config, transport)
    await expect(
      client.download({ filename: 'a.chatbox-webdav.json', name: 'a', size: MAX_PROJECT_BYTES + 1 })
    ).rejects.toThrow()
    await expect(client.list(AbortSignal.abort())).rejects.toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
})
