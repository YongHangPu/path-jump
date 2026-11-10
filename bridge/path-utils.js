const path = require('node:path')
const os = require('node:os')

const IS_WINDOWS = path.sep === '\\'
const SEP = path.sep

const QUOTE_CHARS = new Set(['"', "'", '`', '“', '”', '‘', '’', '「', '」', '『', '』'])
const TERMINATOR_QUOTES = new Set(['"', '“', '”'])
const BOUNDARY_CHARS = new Set([
  ' ', '\t', '"', "'", '`', '“', '”', '‘', '’', '「', '」', '『', '』',
  '（', '(', '[', '【', '=', '，', '：', '、'
])

const WINDOWS_PATH_START_RE = /^(?:[A-Za-z]:(?:[\\/]|$)|\\\\[^\\/\s]+[\\/])/
// The negative lookbehind keeps URL schemes from being read as a drive letter:
// without it "https://example.com/a" matches the "s:/" part and becomes "S:\example.com\a".
const WINDOWS_PATH_FIND_RE = /(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])/

function stripWrappingQuotes(input) {
  let text = String(input == null ? '' : input).trim()
  let changed = true
  while (changed && text) {
    changed = false
    if (QUOTE_CHARS.has(text[0])) {
      text = text.slice(1).trim()
      changed = true
    }
    if (text && QUOTE_CHARS.has(text[text.length - 1])) {
      text = text.slice(0, -1).trim()
      changed = true
    }
  }
  return text
}

function findClosingQuote(value) {
  for (let i = 1; i < value.length; i += 1) {
    if (TERMINATOR_QUOTES.has(value[i])) return i
  }
  return -1
}

function sanitize(value) {
  return value
    .replace(/["“”]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
}

function isPosixPathStart(text, index) {
  if (index > 0 && !BOUNDARY_CHARS.has(text[index - 1])) return false
  if (text[index] === '~') {
    return index === text.length - 1 || text[index + 1] === '/'
  }
  if (text[index] === '/') {
    return index === text.length - 1 || !/[\s/]/.test(text[index + 1])
  }
  return false
}

function findPosixPathIndex(text) {
  for (let i = 0; i < text.length; i += 1) {
    if (isPosixPathStart(text, i)) return i
  }
  return -1
}

function extractCandidate(raw) {
  const text = String(raw == null ? '' : raw).trim()
  if (!text) return null

  let candidate = stripWrappingQuotes(text)
  let quoteBefore = ''

  if (IS_WINDOWS) {
    if (!WINDOWS_PATH_START_RE.test(candidate)) {
      const match = WINDOWS_PATH_FIND_RE.exec(text)
      if (!match) return null
      candidate = stripWrappingQuotes(text.slice(match.index))
    }
  } else {
    if (!isPosixPathStart(candidate, 0)) {
      const index = findPosixPathIndex(text)
      if (index < 0) return null
      quoteBefore = index > 0 ? text[index - 1] : ''
      candidate = stripWrappingQuotes(text.slice(index))
    }
  }

  const end = findClosingQuote(candidate)
  if (end > 0) candidate = candidate.slice(0, end)

  if (quoteBefore === "'") {
    const singleEnd = candidate.indexOf("'")
    if (singleEnd > 0) candidate = candidate.slice(0, singleEnd)
  }

  candidate = sanitize(candidate)
  return candidate || null
}

function normalizePath(value) {
  let text = String(value == null ? '' : value).trim()

  if (IS_WINDOWS) {
    if (/^[A-Za-z]:$/.test(text)) text += '\\'
    text = text.replace(/\//g, '\\')
    const isUnc = text.startsWith('\\\\')
    text = text.replace(/\\{2,}/g, '\\')
    if (isUnc) text = '\\' + text
    text = text.replace(/^([a-z]):/, (_, drive) => drive.toUpperCase() + ':')
    return text
  }

  if (text === '~') return os.homedir()
  if (text.startsWith('~/')) return path.join(os.homedir(), text.slice(2))
  return text.replace(/\/{2,}/g, '/')
}

function trimNoise(value) {
  return String(value)
    .replace(/[\s　。，、；：！？,;:!?)\]}》」』】）]+$/g, '')
    .replace(/\.+$/g, '')
    .trim()
}

function parentOf(value) {
  if (!value) return null
  const trimmed = String(value).replace(/[\\/]+$/, '')
  if (!trimmed) return null
  const parent = path.dirname(trimmed)
  if (!parent || parent === trimmed) return null
  return parent.endsWith(SEP) ? parent : parent + SEP
}

function buildSegments(value) {
  if (!value) return []

  if (IS_WINDOWS) {
    const normalized = String(value).replace(/\//g, '\\')

    if (normalized.startsWith('\\\\')) {
      const parts = normalized.replace(/^\\\\/, '').split('\\').filter(Boolean)
      if (parts.length >= 2) {
        const root = '\\\\' + parts[0] + '\\' + parts[1]
        const segments = [{ label: root, path: root + '\\' }]
        let current = root
        for (const part of parts.slice(2)) {
          current += '\\' + part
          segments.push({ label: part, path: current + '\\' })
        }
        return segments
      }
    }

    const match = normalized.match(/^([A-Za-z]:)\\?(.*)$/)
    if (!match) {
      return [{ label: normalized, path: normalized.endsWith('\\') ? normalized : normalized + '\\' }]
    }

    const drive = match[1].toUpperCase()
    const parts = match[2].split('\\').filter(Boolean)
    const segments = [{ label: drive, path: drive + '\\' }]
    let current = drive + '\\'
    for (const part of parts) {
      current = current.endsWith('\\') ? current + part : current + '\\' + part
      segments.push({ label: part, path: current + '\\' })
    }
    return segments
  }

  const parts = String(value).split('/').filter(Boolean)
  const segments = [{ label: '/', path: '/' }]
  let current = ''
  for (const part of parts) {
    current += '/' + part
    segments.push({ label: part, path: current + '/' })
  }
  return segments
}

module.exports = {
  extractCandidate,
  normalizePath,
  trimNoise,
  parentOf,
  buildSegments
}
