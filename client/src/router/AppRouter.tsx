import { lazy, Suspense } from 'react'
import { Box, Skeleton, Stack } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'

const DashboardPage = lazy(() =>
  import('../pages/Dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)

const IngredientsPage = lazy(() =>
  import('../pages/Ingredients/IngredientsPage').then((module) => ({
    default: module.IngredientsPage,
  })),
)

const RecipesPage = lazy(() =>
  import('../pages/Recipes/RecipesPage').then((module) => ({
    default: module.RecipesPage,
  })),
)

const TransactionsPage = lazy(() =>
  import('../pages/Transactions/TransactionsPage').then((module) => ({
    default: module.TransactionsPage,
  })),
)

const RouteLoader = () => {
  return (
    <Box aria-label="Loading page" sx={{ pt: 0.5 }}>
      <Skeleton variant="text" width={220} height={38} />
      <Skeleton variant="text" width="min(440px, 80%)" height={24} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0} sx={{ mt: 3 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            height={92}
            sx={{ flex: 1, border: '1px solid', borderColor: 'divider' }}
          />
        ))}
      </Stack>
      <Skeleton variant="rectangular" height={260} sx={{ mt: 3 }} />
    </Box>
  )
}

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <AppLayout>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </BrowserRouter>
  )
}
