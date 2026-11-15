import { WebDavClient } from '../../src/core/client'
import { WebDavError, type WebDavProject } from '../../src/core/types'
import { decodeChatboxProject, encodeChatboxProject } from './project'

export interface ChatboxBackupBridge {
  exportBackup(
    selection: {
      sessions: true
      settings: false
      copilots: false
      credentials: false
      sessionIds: readonly string[]
    },
    signal: AbortSignal
  ): Promise<AsyncIterable<Uint8Array>>
  validateConversationBackup(archive: Blob, signal: AbortSignal): Promise<void>
  importBackup(archive: Blob, signal: AbortSignal): Promise<unknown>
}

export interface ImportedChatboxProject {
  project: WebDavProject
  result: unknown
}

export class ChatboxWebDavImportError extends Error {
  constructor(
    public readonly reason: unknown,
    public readonly completed: readonly ImportedChatboxProject[]
  ) {
    super('WebDAV import incomplete. Completed imports have been kept.')
    this.name = 'ChatboxWebDavImportError'
  }
}

export async function saveSelectedConversations(
  client: WebDavClient,
  backup: ChatboxBackupBridge,
  name: string,
  selectedIds: readonly string[],
  signal: AbortSignal
): Promise<WebDavProject> {
  const sessionIds = [...new Set(selectedIds)]
  if (!sessionIds.length) throw new WebDavError('Select at least one conversation.')
  signal.throwIfAborted()
  const chunks = await backup.exportBackup(
    { sessions: true, settings: false, copilots: false, credentials: false, sessionIds },
    signal
  )
  const body = await encodeChatboxProject(name, sessionIds.length, chunks, signal)
  signal.throwIfAborted()
  return client.save(name, body, signal)
}

export async function importSelectedProjects(
  client: WebDavClient,
  backup: ChatboxBackupBridge,
  selectedProjects: readonly WebDavProject[],
  signal: AbortSignal
): Promise<ImportedChatboxProject[]> {
  if (!selectedProjects.length) throw new WebDavError('Select at least one WebDAV project.')
  const completed: ImportedChatboxProject[] = []
  try {
    for (const project of selectedProjects) {
      signal.throwIfAborted()
      const decoded = await decodeChatboxProject(await client.download(project, signal), signal)
      await backup.validateConversationBackup(decoded.archive, signal)
      signal.throwIfAborted()
      const result = await backup.importBackup(decoded.archive, signal)
      completed.push({ project, result })
    }
    return completed
  } catch (reason) {
    throw new ChatboxWebDavImportError(reason, completed)
  }
}
