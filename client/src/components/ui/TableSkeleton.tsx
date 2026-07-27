import { Box, Skeleton, Stack } from '@mui/material'

interface TableSkeletonProps {
  rows?: number
}

export const TableSkeleton = ({ rows = 6 }: TableSkeletonProps) => {
  return (
    <Box aria-label="Loading table" sx={{ py: 0 }}>
      <Stack spacing={0}>
        <Skeleton variant="rectangular" height={38} />
        {Array.from({ length: rows }).map((_, index) => (
          <Box
            key={index}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1.4fr repeat(4, 1fr)',
              gap: 2,
              alignItems: 'center',
              height: 44,
              px: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {Array.from({ length: 5 }).map((__, cellIndex) => (
              <Skeleton key={cellIndex} variant="text" width={cellIndex === 0 ? '75%' : '55%'} />
            ))}
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
