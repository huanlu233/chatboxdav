import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackupDialog } from '@/components/settings/BackupDialog'
import { WebDavProjectDialog } from '@/components/settings/WebDavProjectDialog'
import { loadWebDavConfig } from '@/packages/webdav/config'
import type { WebDavConfig } from '@/packages/webdav/types'
import { navigateToSettings } from './settings-navigation'

export default NiceModal.create(({ sessionId }: { sessionId: string }) => {
  const modal = useModal()
  const { t } = useTranslation()
  const [config, setConfig] = useState<WebDavConfig>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void loadWebDavConfig().then(
      (value) => {
        if (active) setConfig(value)
      },
      () => {
        if (active) setFailed(true)
      }
    )
    return () => {
      active = false
    }
  }, [])
  const close = () => {
    modal.resolve()
    void modal.hide().then(() => modal.remove())
  }
  if (!modal.visible) return null
  if (config?.serverUrl) {
    return <WebDavProjectDialog mode="save" config={config} initialSessionId={sessionId} onClose={close} />
  }
  return (
    <BackupDialog
      opened
      onClose={close}
      title={t('Save to WebDAV')}
      footer={
        <Button
          disabled={!config && !failed}
          onClick={() => {
            close()
            navigateToSettings('/data')
          }}
        >
          {t('Open WebDAV settings')}
        </Button>
      }
    >
      <Text size="sm">{!config && !failed ? t('Loading...') : t('Configure the WebDAV connection first.')}</Text>
    </BackupDialog>
  )
})
