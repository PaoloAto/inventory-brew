import { Box, Stack, Typography } from '@mui/material'
import { ledgerTokens, numericSx } from '../../theme'
import { formatPercentage, formatQuantity } from './formatters'

interface StockRunwayProps {
  current: number
  reorderLevel?: number
  unit: string
  compact?: boolean
}

export const StockRunway = ({
  current,
  reorderLevel = 0,
  unit,
  compact = false,
}: StockRunwayProps) => {
  if (reorderLevel <= 0) {
    return (
      <Stack spacing={0.55} sx={{ minWidth: compact ? 150 : 190 }}>
        <Box sx={{ height: 8, bgcolor: ledgerTokens.surfaceSecondary, border: '1px solid', borderColor: 'divider' }} />
        <Typography variant="caption" color="text.secondary">
          Reorder level not set
        </Typography>
      </Stack>
    )
  }

  const ratio = current / reorderLevel
  const percent = Math.max(0, Math.round(ratio * 100))
  const progress = Math.min(100, percent)
  const shortfall = Math.max(0, reorderLevel - current)
  const tone = ratio <= 0.25 ? 'critical' : ratio < 1 ? 'low' : 'normal'
  const fillColor =
    tone === 'critical'
      ? ledgerTokens.danger
      : tone === 'low'
        ? ledgerTokens.warning
        : ledgerTokens.success
  const label =
    tone === 'normal'
      ? `${formatPercentage(percent)} of target`
      : `${tone === 'critical' ? 'Critical · ' : ''}Needs ${formatQuantity(shortfall, unit)}`

  return (
    <Stack spacing={0.55} sx={{ minWidth: compact ? 150 : 190 }}>
      <Box
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={`${formatQuantity(current, unit)} in stock. ${label}`}
        sx={{
          height: compact ? 8 : 9,
          bgcolor: ledgerTokens.surfaceSecondary,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${progress}%`,
            height: '100%',
            bgcolor: fillColor,
            transition: 'width 160ms ease',
          }}
        />
      </Box>
      <Typography
        variant="caption"
        sx={{
          ...numericSx,
          color:
            tone === 'critical'
              ? 'error.main'
              : tone === 'low'
                ? 'warning.main'
                : 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Stack>
  )
}
