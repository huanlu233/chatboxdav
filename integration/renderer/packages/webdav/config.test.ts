import { beforeEach, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({ getStoreValue: vi.fn(), setStoreValue: vi.fn(), delStoreValue: vi.fn() }))
vi.mock('@/platform', () => ({ default: storage }))
import { emptyWebDavConfig, forgetWebDavConfig, loadWebDavConfig, saveWebDavConfig } from './config'

beforeEach(async () => {
  await forgetWebDavConfig()
  vi.clearAllMocks()
  storage.getStoreValue.mockResolvedValue(undefined)
})

it('keeps an unremembered password only in memory, outside exported application settings', async () => {
  const config = { ...emptyWebDavConfig, serverUrl: 'https://example.com/dav/', password: 'secret' }
  await saveWebDavConfig(config)
  expect(storage.setStoreValue).toHaveBeenCalledWith('webdav-connection-v1', { ...config, password: '' })
  storage.getStoreValue.mockResolvedValue({ ...config, password: '' })
  expect((await loadWebDavConfig()).password).toBe('secret')
})

it('removes a previously remembered password when remembering is switched off', async () => {
  const config = {
    ...emptyWebDavConfig,
    serverUrl: 'https://example.com/dav/',
    password: 'secret',
    rememberPassword: true,
  }
  await saveWebDavConfig(config)
  expect(storage.setStoreValue).toHaveBeenLastCalledWith('webdav-connection-v1', config)
  await saveWebDavConfig({ ...config, rememberPassword: false })
  expect(storage.setStoreValue).toHaveBeenLastCalledWith('webdav-connection-v1', {
    ...config,
    password: '',
    rememberPassword: false,
  })
  await forgetWebDavConfig()
  expect(storage.delStoreValue).toHaveBeenCalledWith('webdav-connection-v1')
  expect(await loadWebDavConfig()).toEqual(emptyWebDavConfig)
})
