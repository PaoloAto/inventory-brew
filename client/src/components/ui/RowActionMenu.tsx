import type { ReactNode } from 'react'
import { useState } from 'react'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material'

interface RowActionItem {
  key: string
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
}

interface RowActionMenuProps {
  actions: RowActionItem[]
  tooltip?: string
}

export const RowActionMenu = ({
  actions,
  tooltip = 'More actions',
}: RowActionMenuProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  return (
    <>
      <Tooltip title={tooltip}>
        <IconButton
          size="small"
          onClick={handleOpen}
          aria-label={tooltip}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(255,255,255,0.9)',
            transition: 'all 150ms ease',
            '&:hover': {
              borderColor: 'primary.light',
              bgcolor: 'rgba(45,127,249,0.1)',
            },
          }}
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              mt: 0.6,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.key}
            disabled={action.disabled}
            onClick={() => {
              action.onClick()
              handleClose()
            }}
          >
            {action.icon ? <ListItemIcon>{action.icon}</ListItemIcon> : null}
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
