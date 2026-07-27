import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'

interface LedgerPageHeaderProps {
  title: string
  subtitle?: string
  meta?: ReactNode
  actions?: ReactNode
}

export const LedgerPageHeader = ({
  title,
  subtitle,
  meta,
  actions,
}: LedgerPageHeaderProps) => (
  <Box
    component="header"
    sx={{
      pb: 2.25,
      mb: 3,
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
  >
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      alignItems={{ xs: 'stretch', sm: 'flex-start' }}
      justifyContent="space-between"
      spacing={2}
    >
      <Box>
        <Typography variant="h4">{title}</Typography>
        {subtitle ? (
          <Typography color="text.secondary" sx={{ mt: 0.6, maxWidth: 680 }}>
            {subtitle}
          </Typography>
        ) : null}
        {meta ? (
          <Box sx={{ mt: 1, color: 'text.secondary', typography: 'caption' }}>{meta}</Box>
        ) : null}
      </Box>
      {actions ? <Box sx={{ flexShrink: 0 }}>{actions}</Box> : null}
    </Stack>
  </Box>
)
