import Button from '@mui/material/Button'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import SubdirectoryArrowRightRoundedIcon from '@mui/icons-material/SubdirectoryArrowRightRounded'

export default function SelectionBar({ entry, busy, platform, onOpen, onReveal }) {
  if (!entry) return null

  const isDirectory = entry.isDirectory

  return (
    <div className="selection-bar">
      <div className="selection-copy">
        <span className="selection-name" title={entry.path}>{entry.name}</span>
        <span className="selection-kind">{isDirectory ? '文件夹' : '文件'}</span>
      </div>

      <div className="selection-actions">
        <Button
          size="small"
          variant="contained"
          disableElevation
          disabled={busy}
          startIcon={isDirectory ? <SubdirectoryArrowRightRoundedIcon /> : <OpenInNewRoundedIcon />}
          onClick={() => onOpen(entry)}
          className="selection-button"
        >
          {isDirectory ? '进入文件夹' : '打开文件'}
          <span className="action-hint">Enter</span>
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          startIcon={<FolderOpenRoundedIcon />}
          onClick={() => onReveal(entry)}
          className="selection-button"
        >
          {isDirectory ? `在${platform.fileManager}中打开` : `在${platform.fileManager}中显示`}
          <span className="action-hint">{platform.modifier}+Enter</span>
        </Button>
      </div>
    </div>
  )
}
