import { Box, Skeleton, Stack } from '@mui/material'

interface TableSkeletonProps {
  rows?: number
}

export const TableSkeleton = ({ rows = 6 }: TableSkeletonProps) => {
  return (
    <Box sx={{ px: 2.2, py: 1.8 }}>
      <Stack spacing={1.15}>
        <Skeleton variant="rounded" height={34} />
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} variant="rounded" height={28} />
        ))}
      </Stack>
    </Box>
  )
}

