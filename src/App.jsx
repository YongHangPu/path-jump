import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Tooltip from '@mui/material/Tooltip'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ContrastRoundedIcon from '@mui/icons-material/ContrastRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import EntryList from './components/EntryList'
import PathBar from './components/PathBar'
import SelectionBar from './components/SelectionBar'
import { subscribeEnter } from './enterBus'

const iconCache = new Map()

const MODE_LABELS = {
  browse: '浏览',
  search: '匹配',
  target: '目标',
  resolved: '已定位',
  invalid: '未识别',
  error: '读取失败'
}

const THEME_META = {
  system: { label: '跟随系统', icon: ContrastRoundedIcon },
  light: { label: '浅色', icon: LightModeRoundedIcon },
  dark: { label: '深色', icon: DarkModeRoundedIcon }
}

const FALLBACK_PLATFORM = {
  platform: 'win32',
  isMac: false,
  isWindows: true,
  fileManager: '资源管理器',
  modifier: 'Ctrl',
  separator: '\\',
  placeholder: '输入路径，如 C:\\Users\\Public',
  pathExample: 'C:\\Users\\Public',
  browseExample: 'C:\\'
}

function readPlatformInfo() {
  try {
    return window.services?.getPlatformInfo?.() || FALLBACK_PLATFORM
  } catch (err) {
    return FALLBACK_PLATFORM
  }
}

export default function App() {
  const [platform] = useState(readPlatformInfo)
  const [query, setQuery] = useState('')
  const [resolution, setResolution] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [quickLinks, setQuickLinks] = useState([])
  const [editingLinks, setEditingLinks] = useState(false)
  const [recentPaths, setRecentPaths] = useState([])
  const [iconMap, setIconMap] = useState({})
  const [banner, setBanner] = useState(null)
  const [snack, setSnack] = useState(null)
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const mode = window.services?.getThemeMode?.()
      return THEME_META[mode] ? mode : 'system'
    } catch (err) {
      return 'system'
    }
  })
  const [systemDark, setSystemDark] = useState(() => {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })

  const inputRef = useRef(null)
  const requestRef = useRef(0)
  const actionLockRef = useRef(false)
  const resolvingRef = useRef(false)
  const pendingRef = useRef('')

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark)

  const theme = useMemo(() => createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: isDark ? '#90caf9' : '#1276c5' }
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
    },
    shape: { borderRadius: 10 }
  }), [isDark])

  const focusInput = useCallback(() => {
    try {
      window.utools?.subInputBlur?.()
    } catch (err) {
      // The main input is already focused outside a sub-input session.
    }
    window.setTimeout(() => inputRef.current?.focus(), 20)
  }, [])

  const exitPlugin = useCallback(() => {
    try {
      window.utools?.hideMainWindow?.()
    } catch (err) {
      // Ignore host window errors and still try to exit the plugin.
    }
    try {
      window.utools?.outPlugin?.()
    } catch (err) {
      // Ignore host exit errors.
    }
  }, [])

  const navigateTo = useCallback((target) => {
    if (!target) return
    const next = /[\\/]$/.test(target) ? target : `${target}${platform.separator}`
    setBanner(null)
    setQuery(next)
    try {
      const updated = window.services?.rememberPath?.(next)
      if (updated) setRecentPaths(updated)
    } catch (err) {
      // Recent history is best-effort.
    }
    focusInput()
  }, [focusInput, platform.separator])

  const copyPath = useCallback((target) => {
    if (!target) return
    let ok = false
    try {
      ok = Boolean(window.services?.copyPath?.(target))
    } catch (err) {
      ok = false
    }
    setSnack({ severity: ok ? 'success' : 'error', message: ok ? '已复制路径' : '复制失败' })
    focusInput()
  }, [focusInput])

  const toggleLinkEditing = useCallback(() => {
    setEditingLinks((current) => !current)
  }, [])

  const addQuickLink = useCallback(() => {
    let target = ''
    try {
      target = window.services?.chooseFolder?.() || ''
    } catch (err) {
      target = ''
    }
    if (!target) return
    const current = window.services?.getQuickLinks?.() || []
    if (current.some((item) => item.path === target)) {
      setSnack({ severity: 'info', message: '这个入口已经存在' })
      return
    }
    let saved = null
    try {
      saved = window.services?.saveQuickLinks?.(current.concat([{ path: target }]))
    } catch (err) {
      saved = null
    }
    if (saved) setQuickLinks(saved)
    else setSnack({ severity: 'error', message: '保存快捷入口失败' })
  }, [])

  const removeQuickLink = useCallback((target) => {
    const current = window.services?.getQuickLinks?.() || []
    let saved = null
    try {
      saved = window.services?.saveQuickLinks?.(current.filter((item) => item.path !== target))
    } catch (err) {
      saved = null
    }
    if (saved) setQuickLinks(saved)
    else setSnack({ severity: 'error', message: '保存快捷入口失败' })
  }, [])

  const resetQuickLinks = useCallback(() => {
    let links = null
    try {
      links = window.services?.resetQuickLinks?.()
    } catch (err) {
      links = null
    }
    if (links) setQuickLinks(links)
    else setSnack({ severity: 'error', message: '恢复默认入口失败' })
  }, [])

  const clearRecentPaths = useCallback(() => {
    let list = []
    try {
      list = window.services?.clearRecentPaths?.() || []
    } catch (err) {
      list = []
    }
    setRecentPaths(list)
  }, [])

  const openEntry = useCallback(async (entry) => {
    if (!entry || actionLockRef.current) return
    actionLockRef.current = true
    setBusy(true)
    try {
      const result = await window.services?.openPath?.(entry.path)
      if (result?.ok) {
        try {
          const updated = window.services?.rememberPath?.(entry.path)
          if (updated) setRecentPaths(updated)
        } catch (err) {
          // Recent history is best-effort.
        }
        exitPlugin()
        return
      }
      setSnack({ severity: 'error', message: result?.message || '无法打开该路径' })
    } catch (err) {
      setSnack({ severity: 'error', message: '无法打开该路径' })
    } finally {
      actionLockRef.current = false
      setBusy(false)
    }
  }, [exitPlugin])

  const openFolder = useCallback(async (target) => {
    if (!target || actionLockRef.current) return
    actionLockRef.current = true
    setBusy(true)
    try {
      const result = await window.services?.openPath?.(target)
      if (result?.ok) {
        exitPlugin()
        return
      }
      setSnack({ severity: 'error', message: result?.message || '无法打开该文件夹' })
    } catch (err) {
      setSnack({ severity: 'error', message: '无法打开该文件夹' })
    } finally {
      actionLockRef.current = false
      setBusy(false)
    }
  }, [exitPlugin])

  const revealEntry = useCallback(async (entry) => {
    if (!entry || actionLockRef.current) return
    if (entry.isDirectory) {
      await openFolder(entry.path)
      return
    }
    actionLockRef.current = true
    setBusy(true)
    let ok = false
    try {
      ok = Boolean(window.services?.revealPath?.(entry.path))
    } catch (err) {
      ok = false
    }
    actionLockRef.current = false
    setBusy(false)
    if (ok) exitPlugin()
    else setSnack({ severity: 'error', message: `无法在${platform.fileManager}中显示该文件` })
  }, [exitPlugin, openFolder, platform.fileManager])

  const activateEntry = useCallback((entry) => {
    if (!entry) return
    if (entry.isDirectory) navigateTo(entry.path)
    else openEntry(entry)
  }, [navigateTo, openEntry])

  const goUp = useCallback(() => {
    const target = resolution?.upDir
    if (target) navigateTo(target)
  }, [resolution, navigateTo])

  const handleDirectOpen = useCallback(async (payload) => {
    if (actionLockRef.current) return
    actionLockRef.current = true
    setBusy(true)
    setBanner(null)
    try {
      const text = typeof payload === 'string' ? payload : String(payload == null ? '' : payload)
      const services = window.services
      if (!services || typeof services.openDirect !== 'function') {
        setBanner({ severity: 'error', text: '本地能力未加载，请在 uTools 客户端中运行' })
        return
      }
      const result = await services.openDirect(text)
      if (result?.ok) {
        exitPlugin()
        return
      }
      setBanner({ severity: 'warning', text: result?.message || '未能定位到可打开的路径' })
      setQuery(result?.candidate || '')
      setResolution(null)
      setSelectedIndex(0)
    } catch (err) {
      setBanner({ severity: 'error', text: '打开路径失败，请检查路径是否正确' })
    } finally {
      actionLockRef.current = false
      setBusy(false)
    }
  }, [exitPlugin])

  useEffect(() => {
    const unsubscribe = subscribeEnter((action) => {
      focusInput()
      const isPathEntry = Boolean(action && (action.type === 'regex' || action.code === 'go-path'))
      if (isPathEntry) {
        setQuery('')
        setResolution(null)
        setSelectedIndex(0)
        handleDirectOpen(action.payload)
        return
      }
      setQuery('')
      setResolution(null)
      setSelectedIndex(0)
      setBanner(null)
    })
    return unsubscribe
  }, [focusInput, handleDirectOpen])

  useEffect(() => {
    const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
    if (!media) return undefined
    const onChange = (event) => setSystemDark(event.matches)
    setSystemDark(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    return undefined
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  }, [isDark])

  const cycleTheme = useCallback(() => {
    const next = themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system'
    setThemeMode(next)
    try {
      window.services?.setThemeMode?.(next)
    } catch (err) {
      // Ignore storage errors; the choice still applies for this session.
    }
  }, [themeMode])

  useEffect(() => {
    try {
      setQuickLinks(window.services?.getQuickLinks?.() || [])
    } catch (err) {
      setQuickLinks([])
    }
    try {
      setRecentPaths(window.services?.getRecentPaths?.() || [])
    } catch (err) {
      setRecentPaths([])
    }
    focusInput()
  }, [focusInput])

  const runResolveRef = useRef(null)
  runResolveRef.current = async (text) => {
    // Only one resolution runs at a time; keystrokes made while it is still in
    // flight queue the newest text, so a slow share cannot pile up readdir and
    // stat batches faster than they complete.
    if (resolvingRef.current) {
      pendingRef.current = text
      return
    }
    resolvingRef.current = true
    setResolving(true)
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    try {
      let result
      if (window.services && typeof window.services.resolveQuery === 'function') {
        result = await window.services.resolveQuery(text)
      } else {
        result = {
          mode: 'error',
          error: '本地能力未加载，请在 uTools 客户端中运行',
          entries: [],
          segments: []
        }
      }
      if (requestRef.current === requestId) {
        setResolution(result)
        setSelectedIndex(0)
      }
    } catch (err) {
      if (requestRef.current === requestId) {
        setResolution({
          mode: 'error',
          error: '读取路径失败，请稍后重试',
          entries: [],
          segments: []
        })
      }
    } finally {
      if (requestRef.current === requestId) setResolving(false)
      resolvingRef.current = false
      const next = pendingRef.current
      pendingRef.current = ''
      if (next) runResolveRef.current(next)
    }
  }

  useEffect(() => {
    const text = query.trim()
    if (!text) {
      requestRef.current += 1
      pendingRef.current = ''
      setResolution(null)
      setResolving(false)
      return undefined
    }

    setEditingLinks(false)
    setResolving(true)

    const timer = window.setTimeout(() => {
      runResolveRef.current(text)
    }, 90)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const entries = resolution?.entries || []
    if (!entries.length) return undefined

    // Icons are cached per type (folder / extension) to keep IPC calls low, but
    // the system API expects a real file path, so keep one sample path per type.
    const samples = new Map()
    for (const entry of entries) {
      const key = entry.isDirectory ? 'folder' : entry.ext || entry.path
      if (!samples.has(key)) samples.set(key, entry.path)
    }

    let cancelled = false

    const loadIcon = async (key, samplePath) => {
      if (!window.utools || typeof window.utools.getFileIconAsync !== 'function') return
      let promise = iconCache.get(key)
      if (!promise) {
        promise = window.utools.getFileIconAsync(samplePath).catch(() => '')
        iconCache.set(key, promise)
      }
      try {
        const url = await promise
        if (!cancelled && url) {
          setIconMap((current) => (current[key] ? current : { ...current, [key]: url }))
        }
      } catch (err) {
        // Fallback icon is used when the system icon is unavailable.
      }
    }

    samples.forEach((samplePath, key) => loadIcon(key, samplePath))

    return () => {
      cancelled = true
    }
  }, [resolution])

  const entries = resolution?.entries || []
  const selectedEntry = entries[selectedIndex] || null

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key

      if (event.altKey && key === 'ArrowUp') {
        event.preventDefault()
        if (resolution && resolution.input === query) goUp()
        return
      }

      if (!event.altKey && key === 'ArrowDown' && entries.length > 0) {
        event.preventDefault()
        setSelectedIndex((index) => (index + 1) % entries.length)
        return
      }

      if (!event.altKey && key === 'ArrowUp' && entries.length > 0) {
        event.preventDefault()
        setSelectedIndex((index) => (index - 1 + entries.length) % entries.length)
        return
      }

      if (key === 'Enter') {
        event.preventDefault()
        if (!resolution || resolution.input !== query) return
        if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
          // Open the directory currently being browsed, not the selected entry.
          if (resolution.baseDir) openFolder(resolution.baseDir)
          return
        }
        const entry = entries[selectedIndex]
        if (!entry) {
          setSnack({ severity: 'info', message: '当前没有可打开的项目' })
          return
        }
        if (event.ctrlKey || event.metaKey) revealEntry(entry)
        else activateEntry(entry)
        return
      }

      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'c') {
        const input = inputRef.current
        const hasTextSelection = input && input.selectionStart !== input.selectionEnd
        const entry = entries[selectedIndex]
        if (!hasTextSelection && entry && resolution && resolution.input === query) {
          event.preventDefault()
          copyPath(entry.path)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entries, selectedIndex, resolution, query, activateEntry, revealEntry, goUp, copyPath, openFolder])

  const modeLabel = !query
    ? '就绪'
    : resolution?.mode
      ? MODE_LABELS[resolution.mode] || ''
      : '读取中'

  const ThemeIcon = THEME_META[themeMode].icon

  const statusText = !query
    ? (platform.isMac ? '输入路径开始' : '输入盘符或路径开始')
    : resolution?.error
      ? resolution.error
      : `${modeLabel} · ${entries.length} 项${resolution?.truncated ? '（仅显示前 300 项）' : ''}`

  return (
    <ThemeProvider theme={theme}>
      <Box
        className="app"
        onMouseDown={(event) => {
          if (event.target.tagName !== 'INPUT') focusInput()
        }}
      >
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark">
              <FolderOpenRoundedIcon sx={{ fontSize: 18 }} />
            </div>
            <div className="brand-copy">
              <div className="brand-title">路径秒开</div>
              <div className="brand-sub">输入路径，秒开文件与文件夹</div>
            </div>
          </div>
          <div className="header-right">
            <Tooltip title={`主题：${THEME_META[themeMode].label}（点击切换）`} arrow placement="bottom">
              <IconButton
                size="small"
                onClick={cycleTheme}
                aria-label="切换主题"
                sx={{ color: 'var(--fg-secondary)', padding: '5px' }}
              >
                {ThemeIcon && <ThemeIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
            <div className="header-hint">go</div>
          </div>
        </header>

        <div className="search-shell">
          <SearchRoundedIcon className="search-icon" sx={{ fontSize: 21 }} />
          <input
            ref={inputRef}
            className="path-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (banner) setBanner(null)
            }}
            placeholder={platform.placeholder}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          {query && (
            <IconButton
              size="small"
              onClick={() => {
                setQuery('')
                setResolution(null)
                setBanner(null)
                focusInput()
              }}
              sx={{ color: 'var(--fg-tertiary)', padding: '4px' }}
            >
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
          {(resolving || busy) && (
            <CircularProgress size={15} sx={{ color: 'var(--primary)', flex: '0 0 auto' }} />
          )}
        </div>

        <div className="content-card">
          <PathBar
            resolution={resolution}
            busy={busy}
            platform={platform}
            onNavigate={navigateTo}
            onCopyDir={copyPath}
            onOpenDir={openFolder}
          />

          {banner && (
            <div className={`banner ${banner.severity || 'warning'}`}>
              <WarningAmberRoundedIcon sx={{ fontSize: 15, flex: '0 0 auto' }} />
              <span>{banner.text}</span>
            </div>
          )}

          <EntryList
            resolution={resolution}
            query={query}
            loading={resolving}
            selectedIndex={selectedIndex}
            iconMap={iconMap}
            quickLinks={quickLinks}
            platform={platform}
            editingLinks={editingLinks}
            recentPaths={recentPaths}
            onSelect={setSelectedIndex}
            onActivate={activateEntry}
            onOpen={activateEntry}
            onCopy={copyPath}
            onReveal={revealEntry}
            onQuickLink={navigateTo}
            onToggleLinkEditing={toggleLinkEditing}
            onAddLink={addQuickLink}
            onRemoveLink={removeQuickLink}
            onResetLinks={resetQuickLinks}
            onClearRecent={clearRecentPaths}
          />
          <SelectionBar
            entry={selectedEntry}
            busy={busy}
            platform={platform}
            onOpen={activateEntry}
            onReveal={revealEntry}
          />
        </div>

        <footer className="status-bar">
          <div className="status-text" title={statusText}>{statusText}</div>
          <div className="status-keys">
            <span className="key"><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span className="key"><kbd>Enter</kbd> 进入/打开</span>
            <span className="key"><kbd>{platform.modifier}</kbd><kbd>Enter</kbd> {platform.fileManager}</span>
            <span className="key"><kbd>{platform.modifier}</kbd><kbd>Shift</kbd><kbd>Enter</kbd> 当前目录</span>
            <span className="key"><kbd>Alt</kbd><kbd>↑</kbd> 上级</span>
            <span className="key"><kbd>{platform.modifier}</kbd><kbd>C</kbd> 复制</span>
          </div>
        </footer>

        <Snackbar
          open={Boolean(snack)}
          autoHideDuration={1800}
          onClose={() => setSnack(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={snack?.severity || 'info'}
            variant="filled"
            onClose={() => setSnack(null)}
            sx={{ borderRadius: '9px', fontSize: 13 }}
          >
            {snack?.message || ''}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  )
}
