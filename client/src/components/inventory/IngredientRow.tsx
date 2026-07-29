import EditIcon from '@mui/icons-material/Edit'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import { Checkbox, Stack, TableCell, TableRow, Typography } from '@mui/material'
import { RowActionMenu } from '../ui/RowActionMenu'
import { StatusLabel } from '../ui/StatusLabel'
import { StockRunway } from '../ui/StockRunway'
import { formatCurrency, formatQuantity } from '../ui/formatters'
import { numericSx } from '../../theme'
import type { Ingredient } from '../../types/ingredient'
import type { IngredientColumnKey } from './IngredientTable'

interface IngredientRowProps {
  ingredient: Ingredient
  visibleColumns: IngredientColumnKey[]
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
  onEdit: (ingredient: Ingredient) => void
  onAdjustStock: (ingredient: Ingredient) => void
}

export const IngredientRow = ({
  ingredient,
  visibleColumns,
  selected,
  onSelect,
  onEdit,
  onAdjustStock,
}: IngredientRowProps) => {
  const totalValue = ingredient.stockQuantity * ingredient.costPerUnit
  const isVisible = (column: IngredientColumnKey) => visibleColumns.includes(column)
  const statusPresentation = {
    OUT_OF_STOCK: { label: 'Out of stock', tone: 'danger' as const },
    UNCONFIGURED: { label: 'Set reorder point', tone: 'neutral' as const },
    CRITICAL: { label: 'Critical', tone: 'danger' as const },
    LOW: { label: 'Low stock', tone: 'warning' as const },
    SUFFICIENT: { label: 'Sufficient', tone: 'success' as const },
  }[ingredient.stockStatus.code]

  return (
    <TableRow hover>
      <TableCell padding="checkbox">
        <Checkbox
          color="primary"
          checked={selected}
          onChange={(e) => onSelect(ingredient.id, e.target.checked)}
          inputProps={{ 'aria-label': `select ${ingredient.name}` }}
        />
      </TableCell>

      {isVisible('name') && (
        <TableCell sx={{ fontWeight: 500 }}>{ingredient.name}</TableCell>
      )}
      {isVisible('manufacturer') && <TableCell>{ingredient.manufacturer ?? '—'}</TableCell>}
      {isVisible('costPerUnit') && (
        <TableCell align="right" sx={numericSx}>
          {formatCurrency(ingredient.costPerUnit)}
        </TableCell>
      )}
      {isVisible('stockQuantity') && (
        <TableCell align="right" sx={{ minWidth: 190 }}>
          <Stack spacing={0.65} alignItems="flex-end">
            <Typography component="span" sx={{ ...numericSx, fontSize: '0.8125rem', fontWeight: 500 }}>
              {formatQuantity(ingredient.stockQuantity, ingredient.unit)}
            </Typography>
            <StockRunway
              current={ingredient.stockQuantity}
              stockStatus={ingredient.stockStatus}
              unit={ingredient.unit}
              compact
            />
          </Stack>
        </TableCell>
      )}
      {isVisible('totalValue') && (
        <TableCell align="right" sx={numericSx}>
          {formatCurrency(totalValue)}
        </TableCell>
      )}
      {isVisible('status') && (
        <TableCell>
          <StatusLabel
            label={statusPresentation.label}
            tone={statusPresentation.tone}
          />
        </TableCell>
      )}
      {isVisible('actions') && (
        <TableCell align="center">
          <RowActionMenu
            tooltip={`Actions for ${ingredient.name}`}
            actions={[
              {
                key: 'adjust',
                label: 'Adjust stock',
                icon: <TuneRoundedIcon fontSize="small" />,
                onClick: () => onAdjustStock(ingredient),
              },
              {
                key: 'edit',
                label: 'Edit ingredient',
                icon: <EditIcon fontSize="small" />,
                onClick: () => onEdit(ingredient),
              },
            ]}
          />
        </TableCell>
      )}
    </TableRow>
  )
}
