const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const {
  extractCandidate,
  normalizePath,
  trimNoise,
  parentOf,
  buildSegments
} = require('./path-utils')

const MAX_ENTRIES = 300
const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR', 'EINVAL', 'ENAMETOOLONG', 'UNKNOWN', 'ERR_INVALID_ARG_VALUE'])

function detectPlatform() {
  try {
    if (typeof utools !== 'undefined') {
      if (utools.isMacOS()) return 'darwin'
      if (utools.isWindows()) return 'win32'
      if (typeof utools.isLinux === 'function' && utools.isLinux()) return 'linux'
    }
  } catch (err) {
    // Fall back to the runtime process platform below.
  }
  return process.platform
}

const PLATFORM = detectPlatform()
const IS_MAC = PLATFORM === 'darwin'
const IS_WINDOWS = PLATFORM === 'win32'

if (typeof utools !== 'undefined' && typeof utools.onPluginEnter === 'function') {
  utools.onPluginEnter((action) => {
    const detail = { action, at: Date.now() + Math.random() }
    window.__utoolsEnter = detail
    window.dispatchEvent(new CustomEvent('utools-plugin-enter', { detail }))
  })
}

function baseResult(overrides) {
  return Object.assign({
    mode: 'invalid',
    input: '',
    candidate: '',
    resolvedPath: '',
    baseDir: null,
    filter: '',
    entries: [],
    truncated: false,
    upDir: null,
    segments: [],
    notice: null,
    error: null
  }, overrides)
}

async function statSafe(target) {
  try {
    return await fsp.stat(target)
  } catch (err) {
    if (err && MISSING_CODES.has(err.code)) return null
    throw err
  }
}

function fsErrorMessage(err, target) {
  const code = err && err.code
  if (code === 'EACCES' || code === 'EPERM') return `没有权限访问：${target}`
  if (code === 'ENOENT') return `文件夹不存在：${target}`
  if (code === 'ENOTDIR') return `不是文件夹：${target}`
  return `无法读取文件夹：${target}`
}

function compareDirents(a, b) {
  const aDir = a.isDirectory() ? 0 : 1
  const bDir = b.isDirectory() ? 0 : 1
  if (aDir !== bDir) return aDir - bDir
  return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function makeEntry(fullPath, fallbackIsDirectory) {
  let isDirectory = Boolean(fallbackIsDirectory)
  let size = 0
  let mtime = 0
  try {
    const st = await fsp.stat(fullPath)
    isDirectory = st.isDirectory()
    size = st.isFile() ? st.size : 0
    mtime = st.mtimeMs || 0
  } catch (err) {
    // Unreadable entries are still listed with the type reported by readdir.
  }
  const name = path.basename(fullPath)
  return {
    name,
    path: fullPath,
    isDirectory,
    ext: isDirectory ? '' : path.extname(name).toLowerCase(),
    size,
    mtime
  }
}

// Relevance tiers: exact name > prefix > contains > fuzzy subsequence.
function matchScore(name, needle) {
  const lower = name.toLowerCase()
  if (lower === needle) return 0
  if (lower.startsWith(needle)) return 1
  if (lower.includes(needle)) return 2
  let cursor = 0
  for (let i = 0; i < lower.length && cursor < needle.length; i += 1) {
    if (lower[i] === needle[cursor]) cursor += 1
  }
  return cursor === needle.length ? 3 : -1
}

async function listEntries(dir, filter) {
  try {
    const dirents = await fsp.readdir(dir, { withFileTypes: true })
    const needle = String(filter || '').toLowerCase()
    let matched
    if (needle) {
      const scored = []
      for (const entry of dirents) {
        const score = matchScore(entry.name, needle)
        if (score >= 0) scored.push({ entry, score })
      }
      scored.sort((a, b) => a.score - b.score || compareDirents(a.entry, b.entry))
      matched = scored.map((item) => item.entry)
    } else {
      matched = dirents.slice()
      matched.sort(compareDirents)
    }
    const truncated = matched.length > MAX_ENTRIES
    const visible = matched.slice(0, MAX_ENTRIES)
    const entries = await mapLimit(visible, 24, (entry) => {
      return makeEntry(path.join(dir, entry.name), entry.isDirectory())
    })
    return { entries, truncated, error: null }
  } catch (err) {
    return { entries: [], truncated: false, error: fsErrorMessage(err, dir) }
  }
}

async function makeListingResult(options) {
  const listed = await listEntries(options.baseDir, options.filter)
  return baseResult({
    mode: listed.error ? 'error' : options.mode,
    input: options.input,
    candidate: options.candidate,
    resolvedPath: options.resolvedPath || options.baseDir,
    baseDir: options.baseDir,
    filter: options.filter,
    entries: listed.entries,
    truncated: listed.truncated,
    upDir: parentOf(options.baseDir),
    segments: buildSegments(options.baseDir),
    notice: options.notice || null,
    error: listed.error,
    remainder: options.remainder || ''
  })
}

async function trimTrailingToken(candidate) {
  const separator = candidate.lastIndexOf(path.sep)
  if (separator < 0 || separator === candidate.length - 1) return null
  const head = candidate.slice(0, separator + 1)
  const tail = candidate.slice(separator + 1)
  if (!/\s/.test(tail)) return null
  const tokens = tail.split(/\s+/).filter(Boolean)
  for (let count = tokens.length - 1; count >= 1; count -= 1) {
    const probe = head + tokens.slice(0, count).join(' ')
    const stat = await statSafe(probe)
    if (stat) return { path: probe, stat }
  }
  return null
}

async function walkToExisting(candidate) {
  let probe = candidate.replace(/[\\/]+$/, '')
  const remainder = []
  while (probe) {
    const parent = path.dirname(probe)
    if (!parent || parent === probe) return null
    remainder.unshift(path.basename(probe))
    probe = parent
    const stat = await statSafe(probe)
    if (stat) return { path: probe, stat, remainder }
  }
  return null
}

// Text glued to the end of a path (common when copying from a Chinese sentence,
// e.g. "C:\Users\Yhong\Documents目录下") survives trimming and token removal.
// When the walk leaves exactly one unresolved segment, peel it from the right
// one character at a time until the remaining prefix exists.
async function trimWalkedTail(walked) {
  if (!walked || walked.remainder.length !== 1) return null
  const tail = walked.remainder[0]
  for (let length = tail.length - 1; length >= 1; length -= 1) {
    const probe = path.join(walked.path, tail.slice(0, length))
    const stat = await statSafe(probe)
    if (stat) return { path: probe, stat }
  }
  return null
}

// A single letter ("C") is treated as that drive's root, so the very first
// keystroke browses the drive instead of reporting an unrecognised path.
function expandDriveLetter(raw) {
  if (!IS_WINDOWS) return null
  const text = String(raw == null ? '' : raw).trim()
  return /^[A-Za-z]$/.test(text) ? `${text.toUpperCase()}:\\` : null
}

async function resolveQuery(raw) {
  const extracted = extractCandidate(raw) || expandDriveLetter(raw)
  if (!extracted) {
    return baseResult({
      mode: 'invalid',
      input: raw,
      error: '未能从输入中识别出有效路径'
    })
  }

  const candidate = normalizePath(extracted)
  const wantsDirectory = /[\\/]$/.test(extracted) || /^[A-Za-z]:$/.test(extracted.trim())

  let found = null
  try {
    let stat = await statSafe(candidate)
    let resolvedPath = candidate
    let how = 'exact'

    if (!stat) {
      const cleaned = trimNoise(candidate)
      if (cleaned && cleaned !== candidate) {
        stat = await statSafe(cleaned)
        if (stat) {
          resolvedPath = cleaned
          how = 'trim'
        }
      }
    }

    if (!stat) {
      const tokenMatch = await trimTrailingToken(candidate)
      if (tokenMatch) {
        stat = tokenMatch.stat
        resolvedPath = tokenMatch.path
        how = 'token'
      }
    }

    if (stat) {
      found = { path: resolvedPath, stat, how, remainder: [] }
    } else {
      const walked = await walkToExisting(candidate)
      if (walked) {
        const tail = await trimWalkedTail(walked)
        found = tail
          ? { path: tail.path, stat: tail.stat, how: 'tail', remainder: [] }
          : { path: walked.path, stat: walked.stat, how: 'walk', remainder: walked.remainder }
      }
    }
  } catch (err) {
    // An unreadable directory still has a parent and a breadcrumb trail. Keep
    // that context so the user can navigate back instead of getting stuck.
    return baseResult({
      mode: 'error',
      input: raw,
      candidate,
      resolvedPath: candidate,
      baseDir: candidate,
      upDir: parentOf(candidate),
      segments: buildSegments(candidate),
      error: fsErrorMessage(err, candidate)
    })
  }

  if (!found) {
    return baseResult({
      mode: 'invalid',
      input: raw,
      candidate,
      error: `无法定位到存在的目录：${candidate}`
    })
  }

  const locatedNotice = ['token', 'trim', 'tail'].includes(found.how)
    ? `已从输入中定位到：${found.path}`
    : null

  if (found.stat.isFile()) {
    const parent = path.dirname(found.path)
    const entry = await makeEntry(found.path, false)
    return baseResult({
      mode: 'target',
      input: raw,
      candidate,
      resolvedPath: found.path,
      baseDir: parent,
      filter: path.basename(found.path),
      entries: [entry],
      upDir: parentOf(parent),
      segments: buildSegments(parent),
      notice: locatedNotice
    })
  }

  if (found.how === 'walk') {
    const baseDir = found.path
    const filter = found.remainder[0] || ''
    const deep = wantsDirectory || found.remainder.length > 1
    return makeListingResult({
      input: raw,
      candidate,
      baseDir,
      filter,
      mode: deep ? 'resolved' : 'search',
      notice: deep ? `完整路径不存在，已定位到最近的可用目录：${baseDir}` : null,
      remainder: found.remainder.join(path.sep)
    })
  }

  if (wantsDirectory || path.dirname(found.path) === found.path) {
    return makeListingResult({
      input: raw,
      candidate,
      baseDir: found.path,
      filter: '',
      mode: found.how === 'exact' ? 'browse' : 'resolved',
      notice: locatedNotice
    })
  }

  const parent = path.dirname(found.path)
  const name = path.basename(found.path)
  return makeListingResult({
    input: raw,
    candidate,
    baseDir: parent,
    filter: name,
    mode: found.how === 'exact' ? 'search' : 'resolved',
    notice: locatedNotice
  })
}

async function resolveForOpen(raw) {
  const extracted = extractCandidate(raw)
  if (!extracted) return { candidate: '', target: null }

  const candidate = normalizePath(extracted)
  let stat = await statSafe(candidate)
  let resolvedPath = candidate

  if (!stat) {
    const cleaned = trimNoise(candidate)
    if (cleaned && cleaned !== candidate) {
      stat = await statSafe(cleaned)
      if (stat) resolvedPath = cleaned
    }
  }

  if (!stat) {
    const tokenMatch = await trimTrailingToken(candidate)
    if (tokenMatch) {
      stat = tokenMatch.stat
      resolvedPath = tokenMatch.path
    }
  }

  if (stat) {
    return { candidate, target: { path: resolvedPath, isDirectory: stat.isDirectory() } }
  }

  const walked = await walkToExisting(candidate)
  if (walked) {
    return { candidate, target: { path: walked.path, isDirectory: walked.stat.isDirectory() } }
  }

  return { candidate, target: null }
}

async function openDirect(raw) {
  let resolved
  try {
    resolved = await resolveForOpen(raw)
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      candidate: '',
      message: '读取路径失败，请检查路径是否正确'
    }
  }

  if (!resolved.candidate) {
    return {
      ok: false,
      reason: 'invalid',
      candidate: '',
      message: '未能从输入中识别出有效路径'
    }
  }

  if (!resolved.target) {
    return {
      ok: false,
      reason: 'not-found',
      candidate: resolved.candidate,
      message: `未找到存在的路径：${resolved.candidate}`
    }
  }

  try {
    const error = await utools.shellOpenPath(resolved.target.path)
    if (error) {
      return {
        ok: false,
        reason: 'open-failed',
        candidate: resolved.candidate,
        path: resolved.target.path,
        message: '系统无法打开该路径'
      }
    }
    return {
      ok: true,
      candidate: resolved.candidate,
      path: resolved.target.path,
      isDirectory: resolved.target.isDirectory
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'open-failed',
      candidate: resolved.candidate,
      path: resolved.target.path,
      message: '系统无法打开该路径'
    }
  }
}

async function openPath(target) {
  if (!target || typeof target !== 'string') {
    return { ok: false, message: '路径无效' }
  }
  try {
    const error = await utools.shellOpenPath(target)
    if (error) return { ok: false, message: '系统无法打开该路径' }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: '系统无法打开该路径' }
  }
}

function revealPath(target) {
  if (!target) return false
  try {
    utools.shellShowItemInFolder(target)
    return true
  } catch (err) {
    return false
  }
}

function copyPath(value) {
  if (!value) return false
  try {
    return utools.copyText(String(value))
  } catch (err) {
    return false
  }
}

function getSystemPath(name) {
  try {
    return utools.getPath(name) || ''
  } catch (err) {
    return ''
  }
}

function buildDefaultQuickLinks() {
  const links = []
  const definitions = [
    { label: '主目录', icon: 'home', name: 'home' },
    { label: '桌面', icon: 'desktop', name: 'desktop' },
  ]

  for (const item of definitions) {
    const target = getSystemPath(item.name)
    if (target) links.push({ label: item.label, icon: item.icon, path: target })
  }

  if (IS_WINDOWS) {
    const drives = []
    for (let code = 67; code <= 90; code += 1) {
      const letter = String.fromCharCode(code)
      const root = `${letter}:\\`
      try {
        if (fs.existsSync(root)) drives.push({ label: `${letter} 盘`, icon: 'drive', path: root })
      } catch (err) {
        // Unreachable drive letters (e.g. disconnected network mappings) are skipped.
      }
    }
    links.unshift(...drives)
  } else if (IS_MAC) {
    const volumes = []
    try {
      for (const item of fs.readdirSync('/Volumes', { withFileTypes: true })) {
        const target = path.join('/Volumes', item.name)
        try {
          if (fs.existsSync(target)) volumes.push({ label: item.name, icon: 'drive', path: target })
        } catch (err) {
          // Skip volumes that cannot be probed.
        }
      }
    } catch (err) {
      // /Volumes always exists on macOS; keep going without volume links.
    }
    links.unshift(...volumes)

    try {
      if (fs.existsSync('/Applications')) {
        links.push({ label: '应用程序', icon: 'apps', path: '/Applications' })
      }
    } catch (err) {
      // Skip when the Applications folder cannot be checked.
    }
  }

  return links
}

const QUICK_LINKS_KEY = 'quick-links'

// A stored list replaces the platform defaults entirely. An empty list is a
// valid choice, so only a missing entry falls back to the defaults.
function inferLinkIcon(target) {
  if (!target) return 'folder'
  if (/^[A-Za-z]:[\\/]?$/.test(target)) return 'drive'
  if (target === getSystemPath('home')) return 'home'
  if (target === getSystemPath('desktop')) return 'desktop'
  if (target === '/Applications') return 'apps'
  return 'folder'
}

function normalizeLink(item) {
  if (!item || typeof item !== 'object') return null
  const target = String(item.path == null ? '' : item.path).trim()
  if (!target) return null
  let label = String(item.label == null ? '' : item.label).trim()
  if (!label && /^[A-Za-z]:[\\/]?$/.test(target)) label = `${target[0].toUpperCase()} 盘`
  if (!label) {
    const trimmed = target.replace(/[\\/]+$/, '')
    label = path.basename(trimmed) || trimmed || target
  }
  return { label, path: target }
}

function readStoredLinks() {
  let raw
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) {
      raw = utools.dbStorage.getItem(QUICK_LINKS_KEY)
    }
  } catch (err) {
    raw = undefined
  }
  if (!Array.isArray(raw)) return null
  return raw.map(normalizeLink).filter(Boolean)
}

function writeStoredLinks(list) {
  const cleaned = []
  const seen = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    const link = normalizeLink(item)
    if (!link) continue
    const key = IS_WINDOWS ? link.path.toLowerCase() : link.path
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(link)
  }
  try {
    if (typeof utools === 'undefined' || !utools.dbStorage) return false
    utools.dbStorage.setItem(QUICK_LINKS_KEY, cleaned)
    return true
  } catch (err) {
    return false
  }
}

function getQuickLinks() {
  const stored = readStoredLinks()
  const items = stored === null ? buildDefaultQuickLinks() : stored
  return items.map((item) => ({
    label: item.label,
    path: item.path,
    icon: item.icon || inferLinkIcon(item.path)
  }))
}

function saveQuickLinks(list) {
  return writeStoredLinks(list) ? getQuickLinks() : null
}

function resetQuickLinks() {
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) {
      utools.dbStorage.removeItem(QUICK_LINKS_KEY)
    }
  } catch (err) {
    return null
  }
  return getQuickLinks()
}

function chooseFolder() {
  try {
    if (typeof utools === 'undefined' || typeof utools.showOpenDialog !== 'function') return ''
    const chosen = utools.showOpenDialog({
      title: '选择要添加的快捷入口',
      properties: ['openDirectory', 'createDirectory']
    })
    return Array.isArray(chosen) && chosen.length ? chosen[0] : ''
  } catch (err) {
    return ''
  }
}

const RECENT_KEY = 'recent-paths'
const RECENT_LIMIT = 6

function linkLabel(target) {
  if (!target) return ''
  if (/^[A-Za-z]:[\\/]?$/.test(target)) return `${target[0].toUpperCase()} 盘`
  const trimmed = target.replace(/[\\/]+$/, '')
  return path.basename(trimmed) || trimmed || target
}

function readRecentPaths() {
  let raw
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) raw = utools.dbStorage.getItem(RECENT_KEY)
  } catch (err) {
    raw = undefined
  }
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item.path === 'string' && item.path)
    .slice(0, RECENT_LIMIT)
}

function getRecentPaths() {
  return readRecentPaths().map((item) => ({
    path: item.path,
    label: linkLabel(item.path),
    at: Number(item.at) || 0
  }))
}

// Opening a file remembers its parent folder, so the list always points at a
// directory the user can actually return to.
function rememberPath(target) {
  if (typeof target !== 'string' || !target.trim()) return getRecentPaths()
  let probe = target.trim()
  if (IS_WINDOWS) probe = probe.replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`)
  try {
    if (fs.statSync(probe).isFile()) probe = path.dirname(probe)
  } catch (err) {
    // Keep the path as given when it cannot be inspected.
  }
  const key = IS_WINDOWS ? probe.toLowerCase() : probe
  const list = readRecentPaths().filter((item) => {
    const itemKey = IS_WINDOWS ? item.path.toLowerCase() : item.path
    return itemKey !== key
  })
  list.unshift({ path: probe, at: Date.now() })
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) {
      utools.dbStorage.setItem(RECENT_KEY, list.slice(0, RECENT_LIMIT))
    }
  } catch (err) {
    // Recording is best-effort; browsing must not fail because of it.
  }
  return getRecentPaths()
}

function clearRecentPaths() {
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) utools.dbStorage.removeItem(RECENT_KEY)
  } catch (err) {
    return []
  }
  return []
}

const THEME_KEY = 'theme-mode'
const THEME_MODES = new Set(['system', 'light', 'dark'])

function getThemeMode() {
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) {
      const stored = utools.dbStorage.getItem(THEME_KEY)
      if (THEME_MODES.has(stored)) return stored
    }
  } catch (err) {
    // Fall through to localStorage below.
  }
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (THEME_MODES.has(stored)) return stored
  } catch (err) {
    // Storage unavailable, keep the default.
  }
  return 'system'
}

function setThemeMode(mode) {
  if (!THEME_MODES.has(mode)) return
  try {
    if (typeof utools !== 'undefined' && utools.dbStorage) {
      utools.dbStorage.setItem(THEME_KEY, mode)
      return
    }
  } catch (err) {
    // Fall through to localStorage below.
  }
  try {
    window.localStorage.setItem(THEME_KEY, mode)
  } catch (err) {
    // Storage unavailable, the setting only lives for this session.
  }
}

function getPlatformInfo() {
  return {
    platform: PLATFORM,
    isMac: IS_MAC,
    isWindows: IS_WINDOWS,
    fileManager: IS_MAC ? '访达' : IS_WINDOWS ? '资源管理器' : '文件管理器',
    modifier: IS_MAC ? '⌘' : 'Ctrl',
    alt: IS_MAC ? '⌥' : 'Alt',
    separator: path.sep,
    placeholder: IS_MAC ? '输入路径，如 /Users/你的用户名/Documents' : '输入路径，如 C:\\Users\\Public',
    pathExample: IS_MAC ? '~/Documents' : 'C:\\Users\\Public',
    browseExample: IS_MAC ? '/' : 'C:\\'
  }
}

window.services = {
  resolveQuery,
  openDirect,
  openPath,
  revealPath,
  copyPath,
  getQuickLinks,
  saveQuickLinks,
  resetQuickLinks,
  chooseFolder,
  getRecentPaths,
  rememberPath,
  clearRecentPaths,
  getPlatformInfo,
  getThemeMode,
  setThemeMode
}
