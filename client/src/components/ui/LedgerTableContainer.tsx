import type { ReactNode } from 'react'
import { Box } from '@mui/material'

export const LedgerTableContainer = ({
  children,
  maxHeight,
}: {
  children: ReactNode
  maxHeight?: number
}) => (
  <Box
    sx={{
      overflow: 'auto',
      maxHeight,
      bgcolor: 'background.paper',
      borderInline: '1px solid',
      borderColor: 'divider',
    }}
  >
    {children}
  </Box>
)
