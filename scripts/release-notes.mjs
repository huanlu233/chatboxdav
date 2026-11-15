import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function changedPaths(root) {
  const patchPath = resolve(root, 'dist/candidate.patch')
  if (!existsSync(patchPath)) return []
  return [...readFileSync(patchPath, 'utf8').matchAll(/^\+\+\+ b\/(.+)$/gm)]
    .map(match => match[1])
    .filter(path => path !== '/dev/null')
}

function webdavSummary(paths) {
  const webdav = paths.filter(path => path.startsWith('webdav-module/') || path.startsWith('integration/'))
  if (!webdav.length) return []
  const summaries = []
  if (webdav.some(path => /client|transport|native|android/.test(path))) summaries.push('WebDAV transport and Android HTTP handling')
  if (webdav.some(path => /project|service|export|backup|import/.test(path))) summaries.push('selective project save/import behavior')
  if (webdav.some(path => /settings|modals|renderer/.test(path))) summaries.push('WebDAV settings and conversation actions')
  return summaries.length ? summaries : ['WebDAV integration']
}

export function buildReleaseNotes({ root, pin, version, upstreamChanged = false, previousTag = '', previousCommit = '' }) {
  const summaries = webdavSummary(changedPaths(root))
  const english = [
    `ChatboxDAV ${version}`,
    '',
    summaries.length
      ? `WebDAV changes: ${summaries.join('; ')}.`
      : upstreamChanged
        ? `Synchronized Chatbox ${pin.tag} (${pin.commit}) from upstream${previousTag ? ` after ${previousTag} (${previousCommit})` : ''}.`
        : `Synchronized Chatbox ${pin.tag} (${pin.commit}); no WebDAV production changes in this release.`,
    '',
    'Android compatibility follows the upstream Capacitor configuration; this build keeps the current minimum Android API level and target SDK. WebDAV, backup/import, upstream compatibility, type, plugin and APK verification passed.',
    'This is an independent distribution and is not an official Chatbox release. APK installation requires confirmation on the device.',
    '',
    'Assets include the signed APK, SHA-256 checksums, reproducible source and the exact upstream source snapshot.',
  ].join('\n')
  const chinese = [
    `ChatboxDAV ${version} 中文说明`,
    '',
    summaries.length
      ? `WebDAV 变更：${summaries.join('；')}。`
      : upstreamChanged
        ? `已同步 Chatbox 上游 ${pin.tag}（${pin.commit}）${previousTag ? `，上一版本为 ${previousTag}（${previousCommit}）` : ''}。`
        : `已同步 Chatbox ${pin.tag}（${pin.commit}），本次没有 WebDAV 生产代码变更。`,
    '',
    'Android 兼容性遵循上游 Capacitor 配置，本次保留当前最低 Android API 级别和 target SDK。WebDAV、备份/导入、上游兼容性、类型检查、插件和 APK 校验均已通过。',
    '这是独立分发版本，并非 Chatbox 官方版本；安装 APK 需要在手机上确认。',
    '',
    '附件包含已签名 APK、SHA-256 校验码、可复现源代码和对应的上游源代码快照。',
  ].join('\n')
  return `${english}\n\n---\n\n${chinese}`
}
