import type { ReactNode } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'

interface PageHeaderProps {
  title: string
  subtitle?: string
  badgeLabel?: string
  actions?: ReactNode
}

export const PageHeader = ({ title, subtitle, badgeLabel, actions }: PageHeaderProps) => {
  return (
    <Box sx={{ mb: 2.6 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.25}
      >
        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h4" sx={{ fontSize: { xs: '1.7rem', md: '1.95rem' } }}>
              {title}
            </Typography>
            {badgeLabel && (
              <Chip
                size="small"
                label={badgeLabel}
                variant="outlined"
                sx={{ bgcolor: 'rgba(255,255,255,0.72)', borderColor: 'divider' }}
              />
            )}
          </Stack>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Stack>

        {actions ? <Box>{actions}</Box> : null}
      </Stack>
    </Box>
  )
}

