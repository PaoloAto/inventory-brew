import { useMemo, useState } from 'react'
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded'
import {
  Button,
  Checkbox,
  Divider,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'

export type TableDensity = 'compact' | 'comfortable'

export interface TableColumnOption<T extends string> {
  key: T
  label: string
  locked?: boolean
}

interface TableViewControlsProps<T extends string> {
  columnOptions: Array<TableColumnOption<T>>
  visibleColumns: T[]
  density: TableDensity
  onToggleColumn: (column: T) => void
  onDensityChange: (density: TableDensity) => void
  onResetColumns?: () => void
}

export const TableViewControls = <T extends string>({
  columnOptions,
  visibleColumns,
  density,
  onToggleColumn,
  onDensityChange,
  onResetColumns,
}: TableViewControlsProps<T>) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const visibleCount = visibleColumns.length
  const totalCount = columnOptions.length

  const atLeastOneUnlockedVisible = useMemo(() => {
    const unlockedVisible = columnOptions.filter((option) => !option.locked && visibleColumns.includes(option.key))
    return unlockedVisible.length > 1
  }, [columnOptions, visibleColumns])

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        color="primary"
        value={density}
        onChange={(_event, nextDensity: TableDensity | null) => {
          if (nextDensity) onDensityChange(nextDensity)
        }}
      >
        <ToggleButton value="comfortable">Comfortable</ToggleButton>
        <ToggleButton value="compact">Compact</ToggleButton>
      </ToggleButtonGroup>

      <Button
        variant="outlined"
        size="small"
        startIcon={<ViewColumnRoundedIcon fontSize="small" />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        Columns ({visibleCount}/{totalCount})
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 240, borderRadius: 2 } } }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.8, py: 1.2, display: 'block' }}>
          Toggle visible columns
        </Typography>
        <Divider />
        {columnOptions.map((option) => {
          const checked = visibleColumns.includes(option.key)
          const disableToggle = option.locked || (checked && !atLeastOneUnlockedVisible)

          return (
            <MenuItem key={option.key} onClick={() => !disableToggle && onToggleColumn(option.key)} dense>
              <Checkbox checked={checked} disabled={disableToggle} size="small" />
              <ListItemText
                primary={option.label}
                secondary={option.locked ? 'Always visible' : undefined}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
          )
        })}
        {onResetColumns && (
          <>
            <Divider />
            <MenuItem
              onClick={() => {
                onResetColumns()
                setAnchorEl(null)
              }}
            >
              <ListItemText primary="Reset columns" primaryTypographyProps={{ variant: 'body2', color: 'primary.main' }} />
            </MenuItem>
          </>
        )}
      </Menu>
    </Stack>
  )
}
