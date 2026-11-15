import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  createCapacitorWebDavTransport,
  fetchWebDavTransport,
  type WebDavHttpPlugin,
} from '@local/webdav-module'
import type { WebDavRequest, WebDavResponse, WebDavTransport } from './types'

const native = registerPlugin<WebDavHttpPlugin>('WebDavHttp')
const nativeTransport = createCapacitorWebDavTransport(native)

export const webDavRequest: WebDavTransport = (request: WebDavRequest): Promise<WebDavResponse> => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return nativeTransport(request)
  }
  return fetchWebDavTransport(request)
}
