import { Box, Stack, Typography } from '@mui/material'
import { numericSx } from '../../theme'

export interface AttentionFact {
  label: string
  value: number | string
  tone?: 'neutral' | 'warning' | 'danger'
}

const toneColor = {
  neutral: 'text.primary',
  warning: 'warning.main',
  danger: 'error.main',
} as const

export const AttentionRail = ({ facts }: { facts: AttentionFact[] }) => (
  <Stack
    component="section"
    aria-label="Items requiring attention"
    direction={{ xs: 'column', sm: 'row' }}
    alignItems={{ xs: 'flex-start', sm: 'center' }}
    spacing={{ xs: 0.75, sm: 2 }}
    sx={{
      px: 2,
      py: 1.25,
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: 'divider',
      borderLeft: '3px solid',
      borderLeftColor: 'primary.main',
    }}
  >
    <Typography variant="overline" sx={{ minWidth: 72, color: 'text.secondary' }}>
      Attention
    </Typography>
    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
      {facts.map((fact, index) => (
        <Stack key={fact.label} direction="row" spacing={0.6} alignItems="baseline">
          {index > 0 ? (
            <Box aria-hidden sx={{ color: 'divider', mr: 0.5 }}>
              ·
            </Box>
          ) : null}
          <Typography
            component="span"
            sx={{
              ...numericSx,
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: toneColor[fact.tone ?? 'neutral'],
            }}
          >
            {fact.value}
          </Typography>
          <Typography component="span" variant="body2" color="text.secondary">
            {fact.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  </Stack>
)
