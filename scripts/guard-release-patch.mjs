export function releasePatchAllowed(path) {
  if (path.split('/').includes('..') || /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(path)) return false
  return (/^(webdav-module\/(src|android\/src)\/|integration\/renderer\/)/.test(path) || path === 'integration/plugin.mjs') && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
}
