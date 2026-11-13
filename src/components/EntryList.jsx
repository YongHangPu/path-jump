import { useEffect, useRef } from 'react'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import AppsRoundedIcon from '@mui/icons-material/AppsRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import DesktopWindowsRoundedIcon from '@mui/icons-material/DesktopWindowsRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import SubdirectoryArrowRightRoundedIcon from '@mui/icons-material/SubdirectoryArrowRightRounded'
import { entryMeta, formatTime } from '../utils'

const QUICK_ICONS = {
  home: HomeRoundedIcon,
  desktop: DesktopWindowsRoundedIcon,
  download: DownloadRoundedIcon,
  document: DescriptionRoundedIcon,
  drive: StorageRoundedIcon,
  apps: AppsRoundedIcon
}

function StartScreen({
  quickLinks,
  platform,
  editingLinks,
  recentPaths,
  onQuickLink,
  onToggleLinkEditing,
  onAddLink,
  onRemoveLink,
  onResetLinks,
  onClearRecent
}) {
  return (
    <div className="start">
      <div className="start-heading-row">
        <div className="start-heading">快速定位文件与文件夹</div>
        <button type="button" className="link-edit" onClick={onToggleLinkEditing}>
          {editingLinks ? '完成' : '编辑入口'}
        </button>
      </div>
      <div className="start-desc">
        输入{platform.isMac ? '绝对路径' : '盘符或完整路径'}即可开始。可以逐级浏览，也可以一次跳转到目标位置。
      </div>

      {(quickLinks.length > 0 || editingLinks) && (
        <div className="quick-grid">
          {quickLinks.map((link) => {
            const Icon = QUICK_ICONS[link.icon] || FolderRoundedIcon
            return (
              <button
                type="button"
                className={editingLinks ? 'quick-tile editing' : 'quick-tile'}
                key={`${link.icon}-${link.path}`}
                onClick={() => {
                  if (!editingLinks) onQuickLink(link.path)
                }}
              >
                <Icon className="quick-icon" sx={{ fontSize: 20 }} />
                <span className="quick-label">{link.label}</span>
                <span className="quick-path" title={link.path}>{link.path}</span>
                {editingLinks && (
                  <span
                    className="quick-remove"
                    role="button"
                    aria-label={`移除 ${link.label}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveLink(link.path)
                    }}
                  >
                    ×
                  </span>
                )}
              </button>
            )
          })}
          {editingLinks && (
            <button type="button" className="quick-add" onClick={onAddLink}>
              <span className="quick-add-plus">+</span>
              <span>添加文件夹</span>
            </button>
          )}
        </div>
      )}

      {editingLinks && (
        <button type="button" className="links-reset" onClick={onResetLinks}>
          恢复默认入口
        </button>
      )}

      {recentPaths.length > 0 && (
        <div className="recent">
          <div className="recent-head">
            <span className="recent-title">最近访问</span>
            <button type="button" className="link-edit" onClick={onClearRecent}>
              清空
            </button>
          </div>
          <div className="recent-list">
            {recentPaths.map((item) => (
              <button
                type="button"
                className="recent-item"
                key={item.path}
                title={item.path}
                onClick={() => onQuickLink(item.path)}
              >
                <FolderOpenRoundedIcon className="recent-icon" sx={{ fontSize: 14 }} />
                <span className="recent-label">{item.label}</span>
                <span className="recent-path">{item.path}</span>
                <span className="recent-time">{formatTime(item.at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="examples">
        <div className="example">
          <span className="example-dot" />
          <span>
            逐级浏览：输入 <code>{platform.browseExample}</code> 开始。按 <kbd>Enter</kbd> 进入选中文件夹，按 <kbd>{platform.modifier}</kbd>+<kbd>Enter</kbd> 在{platform.fileManager}中打开该文件夹，按 <kbd>{platform.modifier}</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> 打开当前所在目录。
          </span>
        </div>
        <div className="example">
          <span className="example-dot" />
          <span>
            文件操作：选中文件后按 <kbd>Enter</kbd> 直接打开，或按 <kbd>{platform.modifier}</kbd>+<kbd>Enter</kbd> 在{platform.fileManager}中显示。
          </span>
        </div>
        <div className="example">
          <span className="example-dot" />
          <span>一次直达：完整输入 <code>{platform.pathExample}</code> 或文件路径。</span>
        </div>
        <div className="example">
          <span className="example-dot" />
          <span>智能定位：带引号、空格或尾部参数的路径，会自动定位到最近的可用目录。</span>
        </div>
        <div className="example">
          <span className="example-dot" />
          <span>
            快速清空：按 <kbd>{platform.alt}</kbd>+<kbd>L</kbd> 清空输入框并返回起始界面。
          </span>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
    </div>
  )
}

function EntryRow({ entry, index, selected, iconUrl, platform, onSelect, onActivate, onOpen, onCopy, onReveal }) {
  return (
    <div
      className={selected ? 'entry-row selected' : 'entry-row'}
      data-entry-index={index}
      onMouseDown={(event) => {
        if (event.button === 0) onSelect(index)
      }}
      onDoubleClick={() => onActivate(entry)}
    >
      <div className="entry-icon">
        {iconUrl ? (
          <img src={iconUrl} alt="" draggable={false} />
        ) : entry.isDirectory ? (
          <FolderRoundedIcon sx={{ fontSize: 22, color: 'var(--folder)' }} />
        ) : (
          <InsertDriveFileRoundedIcon sx={{ fontSize: 22, color: 'var(--fg-tertiary)' }} />
        )}
      </div>

      <div className="entry-name" title={entry.path}>{entry.name}</div>
      <div className="entry-meta">{entryMeta(entry)}</div>

      <div
        className="entry-actions"
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Tooltip title={entry.isDirectory ? '进入文件夹' : '打开文件'}>
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(entry)
            }}
            sx={{ color: 'var(--primary)', padding: '4px' }}
          >
            {entry.isDirectory ? (
              <SubdirectoryArrowRightRoundedIcon sx={{ fontSize: 15 }} />
            ) : (
              <OpenInNewRoundedIcon sx={{ fontSize: 15 }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title={entry.isDirectory ? `在${platform.fileManager}中打开` : `在${platform.fileManager}中显示`}>
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              onReveal(entry)
            }}
            sx={{ color: 'var(--fg-secondary)', padding: '4px' }}
          >
            <FolderOpenRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="复制路径">
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              onCopy(entry.path)
            }}
            sx={{ color: 'var(--fg-secondary)', padding: '4px' }}
          >
            <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </div>

      {entry.isDirectory && (
        <ChevronRightRoundedIcon className="entry-chevron" sx={{ fontSize: 18 }} />
      )}
    </div>
  )
}

export default function EntryList({
  resolution,
  query,
  loading,
  selectedIndex,
  iconMap,
  quickLinks,
  platform,
  editingLinks,
  recentPaths,
  onSelect,
  onActivate,
  onOpen,
  onCopy,
  onReveal,
  onQuickLink,
  onToggleLinkEditing,
  onAddLink,
  onRemoveLink,
  onResetLinks,
  onClearRecent
}) {
  const scrollRef = useRef(null)

  useEffect(() => {
    const selected = scrollRef.current?.querySelector('.entry-row.selected')
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, resolution])

  if (!query) {
    return (
      <div className="list-scroll">
        <StartScreen
          quickLinks={quickLinks}
          platform={platform}
          editingLinks={editingLinks}
          recentPaths={recentPaths}
          onQuickLink={onQuickLink}
          onToggleLinkEditing={onToggleLinkEditing}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
          onResetLinks={onResetLinks}
          onClearRecent={onClearRecent}
        />
      </div>
    )
  }

  if (loading && !resolution) {
    return (
      <div className="list-scroll">
        <EmptyState
          icon={<CircularProgress size={24} sx={{ color: 'var(--primary)' }} />}
          title="正在读取路径"
        />
      </div>
    )
  }

  if (!resolution || resolution.mode === 'invalid') {
    return (
      <div className="list-scroll">
        <EmptyState
          icon={<ErrorOutlineRoundedIcon sx={{ fontSize: 34 }} />}
          title="无法识别这个路径"
          description={resolution?.error || (platform.isMac
            ? '请输入以 / 或 ~/ 开头的完整路径，例如 /Users/你的用户名/Documents。'
            : '请输入 Windows 完整路径，例如 C:\\Users\\Public。')}
        />
      </div>
    )
  }

  if (resolution.mode === 'error') {
    return (
      <div className="list-scroll">
        <EmptyState
          icon={<ErrorOutlineRoundedIcon sx={{ fontSize: 34 }} />}
          title="无法读取这个位置"
          description={resolution.error || '该文件夹可能不存在或没有访问权限。'}
        />
      </div>
    )
  }

  const entries = resolution.entries || []

  if (entries.length === 0) {
    const description = resolution.filter
      ? `当前文件夹中没有匹配“${resolution.filter}”的项目。支持前缀、包含与模糊匹配，也可以继续输入更完整的路径。`
      : '这个文件夹是空的。'
    return (
      <div className="list-scroll">
        <EmptyState
          icon={<SearchOffRoundedIcon sx={{ fontSize: 34 }} />}
          title="没有找到项目"
          description={description}
        />
      </div>
    )
  }

  return (
    <div className="list-scroll" ref={scrollRef}>
      {entries.map((entry, index) => {
        const iconKey = entry.isDirectory ? 'folder' : entry.ext || entry.path
        return (
          <EntryRow
            key={entry.path}
            entry={entry}
            index={index}
            selected={index === selectedIndex}
            iconUrl={iconMap[iconKey]}
            platform={platform}
            onSelect={onSelect}
            onActivate={onActivate}
            onOpen={onOpen}
            onCopy={onCopy}
            onReveal={onReveal}
          />
        )
      })}
    </div>
  )
}
