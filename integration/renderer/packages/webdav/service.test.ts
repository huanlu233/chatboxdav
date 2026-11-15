import { beforeEach, expect, it, vi } from 'vitest'
import { importWebDavProjects, saveWebDavProject, WebDavImportError } from './service'
import type { WebDavConfig, WebDavProject } from './types'
import { webdavExporter } from './export-adapter'
import type { Exporter } from '@/platform/interfaces'
const mocks = vi.hoisted(() => ({
  export: vi.fn(),
  import: vi.fn(),
  isActive: vi.fn(),
  cancel: vi.fn(),
  getGeneratingSessionIds: vi.fn(),
  getConversationNames: vi.fn(),
  save: vi.fn(),
  download: vi.fn(),
  encode: vi.fn(),
  decode: vi.fn(),
}))
vi.mock('@/app/renderer-backup', () => ({ rendererBackupService: mocks }))
vi.mock('./client', () => ({
  validateProjectName: (name: string) => name,
  WebDavClient: class {
    save = mocks.save
    download = mocks.download
  },
}))
vi.mock('./project', () => ({ encodeProject: mocks.encode, decodeProject: mocks.decode }))
const config: WebDavConfig = {
  serverUrl: 'https://dav.example.com',
  remotePath: 'Chatbox',
  username: 'u',
  password: 'secret',
  rememberPassword: false,
}
const a: WebDavProject = { filename: 'a.chatbox-webdav.json', name: 'a' }
const b: WebDavProject = { filename: 'b.chatbox-webdav.json', name: 'b' }
const result = { complete: { counts: { warning: 0 } } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getGeneratingSessionIds.mockReturnValue([])
  mocks.isActive.mockReturnValue(false)
  mocks.getConversationNames.mockResolvedValue(['Generating conversation'])
  mocks.export.mockImplementation(async () => {
    await webdavExporter({} as Exporter).exportStreamingFile(
      'backup.zip',
      async function* () {
        yield new Uint8Array([1])
      },
      'application/zip',
      new AbortController().signal
    )
    return result
  })
  mocks.encode.mockResolvedValue('project-json')
  mocks.save.mockResolvedValue(a)
  mocks.download.mockResolvedValue('remote-json')
  mocks.decode.mockResolvedValue({ source: new Blob(['archive']) })
  mocks.import.mockResolvedValue(result)
})

it('exports only explicitly selected conversations, without global settings or credentials', async () => {
  await saveWebDavProject(config, 'renamed', ['one', 'one', 'two'], new AbortController().signal)
  expect(mocks.export).toHaveBeenCalledWith(
    {
      sessions: true,
      settings: false,
      credentials: false,
      copilots: false,
      sessionIds: ['one', 'two'],
    },
    'v3'
  )
  expect(mocks.save).toHaveBeenCalledWith('renamed', 'project-json', expect.any(AbortSignal))
})

it('does not interpret an empty selection as all conversations or all projects', async () => {
  await expect(saveWebDavProject(config, 'project', [], new AbortController().signal)).rejects.toThrow('Select')
  await expect(importWebDavProjects(config, [], new AbortController().signal)).rejects.toThrow('Select')
  expect(mocks.export).not.toHaveBeenCalled()
  expect(mocks.download).not.toHaveBeenCalled()
  expect(mocks.import).not.toHaveBeenCalled()
})

it('downloads and imports only the selected remote project', async () => {
  await importWebDavProjects(config, [b], new AbortController().signal)
  expect(mocks.download).toHaveBeenCalledExactlyOnceWith(b, expect.any(AbortSignal))
  expect(mocks.import).toHaveBeenCalledOnce()
})

it('reports completed projects and stops after a later project fails', async () => {
  mocks.download.mockResolvedValueOnce('one').mockRejectedValueOnce(new Error('offline'))
  const failure = await importWebDavProjects(
    config,
    [a, b, { ...b, filename: 'c.chatbox-webdav.json' }],
    new AbortController().signal
  ).catch((error) => error)
  expect(failure).toBeInstanceOf(WebDavImportError)
  expect(failure.completed).toEqual([{ project: a, result }])
  expect(mocks.download).toHaveBeenCalledTimes(2)
  expect(mocks.import).toHaveBeenCalledOnce()
})

it('blocks exporting selected generating conversations before upload', async () => {
  mocks.getGeneratingSessionIds.mockReturnValue(['one'])
  await expect(saveWebDavProject(config, 'name', ['one'], new AbortController().signal)).rejects.toThrow('generation')
  expect(mocks.export).not.toHaveBeenCalled()
  expect(mocks.save).not.toHaveBeenCalled()
})

it('cancels its current backup when the caller cancels and stops before downloading another project', async () => {
  const controller = new AbortController()
  mocks.import.mockImplementationOnce(async () => {
    controller.abort()
    return result
  })
  const failure = await importWebDavProjects(config, [a, b], controller.signal).catch((error) => error)
  expect(mocks.cancel).toHaveBeenCalledOnce()
  expect(failure.completed).toHaveLength(1)
  expect(mocks.download).toHaveBeenCalledTimes(1)
})
