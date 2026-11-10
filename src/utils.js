const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

export function formatSize(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
}

export function formatTime(value) {
  const timestamp = Number(value) || 0
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${timeFormatter.format(date)}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${timeFormatter.format(date)}`
  }
  return dateFormatter.format(date)
}

export function entryMeta(entry) {
  // The folder icon and the trailing chevron already say "this is a directory",
  // so the row keeps the modification time instead of the redundant label.
  const time = formatTime(entry.mtime)
  if (entry.isDirectory) return time
  const parts = [formatSize(entry.size)]
  if (time) parts.push(time)
  return parts.join(' · ')
}
