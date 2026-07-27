import type { ReactNode } from 'react'
import { Stack } from '@mui/material'

export const DataToolbar = ({
  primary,
  secondary,
}: {
  primary: ReactNode
  secondary?: ReactNode
}) => (
  <Stack
    component="section"
    aria-label="Table controls"
    direction={{ xs: 'column', lg: 'row' }}
    alignItems={{ xs: 'stretch', lg: 'center' }}
    justifyContent="space-between"
    spacing={1.5}
    sx={{
      px: { xs: 1.5, sm: 2 },
      py: 1.5,
      bgcolor: 'background.paper',
      border: '1px solid',
      borderColor: 'divider',
      borderBottom: 0,
    }}
  >
    {primary}
    {secondary}
  </Stack>
)
