import { inspectBackup } from '@chatbox/core/backup-import'
import { Base64 } from 'js-base64'
import { MAX_ARCHIVE_BYTES, MAX_PROJECT_BYTES, WebDavError } from './types'
import { validateProjectName } from './client'

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function encodeProject(
  name: string,
  sessionCount: number,
  chunks: AsyncIterable<Uint8Array>,
  signal?: AbortSignal
): Promise<string> {
  const projectName = validateProjectName(name)
  const parts: Uint8Array[] = []
  let size = 0
  for await (const chunk of chunks) {
    signal?.throwIfAborted()
    size += chunk.byteLength
    if (size > MAX_ARCHIVE_BYTES) {
      throw new WebDavError('WebDAV project is too large. Select fewer conversations or attachments.')
    }
    parts.push(chunk.slice())
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  signal?.throwIfAborted()
  return JSON.stringify({
    format: 'chatbox-webdav-project',
    version: 1,
    name: projectName,
    createdAt: new Date().toISOString(),
    sessionCount,
    archiveEncoding: 'base64',
    archiveSha256: await sha256(bytes),
    archive: Base64.fromUint8Array(bytes),
  })
}

export async function decodeProject(
  text: string,
  signal?: AbortSignal
): Promise<{ name: string; source: Blob; sessionCount: number }> {
  signal?.throwIfAborted()
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) {
    throw new WebDavError('Invalid or oversized WebDAV project.')
  }
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new WebDavError('Invalid WebDAV project format.')
  }
  if (
    !value ||
    value.format !== 'chatbox-webdav-project' ||
    value.version !== 1 ||
    typeof value.name !== 'string' ||
    !Number.isSafeInteger(value.sessionCount) ||
    value.sessionCount < 1 ||
    typeof value.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    value.archiveEncoding !== 'base64' ||
    typeof value.archive !== 'string' ||
    value.archive.length > Math.ceil(MAX_ARCHIVE_BYTES / 3) * 4 ||
    value.archive.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(value.archive) ||
    (value.archive.indexOf('=') !== -1 && value.archive.indexOf('=') < value.archive.length - 2) ||
    typeof value.archiveSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.archiveSha256)
  ) {
    throw new WebDavError('Invalid WebDAV project format.')
  }
  const name = validateProjectName(value.name)
  let bytes: Uint8Array
  try {
    bytes = Base64.toUint8Array(value.archive)
  } catch {
    throw new WebDavError('Invalid WebDAV project format.')
  }
  if (bytes.byteLength > MAX_ARCHIVE_BYTES || (await sha256(bytes)) !== value.archiveSha256) {
    throw new WebDavError('WebDAV project integrity check failed.')
  }
  const source = new Blob([Uint8Array.from(bytes).buffer], { type: 'application/zip' })
  const manifest = await inspectBackup(source, { signal })
  if (
    manifest.formatVersion !== 3 ||
    !manifest.selection.sessions ||
    manifest.selection.settings ||
    manifest.selection.copilots ||
    manifest.selection.credentials
  ) {
    throw new WebDavError('WebDAV projects must contain conversations only, without settings or credentials.')
  }
  return { name, source, sessionCount: value.sessionCount }
}
