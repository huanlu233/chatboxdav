import {
  WebDavClient as WebDavModuleClient,
  parseProjectList,
  validateProjectName,
  webDavUrls,
  type WebDavTransport,
} from '@local/webdav-module'
import type { WebDavConfig } from './types'
import { webDavRequest } from './transport'

export { parseProjectList, validateProjectName, webDavUrls }

export class WebDavClient extends WebDavModuleClient {
  constructor(config: WebDavConfig, transport: WebDavTransport = webDavRequest) {
    super(config, transport)
  }
}
