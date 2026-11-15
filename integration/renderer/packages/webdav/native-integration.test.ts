import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WebDavClient as ModuleClient, WebDavError as ModuleError } from '@local/webdav-module'
import { WebDavClient } from './client'
import { WebDavError, type WebDavConfig } from './types'

const native = vi.hoisted(() => ({ request: vi.fn(), cancel: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: (name: string) => {
    if (name !== 'WebDavHttp') throw new Error('Unexpected native plugin')
    return native
  },
}))

const config: WebDavConfig = {
  serverUrl: 'https://dav.example.test/webdav', remotePath: 'Chatbox/projects',
  username: 'user', password: 'secret', rememberPassword: false,
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

it('routes the app client through the external core and native adapter for CDN downloads', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  native.request
    .mockResolvedValueOnce({ status: 302, data: '', location: 'https://cdn.example.test/project?token=temporary' })
    .mockResolvedValueOnce({ status: 200, data: 'downloaded-project' })
  const client = new WebDavClient(config)
  expect(client).toBeInstanceOf(ModuleClient)
  expect(WebDavError).toBe(ModuleError)
  await expect(client.download({ filename: 'project.chatbox-webdav.json', name: 'project' }))
    .resolves.toBe('downloaded-project')
  expect(native.request).toHaveBeenCalledTimes(2)
  expect(native.request.mock.calls[0][0].headers.Authorization).toMatch(/^Basic /)
  expect(native.request.mock.calls[1][0].headers).not.toHaveProperty('Authorization')
  expect(native.request.mock.calls[1][0].url).toBe('https://cdn.example.test/project?token=temporary')
  expect(fetchSpy).not.toHaveBeenCalled()
})
