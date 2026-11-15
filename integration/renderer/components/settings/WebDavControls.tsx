import { Alert, Box, Button, Checkbox, Group, PasswordInput, Stack, TextInput } from '@mantine/core'
import { IconCloud, IconDownload, IconInfoCircle, IconUpload } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WebDavClient, webDavUrls } from '@/packages/webdav/client'
import { emptyWebDavConfig, forgetWebDavConfig, loadWebDavConfig, saveWebDavConfig } from '@/packages/webdav/config'
import { WebDavError } from '@/packages/webdav/types'
import { SettingRow, SettingsSection } from './SettingsLayout'
import { WebDavProjectDialog } from './WebDavProjectDialog'

export function WebDavControls() {
  const { t } = useTranslation()
  const [config, setConfig] = useState({ ...emptyWebDavConfig })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'save' | 'import'>()
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>()
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    loadWebDavConfig()
      .then(
        (config) => {
          if (active) setConfig(config)
        },
        () => {
          if (active) setNotice({ message: t('Could not load WebDAV settings.'), error: true })
        }
      )
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      operation.current?.abort()
    }
  }, [t])
  const update = (field: keyof typeof config, value: string | boolean) => {
    setConfig((current) => ({ ...current, [field]: value }))
    setNotice(undefined)
  }
  const run = async (action: (signal: AbortSignal) => Promise<string>) => {
    if (operation.current) return
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setNotice(undefined)
    try {
      const message = await action(controller.signal)
      if (!controller.signal.aborted) setNotice({ message })
    } catch (error) {
      if (!controller.signal.aborted)
        setNotice({
          message:
            error instanceof WebDavError
              ? `${t(error.message)}${error.status ? ` HTTP ${error.status}` : ''}`
              : t('Could not save WebDAV settings.'),
          error: true,
        })
    } finally {
      operation.current = null
      setBusy(false)
    }
  }
  const open = (mode: 'save' | 'import') => {
    try {
      webDavUrls(config)
      setNotice(undefined)
      setMode(mode)
    } catch (error) {
      setNotice({ message: error instanceof Error ? t(error.message) : t('Unknown error'), error: true })
    }
  }
  const disabled = loading || busy
  return (
    <>
      <SettingsSection title="WebDAV">
        <SettingRow
          id="webdav-server"
          label={t('WebDAV address')}
          controlLayout="block"
          control={(id) => (
            <TextInput
              id={id}
              placeholder="https://dav.example.com/dav/"
              value={config.serverUrl}
              disabled={disabled}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => update('serverUrl', event.currentTarget.value)}
            />
          )}
        />
        <SettingRow
          id="webdav-folder"
          label={t('WebDAV folder')}
          controlLayout="block"
          control={(id) => (
            <TextInput
              id={id}
              value={config.remotePath}
              disabled={disabled}
              onChange={(event) => update('remotePath', event.currentTarget.value)}
            />
          )}
        />
        <SettingRow
          id="webdav-username"
          label={t('Username')}
          controlLayout="block"
          control={(id) => (
            <TextInput
              id={id}
              value={config.username}
              disabled={disabled}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              onChange={(event) => update('username', event.currentTarget.value)}
            />
          )}
        />
        <SettingRow
          id="webdav-password"
          label={t('Password / app password')}
          controlLayout="block"
          control={(id) => (
            <PasswordInput
              id={id}
              value={config.password}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => update('password', event.currentTarget.value)}
            />
          )}
        />
        <Box px={16} py={12}>
          <Stack gap="sm">
            <Checkbox
              label={t('Remember password on this device (stored locally, not encrypted)')}
              checked={config.rememberPassword}
              disabled={disabled}
              onChange={(event) => update('rememberPassword', event.currentTarget.checked)}
            />
            {config.serverUrl.trim().startsWith('http:') && (
              <Alert color="chatbox-warning" icon={<IconInfoCircle size={16} />}>
                {t('HTTP does not encrypt your password or conversations. Use HTTPS when possible.')}
              </Alert>
            )}
            <Group gap="xs">
              <Button
                variant="default"
                disabled={disabled}
                onClick={() =>
                  void run(async () => {
                    await saveWebDavConfig(config)
                    return String(t('WebDAV connection saved.'))
                  })
                }
              >
                {t('Save connection')}
              </Button>
              <Button
                variant="default"
                leftSection={<IconCloud size={16} />}
                disabled={disabled}
                onClick={() =>
                  void run(async (signal) => {
                    await new WebDavClient(config).test(signal)
                    return String(t('WebDAV connection successful.'))
                  })
                }
              >
                {t('Test connection')}
              </Button>
              <Button
                variant="subtle"
                color="chatbox-error"
                disabled={disabled}
                onClick={() =>
                  void run(async () => {
                    await forgetWebDavConfig()
                    setConfig({ ...emptyWebDavConfig })
                    return String(t('WebDAV connection removed.'))
                  })
                }
              >
                {t('Forget connection')}
              </Button>
            </Group>
            {notice && (
              <Alert
                role={notice.error ? 'alert' : 'status'}
                color={notice.error ? 'chatbox-error' : 'chatbox-success'}
                icon={<IconInfoCircle size={16} />}
              >
                {notice.message}
              </Alert>
            )}
          </Stack>
        </Box>
        <SettingRow
          id="webdav-projects"
          label={t('WebDAV projects')}
          controlLayout="block"
          control={
            <Group gap="xs">
              <Button leftSection={<IconUpload size={16} />} disabled={disabled} onClick={() => open('save')}>
                {t('Save to WebDAV')}
              </Button>
              <Button
                variant="default"
                leftSection={<IconDownload size={16} />}
                disabled={disabled}
                onClick={() => open('import')}
              >
                {t('Import from WebDAV')}
              </Button>
            </Group>
          }
        />
      </SettingsSection>
      {mode && <WebDavProjectDialog mode={mode} config={config} onClose={() => setMode(undefined)} />}
    </>
  )
}
