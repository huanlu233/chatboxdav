import type { BackupImportReport as ImportReport } from '@chatbox/core/backup-v3'
import { Alert, Button, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconDownload, IconInfoCircle, IconRefresh, IconSearch, IconUpload } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { rendererBackupService } from '@/app/renderer-backup'
import { WebDavClient, validateProjectName } from '@/packages/webdav/client'
import { importWebDavProjects, saveWebDavProject, WebDavImportError } from '@/packages/webdav/service'
import { type WebDavConfig, WebDavError, type WebDavProject } from '@/packages/webdav/types'
import { BackupDialog } from './BackupDialog'
import { BackupImportReport } from './BackupImportReport'
import classes from './BackupConversationSelector.module.css'

export function WebDavProjectDialog({
  mode,
  config,
  onClose,
  initialSessionId,
}: {
  mode: 'save' | 'import'
  config: WebDavConfig
  onClose(): void
  initialSessionId?: string
}) {
  const { t } = useTranslation()
  const [projectName, setProjectName] = useState('')
  const [query, setQuery] = useState('')
  const [conversations, setConversations] = useState<Array<{ id: string; name: string }>>([])
  const [next, setNext] = useState<number | null>(null)
  const [projects, setProjects] = useState<WebDavProject[]>([])
  const [selected, setSelected] = useState(() => new Set(initialSessionId ? [initialSessionId] : []))
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string>()
  const [listError, setListError] = useState<string>()
  const [progress, setProgress] = useState<string>()
  const [result, setResult] = useState<{
    message: string
    reports?: ImportReport[]
    warningCount?: number
    missingResources?: number
    restart?: boolean
    cleanupPending?: boolean
  }>()
  const epoch = useRef(0)
  const operation = useRef<AbortController | null>(null)
  const listing = useRef<AbortController | null>(null)

  const errorText = useCallback(
    (error: unknown): string => {
      if (error instanceof Error && error.name === 'AbortError') return t('WebDAV operation cancelled.')
      if (error instanceof WebDavError) {
        return [t(error.message), error.status ? `HTTP ${error.status}` : '', error.conversationNames?.join(', ')]
          .filter(Boolean)
          .join(' ')
      }
      return error instanceof Error ? error.message : t('Unknown error')
    },
    [t]
  )

  const listQuery = mode === 'save' ? query : ''
  const load = useCallback(
    async (cursor: number | null = null) => {
      if (cursor !== null && listing.current) return
      listing.current?.abort()
      const controller = new AbortController()
      listing.current = controller
      const token = ++epoch.current
      setLoading(true)
      setListError(undefined)
      try {
        if (mode === 'save') {
          const page = await rendererBackupService.listSessions(cursor, listQuery)
          if (token !== epoch.current) return
          setConversations((current) => (cursor === null ? page.sessions : [...current, ...page.sessions]))
          setNext(page.next)
        } else {
          const entries = await new WebDavClient(config).list(controller.signal)
          if (token !== epoch.current) return
          setProjects(entries)
          setSelected(new Set())
        }
      } catch (error) {
        if (token === epoch.current && !controller.signal.aborted) setListError(errorText(error))
      } finally {
        if (token === epoch.current) {
          setLoading(false)
          listing.current = null
        }
      }
    },
    [config, errorText, mode, listQuery]
  )

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150)
    return () => {
      clearTimeout(timer)
      listing.current?.abort()
      epoch.current++
    }
  }, [load])

  useEffect(() => {
    let disposed = false
    if (initialSessionId) {
      void rendererBackupService.getConversationNames([initialSessionId]).then(
        (names) => {
          if (!disposed) setProjectName((names[0] ?? '').slice(0, 100))
        },
        () => undefined
      )
    }
    return () => {
      disposed = true
      operation.current?.abort()
    }
  }, [initialSessionId])

  const toggle = (id: string) =>
    setSelected((current) => {
      const selected = new Set(current)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return selected
    })
  const visible: Array<{ id: string; name: string; detail?: string }> =
    mode === 'save'
      ? conversations.map((item) => ({ id: item.id, name: item.name }))
      : projects
          .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
          .map((item) => ({ id: item.filename, name: item.name, detail: item.modifiedAt }))

  const submit = async () => {
    if (operation.current || !selected.size) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setError(undefined)
    setResult(undefined)
    setProgress(undefined)
    try {
      if (mode === 'save') {
        const saved = await saveWebDavProject(config, projectName, [...selected], controller.signal)
        setResult({
          message: t('Saved project: {{name}}', { name: saved.project.name }),
          warningCount: saved.result.complete.counts.warning,
          missingResources: saved.result.missingResources,
          cleanupPending: saved.result.cleanupPending,
        })
        setSelected(new Set())
      } else {
        if (!confirmed) return
        const imported = await importWebDavProjects(
          config,
          projects.filter((project) => selected.has(project.filename)),
          controller.signal,
          (project, index) =>
            setProgress(
              String(
                t('Importing {{index}} / {{count}}: {{name}}', {
                  index: index + 1,
                  count: selected.size,
                  name: project.name,
                })
              )
            )
        )
        setResult({
          message: t('Imported {{count}} WebDAV projects.', { count: imported.length }),
          reports: imported.flatMap((item) => (item.result.importReport ? [item.result.importReport] : [])),
          warningCount: imported.reduce((count, item) => count + item.result.complete.counts.warning, 0),
          restart: imported.some((item) => item.result.refreshPending),
          cleanupPending: imported.some((item) => item.result.cleanupPending),
        })
        setSelected(new Set())
        setConfirmed(false)
      }
    } catch (error) {
      if (error instanceof WebDavImportError) {
        const completed = new Set(error.completed.map((item) => item.project.filename))
        setSelected((current) => new Set([...current].filter((id) => !completed.has(id))))
        setError(`${t(error.message)} ${errorText(error.reason)}`)
        const results = [...error.completed.map((item) => item.result), ...(error.partial ? [error.partial] : [])]
        setResult({
          message: t('Imported {{count}} WebDAV projects.', { count: error.completed.length }),
          reports: results.flatMap((result) => (result.importReport ? [result.importReport] : [])),
          warningCount: results.reduce((count, result) => count + result.complete.counts.warning, 0),
          restart: results.some((result) => result.refreshPending),
          cleanupPending: results.some((result) => result.cleanupPending),
        })
      } else setError(errorText(error))
    } finally {
      operation.current = null
      setBusy(false)
      setProgress(undefined)
    }
  }

  let validName = true
  try {
    if (mode === 'save') validateProjectName(projectName)
  } catch {
    validName = false
  }
  return (
    <BackupDialog
      opened
      title={mode === 'save' ? t('Save to WebDAV') : t('Import from WebDAV')}
      onClose={() => {
        if (busy) operation.current?.abort()
        else onClose()
      }}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      footer={
        <>
          <Button
            variant="default"
            onClick={() => {
              if (busy) operation.current?.abort()
              else onClose()
            }}
          >
            {busy ? t('Cancel') : t('Close')}
          </Button>
          <Button
            leftSection={mode === 'save' ? <IconUpload size={16} /> : <IconDownload size={16} />}
            styles={{
              root: { height: 'auto', minHeight: 40, paddingBlock: 6 },
              label: { whiteSpace: 'normal', overflowWrap: 'anywhere' },
            }}
            onClick={() => void submit()}
            loading={busy}
            disabled={loading || !!listError || !selected.size || !validName || (mode === 'import' && !confirmed)}
          >
            {mode === 'save' ? t('Save project') : t('Import selected projects')}
          </Button>
        </>
      }
    >
      <Stack gap="md" style={{ minHeight: 0, flex: 1 }}>
        {mode === 'save' && (
          <TextInput
            label={t('Project name')}
            value={projectName}
            maxLength={100}
            required
            disabled={busy}
            onChange={(event) => setProjectName(event.currentTarget.value)}
          />
        )}
        <TextInput
          aria-label={String(mode === 'save' ? t('Search conversations') : t('Search WebDAV projects'))}
          placeholder={String(mode === 'save' ? t('Search conversations') : t('Search WebDAV projects'))}
          leftSection={<IconSearch size={16} />}
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Group justify="space-between" gap="xs">
          <Text size="sm" role="status">
            {mode === 'save'
              ? t('{{count}} conversations selected', { count: selected.size })
              : t('{{count}} projects selected', { count: selected.size })}
          </Text>
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={busy || loading || !!listError}
              onClick={() => setSelected((current) => new Set([...current, ...visible.map((item) => item.id)]))}
            >
              {t('Select visible')}
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={busy || !selected.size}
              onClick={() => setSelected(new Set())}
            >
              {t('Clear selection')}
            </Button>
          </Group>
        </Group>
        <div className={classes.list} style={{ minHeight: 160, flex: 1 }}>
          {visible.map((item) => (
            <Checkbox.Card
              key={item.id}
              className={classes.row}
              checked={selected.has(item.id)}
              disabled={busy || loading}
              aria-label={item.name}
              onClick={() => toggle(item.id)}
            >
              <Group wrap="nowrap" gap="sm">
                <Checkbox.Indicator />
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                    {item.name}
                  </Text>
                  {item.detail && (
                    <Text size="xs" c="dimmed">
                      {new Date(item.detail).toLocaleString()}
                    </Text>
                  )}
                </Stack>
              </Group>
            </Checkbox.Card>
          ))}
          {loading && (
            <Text p="md" size="sm" c="dimmed">
              {t('Loading...')}
            </Text>
          )}
          {listError ? (
            <Alert color="chatbox-error" icon={<IconInfoCircle size={16} />}>
              <Text size="sm">{listError}</Text>
              <Button variant="subtle" size="compact-xs" onClick={() => void load()}>
                {t('Retry')}
              </Button>
            </Alert>
          ) : !loading && !visible.length ? (
            <Text p="md" size="sm" c="dimmed">
              {mode === 'save' ? t('No conversations found') : t('No WebDAV projects found.')}
            </Text>
          ) : null}
          {mode === 'save' && next !== null && (
            <Button fullWidth variant="subtle" disabled={busy || loading} onClick={() => void load(next)}>
              {t('Show more')}
            </Button>
          )}
        </div>
        {mode === 'import' && (
          <>
            <Button
              variant="subtle"
              leftSection={<IconRefresh size={16} />}
              disabled={busy || loading}
              onClick={() => void load()}
            >
              {t('Refresh projects')}
            </Button>
            <Checkbox
              checked={confirmed}
              disabled={busy}
              label={t('Replace local conversations with matching IDs; keep other local conversations.')}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
          </>
        )}
        {progress && (
          <Text size="sm" role="status" style={{ overflowWrap: 'anywhere' }}>
            {progress}
          </Text>
        )}
        {error && (
          <Alert role="alert" color="chatbox-error" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        )}
        {result && (
          <Stack gap="xs">
            <Text size="sm" role="status" fw={600} style={{ overflowWrap: 'anywhere' }}>
              {result.message}
            </Text>
            {result.reports?.map((report, index) => (
              <BackupImportReport key={index} report={report} />
            ))}
            {!!result.missingResources && (
              <Text size="sm">
                {t(
                  'Attachments not found on this device were skipped: {{count}}. The rest of the backup is complete.',
                  { count: result.missingResources }
                )}
              </Text>
            )}
            {!!result.warningCount && (
              <Text size="sm">
                {t('{{count}} portability warnings. Local file links and retrieval indexes are not included.', {
                  count: result.warningCount,
                })}
              </Text>
            )}
            {result.restart && <Text size="sm">{t('Restart Chatbox to refresh the imported data.')}</Text>}
            {result.cleanupPending && (
              <Text size="sm">
                {t('Some temporary files could not be removed. Chatbox will try again on the next start.')}
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </BackupDialog>
  )
}
