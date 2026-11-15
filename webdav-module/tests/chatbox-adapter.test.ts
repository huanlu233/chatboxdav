import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodeChatboxProject,
  importSelectedProjects,
  saveSelectedConversations,
  type ChatboxBackupBridge,
} from '../adapters/chatbox'
import { WebDavClient } from '../src/core/client'
import type { WebDavProject, WebDavTransport } from '../src/core/types'

const projectA: WebDavProject = { filename: 'a.chatbox-webdav.json', name: 'a' }
const projectB: WebDavProject = { filename: 'b.chatbox-webdav.json', name: 'b' }
const backup = {
  exportBackup: vi.fn(),
  validateConversationBackup: vi.fn(),
  importBackup: vi.fn(),
} satisfies ChatboxBackupBridge

beforeEach(() => {
  vi.clearAllMocks()
  backup.exportBackup.mockResolvedValue((async function* () {
    yield new Uint8Array([1, 2, 3])
  })())
  backup.validateConversationBackup.mockResolvedValue(undefined)
  backup.importBackup.mockResolvedValue({ imported: true })
})

describe('Chatbox adapter boundaries', () => {
  it('exports only unique selected IDs and excludes settings, copilots and credentials', async () => {
    const transport = vi.fn<WebDavTransport>()
      .mockResolvedValueOnce({ status: 405, data: '' })
      .mockResolvedValueOnce({ status: 201, data: '' })
    const client = new WebDavClient({
      serverUrl: 'https://dav.example.test', remotePath: 'Chatbox', username: 'u', password: 'p',
    }, transport)
    const signal = new AbortController().signal
    await saveSelectedConversations(client, backup, 'renamed', ['one', 'one', 'two'], signal)
    expect(backup.exportBackup).toHaveBeenCalledWith({
      sessions: true, settings: false, copilots: false, credentials: false, sessionIds: ['one', 'two'],
    }, signal)
    expect(transport.mock.calls.at(-1)?.[0].method).toBe('PUT')
    expect(transport.mock.calls.at(-1)?.[0].url).toContain('renamed--')
  })

  it('downloads/imports only the selected project and rejects an empty selection', async () => {
    const serverProjects = new Map<string, string>()
    const transport = vi.fn<WebDavTransport>().mockImplementation(async (request) => {
      if (request.method === 'PUT') {
        serverProjects.set(new URL(request.url).pathname.split('/').at(-1)!, request.body ?? '')
        return { status: 201, data: '' }
      }
      if (request.method === 'GET') {
        return { status: 200, data: serverProjects.get(new URL(request.url).pathname.split('/').at(-1)!) ?? '' }
      }
      return { status: 405, data: '' }
    })
    const client = new WebDavClient({
      serverUrl: 'https://dav.example.test', remotePath: 'Chatbox', username: 'u', password: 'p',
    }, transport)
    const signal = new AbortController().signal
    await saveSelectedConversations(client, backup, 'a', ['one'], signal)
    const savedB = await saveSelectedConversations(client, backup, 'b', ['two'], signal)
    transport.mockClear()

    await expect(importSelectedProjects(client, backup, [], signal)).rejects.toThrow('Select')
    expect(await importSelectedProjects(client, backup, [savedB], signal)).toHaveLength(1)
    expect(transport.mock.calls.map(([request]) => request.method)).toEqual(['GET'])
    expect(transport.mock.calls[0][0].url).toContain('b--')
    expect(backup.importBackup).toHaveBeenCalledOnce()
  })

  it('keeps completed imports if a later project fails', async () => {
    const archive = async function* () {
      yield new Uint8Array([1, 2, 3])
    }
    const body = await encodeChatboxProject('project', 1, archive())
    const transport = vi.fn<WebDavTransport>().mockResolvedValue({ status: 200, data: body })
    const client = new WebDavClient({
      serverUrl: 'https://dav.example.test', remotePath: 'Chatbox', username: 'u', password: 'p',
    }, transport)
    backup.importBackup.mockResolvedValueOnce({ first: true }).mockRejectedValueOnce(new Error('local import failed'))
    await expect(importSelectedProjects(client, backup, [projectA, projectB], new AbortController().signal))
      .rejects.toMatchObject({ completed: [{ project: projectA, result: { first: true } }] })
    expect(backup.importBackup).toHaveBeenCalledTimes(2)
  })
})
