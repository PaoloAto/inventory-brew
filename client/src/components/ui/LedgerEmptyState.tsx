import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'

export const LedgerEmptyState = ({
  title,
  description,
  action,
  minHeight = 160,
}: {
  title: string
  description?: string
  action?: ReactNode
  minHeight?: number
}) => (
  <Box
    sx={{
      minHeight,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      px: { xs: 2, sm: 3 },
      py: 3,
    }}
  >
    <Typography variant="subtitle1">{title}</Typography>
    {description ? (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 480 }}>
        {description}
      </Typography>
    ) : null}
    {action ? <Box sx={{ mt: 1.5 }}>{action}</Box> : null}
  </Box>
)
