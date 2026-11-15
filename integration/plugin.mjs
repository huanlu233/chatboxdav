import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function replaceOnce(code, before, after, label) {
  if (code.split(before).length !== 2) throw new Error(`Upstream compatibility failure: ${label}`)
  return code.replace(before, after)
}

export function transformSource(code, path, translations = {}) {
  const once = (before, after) => { code = replaceOnce(code, before, after, path) }
  if (path === 'src/renderer/components/settings/DataSections.tsx') {
    once("return <BackupControls />", 'return <><WebDavControls /><BackupControls /></>')
    code = "import { WebDavControls } from './WebDavControls'\n" + code
  } else if (path === 'src/renderer/components/layout/Toolbar.tsx') {
    once('const items: ActionMenuItemProps[] = [', `const items: ActionMenuItemProps[] = [
      { text: t('Save to WebDAV'), icon: IconCloudUpload, onClick: () => {
        void import('@/modals/WebDavSave').then(({ default: modal }) => NiceModal.show(modal, { sessionId }))
      } },`)
    code = "import { IconCloudUpload } from '@tabler/icons-react'\n" + code
  } else if (path === 'src/renderer/app/renderer-backup.ts') {
    once('platform.exporter.exportStreamingFile(', 'webdavExporter(platform.exporter).exportStreamingFile(')
    code = "import { webdavExporter } from '@/packages/webdav/export-adapter'\n" + code
  } else if (path === 'src/renderer/hooks/useVersion.ts') {
    once('remote.checkNeedUpdate(version, os, config, settings)', 'checkDistributionUpdate(version)')
    code = "import { checkDistributionUpdate } from '@/packages/webdav/updates'\n" + code
  } else if (path === 'src/renderer/components/DbSchemaGuardDialog.tsx') {
    once('buildChatboxUrl(`/redirect_app/check_update/${language}`)', 'RELEASES_URL')
    code = "import { RELEASES_URL } from '@/packages/webdav/updates'\n" + code
  } else if (path === 'src/renderer/routes/about.tsx') {
    const old = 'buildChatboxUrl(`/redirect_app/check_update/${language}`)'
    if (code.split(old).length !== 3) throw new Error('Upstream update-link contract changed')
    code = code.replaceAll(old, 'RELEASES_URL')
    code = "import { RELEASES_URL } from '@/packages/webdav/updates'\n" + code
    once('Chatbox {', 'ChatboxDAV {')
    once('https://github.com/chatboxai/chatbox', 'https://github.com/huanlu233/chatboxdav')
  } else {
    const locale = path.match(/^packages\/chatbox-i18n\/src\/locales\/([^/]+)\/translation.json$/)?.[1]
    if (!locale || !translations[locale]) return null
    const original = JSON.parse(code)
    for (const key of Object.keys(translations[locale])) {
      if (key in original && original[key] !== translations[locale][key]) throw new Error(`Translation conflict: ${locale}/${key}`)
    }
    return JSON.stringify({ ...original, ...translations[locale] })
  }
  return code
}

export const hookPaths = [
  'src/renderer/components/settings/DataSections.tsx',
  'src/renderer/components/layout/Toolbar.tsx',
  'src/renderer/app/renderer-backup.ts',
  'src/renderer/hooks/useVersion.ts',
  'src/renderer/routes/about.tsx',
  'src/renderer/components/DbSchemaGuardDialog.tsx',
]

export function webdavIntegration(upstream, distributionRoot) {
  const prefix = resolve(upstream).replaceAll('\\', '/') + '/'
  const translations = JSON.parse(readFileSync(resolve(distributionRoot, 'integration/translations.json'), 'utf8'))
  return {
    name: 'chatboxdav-integration',
    enforce: /** @type {'pre'} */ ('pre'),
    buildStart() {
      for (const p of hookPaths) transformSource(readFileSync(resolve(upstream, p), 'utf8'), p, translations)
    },
    transform(code, id) {
      const normalized = id.replaceAll('\\', '/').split('?')[0]
      if (!normalized.startsWith(prefix)) return null
      const result = transformSource(code, normalized.slice(prefix.length), translations)
      return result === null ? null : { code: result, map: null }
    },
  }
}
