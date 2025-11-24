import { Box, Typography } from '@mui/material'

interface StatPillProps {
  label: string
  value: string | number
  caption?: string
  color?: 'primary' | 'success' | 'error' | 'info'
}

const colorGradients: Record<NonNullable<StatPillProps['color']>, string> = {
  primary: 'linear-gradient(135deg, #1A73E8, #4285F4)',
  success: 'linear-gradient(135deg, #34A853, #00C853)',
  error: 'linear-gradient(135deg, #EA4335, #FF5252)',
  info: 'linear-gradient(135deg, #00BCD4, #42A5F5)',
}

export const StatPill = ({ label, value, caption, color = 'primary' }: StatPillProps) => {
  return (
    <Box
      sx={{
        borderRadius: 999,
        p: 2,
        px: 2.5,
        background: colorGradients[color],
        color: 'common.white',
        minWidth: 160,
        boxShadow: '0 16px 40px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        transition: 'transform 0.15s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 22px 55px rgba(15,23,42,0.45), 0 0 0 1px rgba(15,23,42,0.12)',
        },
      }}
    >
      <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ lineHeight: 1.1 }}>
        {value}
      </Typography>
      {caption && (
        <Typography variant="caption" sx={{ opacity: 0.9 }}>
          {caption}
        </Typography>
      )}
    </Box>
  )
}
