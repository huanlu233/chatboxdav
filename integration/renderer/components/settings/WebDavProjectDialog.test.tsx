// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { WebDavConfig } from '@/packages/webdav/types'
import { WebDavProjectDialog } from './WebDavProjectDialog'

const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(), getConversationNames: vi.fn(), list: vi.fn(),
  save: vi.fn(), import: vi.fn(),
}))
vi.mock('@/app/renderer-backup', () => ({ rendererBackupService: mocks }))
vi.mock('@/packages/webdav/service', async (original) => {
  const actual = await original<typeof import('@/packages/webdav/service')>()
  return { ...actual, saveWebDavProject: mocks.save, importWebDavProjects: mocks.import }
})
vi.mock('@/packages/webdav/client', async (original) => {
  const actual = await original<typeof import('@/packages/webdav/client')>()
  return { ...actual, WebDavClient: class { list = mocks.list } }
})
vi.mock('./BackupDialog', () => ({
  BackupDialog: ({ children, title, footer }: { children: ReactNode; title: string; footer: ReactNode }) => (
    <div role="dialog" aria-label={title}>{children}{footer}</div>
  ),
}))
const config: WebDavConfig = { serverUrl: 'https://example.com/dav/', remotePath: 'Chatbox', username: 'u', password: 'secret', rememberPassword: false }
const projects = [
  { filename: 'alpha.chatbox-webdav.json', name: 'Alpha project' },
  { filename: 'beta.chatbox-webdav.json', name: 'Beta project' },
]

Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {}; unobserve() {}; disconnect() {} })
  mocks.listSessions.mockResolvedValue({ sessions: [{ id: 'a', name: 'Alpha chat' }, { id: 'b', name: 'Beta chat' }], next: null, total: 2 })
  mocks.getConversationNames.mockResolvedValue(['Beta chat'])
  mocks.list.mockResolvedValue(projects)
  mocks.save.mockResolvedValue({ project: { name: 'Renamed project' }, result: { complete: { counts: { warning: 0 } } } })
  mocks.import.mockResolvedValue([{ project: projects[1], result: { complete: { counts: { warning: 0 } } } }])
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function show(mode: 'save' | 'import', initialSessionId?: string) {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } })
  render(<I18nextProvider i18n={i18n}><MantineProvider>
    <WebDavProjectDialog mode={mode} config={config} initialSessionId={initialSessionId} onClose={vi.fn()} />
  </MantineProvider></I18nextProvider>)
}

it('saves only checked conversations with the edited project name', async () => {
  await show('save')
  const beta = await screen.findByRole('checkbox', { name: 'Beta chat' })
  expect(beta.getAttribute('aria-checked')).toBe('false')
  expect((screen.getByRole('button', { name: 'Save project' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Renamed project' } })
  fireEvent.click(beta)
  fireEvent.click(screen.getByRole('button', { name: 'Save project' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(config, 'Renamed project', ['b'], expect.any(AbortSignal)))
  await screen.findByText('Saved project: Renamed project')
})

it('preselects only the conversation that opened the menu, and lets its project name change', async () => {
  await show('save', 'b')
  const name = await screen.findByRole('textbox', { name: 'Project name' }) as HTMLInputElement
  await waitFor(() => expect(name.value).toBe('Beta chat'))
  expect((await screen.findByRole('checkbox', { name: 'Beta chat' })).getAttribute('aria-checked')).toBe('true')
  expect(screen.getByRole('checkbox', { name: 'Alpha chat' }).getAttribute('aria-checked')).toBe('false')
  fireEvent.change(name, { target: { value: 'New name' } })
  expect(name.value).toBe('New name')
})

it('defaults remote projects to unselected and imports only the explicit selection after confirmation', async () => {
  await show('import')
  const beta = await screen.findByRole('checkbox', { name: 'Beta project' })
  const button = screen.getByRole('button', { name: 'Import selected projects' }) as HTMLButtonElement
  expect(beta.getAttribute('aria-checked')).toBe('false')
  expect(screen.getByRole('checkbox', { name: 'Alpha project' }).getAttribute('aria-checked')).toBe('false')
  expect(button.disabled).toBe(true)
  expect(mocks.import).not.toHaveBeenCalled()
  fireEvent.click(beta)
  expect(button.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Replace local conversations with matching IDs; keep other local conversations.' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Search WebDAV projects' }), { target: { value: 'Alpha' } })
  fireEvent.click(button)
  await waitFor(() => expect(mocks.import).toHaveBeenCalledWith(config, [projects[1]], expect.any(AbortSignal), expect.any(Function)))
  expect(mocks.list).toHaveBeenCalledTimes(1)
})

it('clears remote selection when refreshed, without automatically importing anything', async () => {
  await show('import')
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Beta project' }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }))
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Beta project' }).getAttribute('aria-checked')).toBe('false'))
  expect(mocks.import).not.toHaveBeenCalled()
})

it('can retry a failed project listing', async () => {
  mocks.list.mockRejectedValueOnce(new Error('Connection failed'))
  await show('import')
  await screen.findByText('Connection failed')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('checkbox', { name: 'Alpha project' })
})
