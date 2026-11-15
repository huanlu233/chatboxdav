import type { BackupExportResult } from '@chatbox/core/backup-export'
import { type BackupResult, getBackupImportPartialResult } from '@chatbox/core/backup-v3'
import { rendererBackupService } from '@/app/renderer-backup'
import { WebDavClient, validateProjectName } from './client'
import { decodeProject, encodeProject } from './project'
import { withWebDavDestination } from './export-adapter'
import { type WebDavConfig, WebDavError, type WebDavProject } from './types'

export interface ImportedWebDavProject {
  project: WebDavProject
  result: BackupResult
}

export class WebDavImportError extends Error {
  constructor(
    public readonly reason: unknown,
    public readonly completed: ImportedWebDavProject[],
    public readonly partial?: BackupResult
  ) {
    super('WebDAV import incomplete. Completed changes have been kept.')
    this.name = 'WebDavImportError'
  }
}

async function withBackupCancellation<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  if (rendererBackupService.isActive()) throw new WebDavError('A backup operation is already in progress')
  const cancel = () => rendererBackupService.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    return await action()
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

async function requireIdleConversations(sessionIds?: readonly string[]) {
  const generating = rendererBackupService.getGeneratingSessionIds(
    sessionIds ? { sessions: true, settings: false, copilots: false, credentials: false, sessionIds } : undefined
  )
  if (generating.length) {
    const names = await rendererBackupService.getConversationNames(generating)
    throw new WebDavError('Finish or stop generation before using WebDAV.', undefined, names)
  }
}

export async function saveWebDavProject(
  config: WebDavConfig,
  name: string,
  selectedIds: readonly string[],
  signal: AbortSignal
): Promise<{ project: WebDavProject; result: BackupExportResult }> {
  const projectName = validateProjectName(name)
  const sessionIds = [...new Set(selectedIds)]
  if (!sessionIds.length) throw new WebDavError('Select at least one conversation.')
  const client = new WebDavClient(config)
  await requireIdleConversations(sessionIds)
  let project: WebDavProject | undefined
  const result = await withBackupCancellation(signal, () =>
    withWebDavDestination(
      async (chunks, exportSignal) => {
        const body = await encodeProject(projectName, sessionIds.length, chunks, exportSignal)
        project = await client.save(projectName, body, exportSignal)
      },
      () => rendererBackupService.export(
        { sessions: true, settings: false, copilots: false, credentials: false, sessionIds },
        'v3'
      )
    )
  )
  if (!project) throw new WebDavError('WebDAV project was not saved.')
  return { project, result }
}

export async function importWebDavProjects(
  config: WebDavConfig,
  projects: readonly WebDavProject[],
  signal: AbortSignal,
  onProject?: (project: WebDavProject, index: number) => void
): Promise<ImportedWebDavProject[]> {
  if (!projects.length) throw new WebDavError('Select at least one WebDAV project.')
  const client = new WebDavClient(config)
  const completed: ImportedWebDavProject[] = []
  try {
    await requireIdleConversations()
    for (const [index, project] of projects.entries()) {
      signal.throwIfAborted()
      onProject?.(project, index)
      const data = await decodeProject(await client.download(project, signal), signal)
      await requireIdleConversations()
      const result = await withBackupCancellation(signal, () => rendererBackupService.import(data.source))
      completed.push({ project, result })
    }
    return completed
  } catch (error) {
    throw new WebDavImportError(error, completed, getBackupImportPartialResult(error))
  }
}
