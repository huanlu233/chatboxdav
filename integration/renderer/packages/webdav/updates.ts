import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { compareVersions } from 'compare-versions'

export const RELEASES_URL = 'https://github.com/huanlu233/chatboxdav/releases/latest'
const API = 'https://api.github.com/repos/huanlu233/chatboxdav/releases/latest'
interface Release { draft?: boolean; prerelease?: boolean; tag_name?: string; assets?: { name: string }[] }
let cached: { at: number; version: string; available: boolean } | undefined
let pending: Promise<boolean> | undefined

export function releaseIsNewer(release: Release, current: string): boolean {
  const version = release.tag_name?.match(/^v(\d+\.\d+\.\d+)$/)?.[1]
  if (!version || release.draft || release.prerelease || !/^\d+\.\d+\.\d+$/.test(current)) return false
  if (!release.assets?.some(a => a.name === `ChatboxDAV-${version}-android.apk`)) return false
  return compareVersions(version, current) > 0
}

export async function checkDistributionUpdate(version: string): Promise<boolean> {
  if (cached?.version === version && Date.now() - cached.at < 15 * 60_000) return cached.available
  if (pending) return pending
  pending = (async () => {
    let release: Release
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({ url: API, headers: { Accept: 'application/vnd.github+json' }, connectTimeout: 15_000, readTimeout: 15_000 })
      if (response.status === 404) return false
      if (response.status !== 200) throw new Error(`GitHub update check failed (${response.status})`)
      release = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    } else {
      const response = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) })
      if (response.status === 404) return false
      if (!response.ok) throw new Error(`GitHub update check failed (${response.status})`)
      release = await response.json()
    }
    const available = releaseIsNewer(release, version)
    cached = { at: Date.now(), version, available }
    return available
  })()
  try { return await pending } finally { pending = undefined }
}
