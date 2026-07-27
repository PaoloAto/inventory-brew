import { Box } from '@mui/material'
import { ledgerTokens } from '../../theme'

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger'

const styles: Record<StatusTone, { color: string; background: string; border: string }> = {
  neutral: {
    color: ledgerTokens.textSecondary,
    background: ledgerTokens.surfaceSecondary,
    border: ledgerTokens.border,
  },
  success: {
    color: ledgerTokens.success,
    background: ledgerTokens.successBackground,
    border: ledgerTokens.successBorder,
  },
  warning: {
    color: ledgerTokens.warning,
    background: ledgerTokens.warningBackground,
    border: ledgerTokens.warningBorder,
  },
  danger: {
    color: ledgerTokens.danger,
    background: ledgerTokens.dangerBackground,
    border: ledgerTokens.dangerBorder,
  },
}

export const StatusLabel = ({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: StatusTone
}) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 23,
      px: 0.8,
      border: '1px solid',
      borderColor: styles[tone].border,
      borderRadius: '3px',
      bgcolor: styles[tone].background,
      color: styles[tone].color,
      fontSize: '0.72rem',
      lineHeight: 1,
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </Box>
)
