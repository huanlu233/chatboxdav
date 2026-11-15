import { validateProjectName } from '../../src/core/client'
import { MAX_ARCHIVE_BYTES, MAX_PROJECT_BYTES, WebDavError } from '../../src/core/types'

interface ProjectEnvelope {
  format: 'chatbox-webdav-project'
  version: 1
  name: string
  createdAt: string
  sessionCount: number
  archiveEncoding: 'base64'
  archiveSha256: string
  archive: string
}

function base64Encode(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function encodeChatboxProject(
  name: string,
  sessionCount: number,
  chunks: AsyncIterable<Uint8Array>,
  signal?: AbortSignal
): Promise<string> {
  const projectName = validateProjectName(name)
  if (!Number.isSafeInteger(sessionCount) || sessionCount < 1) throw new WebDavError('No conversations were selected.')
  const parts: Uint8Array[] = []
  let size = 0
  for await (const chunk of chunks) {
    signal?.throwIfAborted()
    size += chunk.byteLength
    if (size > MAX_ARCHIVE_BYTES) throw new WebDavError('Selected conversations exceed the project size limit.')
    parts.push(chunk.slice())
  }
  const archive = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    archive.set(part, offset)
    offset += part.byteLength
  }
  signal?.throwIfAborted()
  const envelope: ProjectEnvelope = {
    format: 'chatbox-webdav-project',
    version: 1,
    name: projectName,
    createdAt: new Date().toISOString(),
    sessionCount,
    archiveEncoding: 'base64',
    archiveSha256: await sha256(archive),
    archive: base64Encode(archive),
  }
  const text = JSON.stringify(envelope)
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) {
    throw new WebDavError('Encoded project exceeds the WebDAV size limit.')
  }
  return text
}

export async function decodeChatboxProject(
  text: string,
  signal?: AbortSignal
): Promise<{ name: string; archive: Blob; sessionCount: number }> {
  signal?.throwIfAborted()
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_BYTES) {
    throw new WebDavError('Invalid or oversized WebDAV project.')
  }
  let envelope: Partial<ProjectEnvelope>
  try {
    envelope = JSON.parse(text)
  } catch {
    throw new WebDavError('Invalid WebDAV project format.')
  }
  if (
    envelope.format !== 'chatbox-webdav-project' ||
    envelope.version !== 1 ||
    typeof envelope.name !== 'string' ||
    !Number.isSafeInteger(envelope.sessionCount) ||
    !envelope.sessionCount ||
    typeof envelope.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(envelope.createdAt)) ||
    envelope.archiveEncoding !== 'base64' ||
    typeof envelope.archive !== 'string' ||
    envelope.archive.length > Math.ceil(MAX_ARCHIVE_BYTES / 3) * 4 ||
    envelope.archive.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/.test(envelope.archive) ||
    (envelope.archive.indexOf('=') !== -1 && envelope.archive.indexOf('=') < envelope.archive.length - 2) ||
    typeof envelope.archiveSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(envelope.archiveSha256)
  ) {
    throw new WebDavError('Invalid WebDAV project format.')
  }
  let archive: Uint8Array
  try {
    archive = base64Decode(envelope.archive)
  } catch {
    throw new WebDavError('Invalid WebDAV project format.')
  }
  if (archive.byteLength > MAX_ARCHIVE_BYTES || (await sha256(archive)) !== envelope.archiveSha256) {
    throw new WebDavError('WebDAV project integrity check failed.')
  }
  signal?.throwIfAborted()
  return {
    name: validateProjectName(envelope.name),
    archive: new Blob([Uint8Array.from(archive).buffer], { type: 'application/zip' }),
    sessionCount: envelope.sessionCount,
  }
}
