import type { ReactNode } from 'react'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import { Box, Stack, Typography } from '@mui/material'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  minHeight?: number
}

export const EmptyState = ({
  title,
  description,
  icon = <Inventory2OutlinedIcon fontSize="small" />,
  action,
  minHeight = 180,
}: EmptyStateProps) => {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.2}
      sx={{
        minHeight,
        px: 2,
        py: 2.5,
        textAlign: 'center',
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(45,127,249,0.12)',
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      ) : null}
      {action}
    </Stack>
  )
}

