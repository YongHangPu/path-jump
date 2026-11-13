import { useEffect, useRef } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

export default function PathBar({ resolution, busy, platform, onNavigate, onCopyDir, onOpenDir }) {
  const segments = resolution?.segments || []
  const upDir = resolution?.upDir || null
  const baseDir = resolution?.baseDir || null
  const isSearch = resolution?.mode === 'search' && resolution?.filter
  const scrollRef = useRef(null)

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollLeft = element.scrollWidth
  }, [baseDir, segments.length])

  return (
    <>
      <div className="path-bar">
        <Tooltip title="返回上级 (Alt+↑)">
          <span>
            <IconButton
              size="small"
              disabled={!upDir || busy}
              onClick={() => upDir && onNavigate(upDir, baseDir)}
              sx={{ color: 'var(--fg-secondary)' }}
            >
              <ArrowUpwardRoundedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </span>
        </Tooltip>

        <div className="path-scroll" ref={scrollRef}>
          {segments.length === 0 ? (
            <span className="path-placeholder">输入路径开始浏览</span>
          ) : (
            segments.map((segment, index) => {
              const current = index === segments.length - 1
              return (
                <span className="crumb-item" key={`${segment.path}-${index}`}>
                  {index > 0 && (
                    <ChevronRightRoundedIcon className="crumb-sep" sx={{ fontSize: 14 }} />
                  )}
                  <button
                    type="button"
                    className={current ? 'crumb current' : 'crumb'}
                    disabled={busy}
                    onClick={() => {
                      if (current) return
                      // Jumping to an ancestor should land on the branch we came from.
                      onNavigate(segment.path, segments[index + 1] ? segments[index + 1].path : '')
                    }}
                    title={segment.path}
                  >
                    {segment.label}
                  </button>
                </span>
              )
            })
          )}
          {isSearch && <span className="filter-chip">筛选 “{resolution.filter}”</span>}
        </div>

        {baseDir && (
          <div className="path-actions">
            <Tooltip title="复制当前文件夹路径">
              <IconButton
                size="small"
                onClick={() => onCopyDir(baseDir)}
                sx={{ color: 'var(--fg-secondary)', borderRadius: '7px' }}
              >
                <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={`在${platform.fileManager}中打开当前目录（${platform.modifier}+Shift+Enter）`}>
              <IconButton
                size="small"
                disabled={busy}
                onClick={() => onOpenDir(baseDir)}
                sx={{
                  color: 'var(--primary)',
                  bgcolor: 'var(--primary-soft)',
                  borderRadius: '7px',
                  padding: '4px 6px',
                  '&:hover': { bgcolor: 'var(--selected)' }
                }}
              >
                <FolderOpenRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </div>

      {resolution?.notice && (
        <div className="notice-bar">
          <InfoOutlinedIcon sx={{ fontSize: 14, flex: '0 0 auto' }} />
          <span>{resolution.notice}</span>
        </div>
      )}
    </>
  )
}
