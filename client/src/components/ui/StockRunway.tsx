import { Box, Stack, Typography } from '@mui/material'
import { ledgerTokens, numericSx } from '../../theme'
import type { StockStatus } from '../../types/ingredient'
import { formatPercentage, formatQuantity } from './formatters'

interface StockRunwayProps {
  current: number
  stockStatus: StockStatus
  unit: string
  compact?: boolean
}

export const StockRunway = ({
  current,
  stockStatus,
  unit,
  compact = false,
}: StockRunwayProps) => {
  if (stockStatus.code === 'UNCONFIGURED') {
    return (
      <Stack spacing={0.55} sx={{ minWidth: compact ? 150 : 190 }}>
        <Box sx={{ height: 8, bgcolor: ledgerTokens.surfaceSecondary, border: '1px solid', borderColor: 'divider' }} />
        <Typography variant="caption" color="text.secondary">
          Reorder point not set
        </Typography>
      </Stack>
    )
  }

  const percent = Math.max(0, Math.round((stockStatus.stockRatio ?? 0) * 100))
  const progress = Math.min(100, percent)
  const fillColor =
    stockStatus.code === 'OUT_OF_STOCK' || stockStatus.code === 'CRITICAL'
      ? ledgerTokens.danger
      : stockStatus.code === 'LOW'
        ? ledgerTokens.warning
        : ledgerTokens.success
  const shortfallCopy =
    stockStatus.shortfall === null
      ? ''
      : ` · Needs ${formatQuantity(stockStatus.shortfall, unit)} to reorder point`
  const label =
    stockStatus.code === 'OUT_OF_STOCK'
      ? `Out of stock${shortfallCopy}`
      : stockStatus.code === 'CRITICAL'
        ? `Critical${shortfallCopy}`
        : stockStatus.code === 'LOW'
          ? `Low stock${shortfallCopy}`
          : `${formatPercentage(percent)} of reorder point`

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
            stockStatus.code === 'OUT_OF_STOCK' || stockStatus.code === 'CRITICAL'
              ? 'error.main'
              : stockStatus.code === 'LOW'
                ? 'warning.main'
                : 'text.secondary',
        }}
      >
        {label}
      </Typography>
    </Stack>
  )
}
