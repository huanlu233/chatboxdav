import { fetchWebDavTransport } from './fetch-transport'
import {
  MAX_PROJECT_BYTES,
  PROJECT_SUFFIX,
  type WebDavConfig,
  WebDavError,
  type WebDavProject,
  type WebDavRequest,
  type WebDavResponse,
  type WebDavTransport,
} from './types'

const DAV = 'DAV:'
const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const PROPERTIES =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getlastmodified/>' +
  '<d:getcontentlength/></d:prop></d:propfind>'

export function validateProjectName(name: string): string {
  const value = name.trim()
  if (!value || value.length > 100 || /[/\\\u0000-\u001f\u007f]/.test(value) || value === '.' || value === '..') {
    throw new WebDavError('Project name must be 1-100 characters without slashes or control characters.')
  }
  return value
}

export function webDavUrls(config: WebDavConfig): { server: URL; directory: URL; directories: URL[] } {
  let server: URL
  try {
    server = new URL(config.serverUrl.trim())
  } catch {
    throw new WebDavError('Enter a valid HTTP or HTTPS WebDAV address.')
  }
  if (
    !['https:', 'http:'].includes(server.protocol) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash
  ) {
    throw new WebDavError('Enter a valid HTTP or HTTPS WebDAV address without credentials, query or fragment.')
  }
  if (!server.pathname.endsWith('/')) server.pathname += '/'
  const parts = config.remotePath.trim().split('/').filter(Boolean)
  if (
    parts.some((part) => part === '.' || part === '..' || /[\\\u0000-\u001f\u007f]/.test(part)) ||
    config.username.includes(':') ||
    /[\r\n]/.test(config.username)
  ) {
    throw new WebDavError('Invalid WebDAV folder or username.')
  }
  let directory = new URL(server)
  const directories = parts.map((part) => {
    directory = new URL(`${encodeURIComponent(part)}/`, directory)
    return new URL(directory)
  })
  return { server, directory, directories }
}

function statusError(status: number): never {
  if (status === 401 || status === 403) throw new WebDavError('WebDAV authentication or permission denied.', status)
  if (status === 404) throw new WebDavError('WebDAV project or folder was not found.', status)
  if (status === 412) throw new WebDavError('A project with this filename already exists. Save again.', status)
  if (status === 507) throw new WebDavError('WebDAV storage is full.', status)
  throw new WebDavError('WebDAV request failed.', status)
}

function property(element: Element, name: string): string | undefined {
  return element.getElementsByTagNameNS(DAV, name)[0]?.textContent?.trim() || undefined
}

export function parseProjectList(xml: string, directory: URL): WebDavProject[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new WebDavError('Invalid WebDAV directory response.')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (
    doc.getElementsByTagName('parsererror').length ||
    doc.documentElement?.namespaceURI !== DAV ||
    doc.documentElement?.localName !== 'multistatus'
  ) {
    throw new WebDavError('Invalid WebDAV directory response.')
  }
  const projects = new Map<string, WebDavProject>()
  for (const response of Array.from(doc.getElementsByTagNameNS(DAV, 'response'))) {
    const href = property(response, 'href')
    if (!href) continue
    const props = Array.from(response.getElementsByTagNameNS(DAV, 'propstat'))
      .filter((entry) => /^HTTP\/[\d.]+ 200(?:\s|$)/.test(property(entry, 'status') ?? ''))
      .flatMap((entry) => Array.from(entry.getElementsByTagNameNS(DAV, 'prop')))
    if (!props.length || props.some((entry) => entry.getElementsByTagNameNS(DAV, 'collection').length)) continue
    try {
      const url = new URL(href, directory)
      const slash = url.pathname.lastIndexOf('/')
      const parent = decodeURIComponent(url.pathname.slice(0, slash + 1))
      const filename = decodeURIComponent(url.pathname.slice(slash + 1))
      if (
        url.origin !== directory.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        parent !== decodeURIComponent(directory.pathname) ||
        !filename.endsWith(PROJECT_SUFFIX) ||
        /[/\\\u0000-\u001f\u007f]/.test(filename)
      ) {
        continue
      }
      const rawSize = props.map((entry) => property(entry, 'getcontentlength')).find(Boolean)
      const size = rawSize === undefined ? undefined : Number(rawSize)
      const modifiedAt = props.map((entry) => property(entry, 'getlastmodified')).find(Boolean)
      projects.set(filename, {
        filename,
        name: filename.slice(0, -PROJECT_SUFFIX.length).replace(/--\d{8}T\d{6}Z-[0-9a-f-]{36}$/i, ''),
        size: size !== undefined && Number.isSafeInteger(size) && size >= 0 ? size : undefined,
        modifiedAt: modifiedAt && Number.isFinite(Date.parse(modifiedAt)) ? modifiedAt : undefined,
      })
    } catch {
      // Ignore malformed or out-of-directory server entries.
    }
  }
  return [...projects.values()].sort(
    (a, b) => Date.parse(b.modifiedAt ?? '') - Date.parse(a.modifiedAt ?? '') || a.name.localeCompare(b.name)
  )
}

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

function redirectTarget(location: string, source: URL): URL {
  let target: URL
  try {
    target = new URL(location, source)
  } catch {
    throw new WebDavError('WebDAV server returned an invalid download redirect.')
  }
  if (
    !['https:', 'http:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.hash ||
    (source.protocol === 'https:' && target.protocol !== 'https:')
  ) {
    throw new WebDavError('WebDAV download redirect was rejected for security reasons.')
  }
  return target
}

export class WebDavClient {
  private readonly urls: ReturnType<typeof webDavUrls>
  private readonly authorization: string

  constructor(
    config: WebDavConfig,
    private readonly transport: WebDavTransport = fetchWebDavTransport
  ) {
    this.urls = webDavUrls(config)
    this.authorization = encodeBasicAuth(config.username, config.password)
  }

  private request(
    url: URL,
    method: WebDavRequest['method'],
    signal?: AbortSignal,
    body?: string,
    headers: Record<string, string> = {},
    maxResponseBytes = 2 * 1024 * 1024,
    includeAuthorization = true
  ): Promise<WebDavResponse> {
    signal?.throwIfAborted()
    return this.transport({
      url: url.href,
      method,
      headers: { ...(includeAuthorization ? { Authorization: this.authorization } : {}), ...headers },
      body,
      signal,
      maxResponseBytes,
    })
  }

  async test(signal?: AbortSignal): Promise<void> {
    const response = await this.request(this.urls.server, 'PROPFIND', signal, PROPERTIES, {
      Depth: '0',
      'Content-Type': 'application/xml; charset=utf-8',
    })
    if (response.status !== 207) statusError(response.status)
    parseProjectList(response.data, this.urls.server)
  }

  async list(signal?: AbortSignal): Promise<WebDavProject[]> {
    const response = await this.request(this.urls.directory, 'PROPFIND', signal, PROPERTIES, {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    })
    if (response.status === 404) return []
    if (response.status !== 207) statusError(response.status)
    return parseProjectList(response.data, this.urls.directory)
  }

  async save(name: string, body: string, signal?: AbortSignal): Promise<WebDavProject> {
    const projectName = validateProjectName(name)
    if (new TextEncoder().encode(body).byteLength > MAX_PROJECT_BYTES) {
      throw new WebDavError('WebDAV project is too large. Select fewer conversations or attachments.')
    }
    for (const directory of this.urls.directories) {
      const created = await this.request(directory, 'MKCOL', signal)
      if (created.status !== 201 && created.status !== 405) statusError(created.status)
    }
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const filename = `${projectName}--${timestamp}-${crypto.randomUUID()}${PROJECT_SUFFIX}`
    const response = await this.request(
      new URL(encodeURIComponent(filename), this.urls.directory),
      'PUT',
      signal,
      body,
      { 'Content-Type': 'application/json; charset=utf-8', 'If-None-Match': '*' }
    )
    if (response.status !== 201 && response.status !== 204 && response.status !== 200) statusError(response.status)
    return { filename, name: projectName }
  }

  async download(project: WebDavProject, signal?: AbortSignal): Promise<string> {
    if (
      !project.filename.endsWith(PROJECT_SUFFIX) ||
      /[/\\\u0000-\u001f\u007f]/.test(project.filename) ||
      (project.size !== undefined && project.size > MAX_PROJECT_BYTES)
    ) {
      throw new WebDavError('Invalid or oversized WebDAV project.')
    }
    const initialUrl = new URL(encodeURIComponent(project.filename), this.urls.directory)
    let url = initialUrl
    let includeAuthorization = true
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await this.request(
        url,
        'GET',
        signal,
        undefined,
        { Accept: 'application/json' },
        MAX_PROJECT_BYTES,
        includeAuthorization
      )
      if (!REDIRECT_STATUSES.has(response.status)) {
        if (response.status !== 200) statusError(response.status)
        return response.data
      }
      if (redirectCount === MAX_REDIRECTS || !response.location) {
        throw new WebDavError('WebDAV download could not be completed after following redirects.', response.status)
      }
      const next = redirectTarget(response.location, url)
      if (next.origin !== url.origin) includeAuthorization = false
      url = next
    }
    throw new WebDavError('WebDAV download redirect limit exceeded.')
  }
}
