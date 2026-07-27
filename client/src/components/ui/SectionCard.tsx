import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'

interface SectionCardProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  padded?: boolean
}

export const SectionCard = ({
  title,
  subtitle,
  actions,
  children,
  padded = true,
}: SectionCardProps) => {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.95))',
        transition: 'box-shadow 180ms ease, border-color 180ms ease',
        '&:hover': {
          borderColor: 'rgba(45,127,249,0.26)',
          boxShadow: '0 18px 34px rgba(15, 36, 80, 0.08)',
        },
      }}
    >
      {(title || actions) && (
        <Box
          sx={{
            px: 2.5,
            py: 1.8,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.4,
          }}
        >
          <Box>
            {title ? (
              <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 750 }}>
                {title}
              </Typography>
            ) : null}
            {subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {actions}
        </Box>
      )}

      <Box sx={padded ? { p: 2.4 } : undefined}>{children}</Box>
    </Paper>
  )
}
