import type { ReactNode } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'

interface LedgerSectionProps {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  padded?: boolean
}

export const LedgerSection = ({
  title,
  subtitle,
  actions,
  children,
  padded = true,
}: LedgerSectionProps) => (
  <Paper
    component="section"
    sx={{
      overflow: 'hidden',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      bgcolor: 'background.paper',
    }}
  >
    {title || subtitle || actions ? (
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{
          minHeight: 64,
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box>
          {title ? <Typography variant="h6">{title}</Typography> : null}
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions}
      </Stack>
    ) : null}
    <Box sx={padded ? { p: { xs: 2, sm: 2.5 } } : undefined}>{children}</Box>
  </Paper>
)
