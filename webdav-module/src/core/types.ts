export interface WebDavConfig {
  serverUrl: string
  remotePath: string
  username: string
  password: string
}

export interface WebDavProject {
  filename: string
  name: string
  modifiedAt?: string
  size?: number
}

export interface WebDavRequest {
  url: string
  method: 'PROPFIND' | 'MKCOL' | 'PUT' | 'GET'
  headers: Record<string, string>
  body?: string
  maxResponseBytes: number
  signal?: AbortSignal
}

export interface WebDavResponse {
  status: number
  data: string
  location?: string
}

export type WebDavTransport = (request: WebDavRequest) => Promise<WebDavResponse>

export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
export const MAX_PROJECT_BYTES = 48 * 1024 * 1024
export const PROJECT_SUFFIX = '.chatbox-webdav.json'

export class WebDavError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly conversationNames?: readonly string[]
  ) {
    super(message)
    this.name = 'WebDavError'
  }
}
