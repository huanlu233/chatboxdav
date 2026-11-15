import platform from '@/platform'
import { webDavUrls } from './client'
import type { WebDavConfig } from './types'

const CONFIG_KEY = 'webdav-connection-v1'
let sessionPassword: string | undefined

export const emptyWebDavConfig: WebDavConfig = {
  serverUrl: '',
  remotePath: 'Chatbox',
  username: '',
  password: '',
  rememberPassword: false,
}

export async function loadWebDavConfig(): Promise<WebDavConfig> {
  const stored = await platform.getStoreValue(CONFIG_KEY)
  if (!stored || typeof stored !== 'object') return { ...emptyWebDavConfig }
  return {
    serverUrl: typeof stored.serverUrl === 'string' ? stored.serverUrl : '',
    remotePath: typeof stored.remotePath === 'string' ? stored.remotePath : 'Chatbox',
    username: typeof stored.username === 'string' ? stored.username : '',
    password: sessionPassword ?? (typeof stored.password === 'string' ? stored.password : ''),
    rememberPassword: stored.rememberPassword === true,
  }
}

export async function saveWebDavConfig(config: WebDavConfig): Promise<void> {
  webDavUrls(config)
  await platform.setStoreValue(CONFIG_KEY, {
    ...config,
    serverUrl: config.serverUrl.trim(),
    remotePath: config.remotePath.trim(),
    password: config.rememberPassword ? config.password : '',
  })
  sessionPassword = config.password
}

export async function forgetWebDavConfig(): Promise<void> {
  await platform.delStoreValue(CONFIG_KEY)
  sessionPassword = undefined
}
