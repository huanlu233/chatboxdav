import type {
  WebDavConfig as WebDavModuleConfig,
  WebDavProject,
  WebDavRequest,
  WebDavResponse,
  WebDavTransport,
} from '@local/webdav-module'

export interface WebDavConfig extends WebDavModuleConfig {
  rememberPassword: boolean
}

export type { WebDavProject, WebDavRequest, WebDavResponse, WebDavTransport }
export { MAX_ARCHIVE_BYTES, MAX_PROJECT_BYTES, PROJECT_SUFFIX, WebDavError } from '@local/webdav-module'
