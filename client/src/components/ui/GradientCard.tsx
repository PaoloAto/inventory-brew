import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'

type Accent = 'primary' | 'success' | 'error' | 'info'

const accentGradients: Record<Accent, string> = {
  primary: 'linear-gradient(135deg, #1A73E8, #4285F4)',
  success: 'linear-gradient(135deg, #34A853, #00C853)',
  error: 'linear-gradient(135deg, #EA4335, #FF5252)',
  info: 'linear-gradient(135deg, #00BCD4, #42A5F5)',
}

interface GradientCardProps {
  title: string
  subtitle?: string
  accent?: Accent
  rightContent?: ReactNode
  children: ReactNode
}

export const GradientCard = ({ title, subtitle, accent = 'primary', rightContent, children }: GradientCardProps) => {
  return (
    <Paper
      elevation={4}
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 18px 45px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.02)',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          background: accentGradients[accent],
          color: 'common.white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {rightContent && <Box>{rightContent}</Box>}
        </Box>
      </Box>

      <Box sx={{ p: 3 }}>{children}</Box>
    </Paper>
  )
}
