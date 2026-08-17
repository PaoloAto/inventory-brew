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

const ProductionPage = lazy(() =>
  import('../pages/Production/ProductionPage').then((module) => ({
    default: module.ProductionPage,
  })),
)

const SalesPage = lazy(() =>
  import('../pages/Sales/SalesPage').then((module) => ({
    default: module.SalesPage,
  })),
)

const WastePage = lazy(() =>
  import('../pages/Waste/WastePage').then((module) => ({
    default: module.WastePage,
  })),
)

const PlanningPage = lazy(() =>
  import('../pages/Planning/PlanningPage').then((module) => ({
    default: module.PlanningPage,
  })),
)

const PrepPlanPage = lazy(() =>
  import('../pages/PrepPlan/PrepPlanPage').then((module) => ({
    default: module.PrepPlanPage,
  })),
)

const PurchasingPage = lazy(() =>
  import('../pages/Purchasing/PurchasingPage').then((module) => ({
    default: module.PurchasingPage,
  })),
)

const StocktakesPage = lazy(() =>
  import('../pages/Stocktakes/StocktakesPage').then((module) => ({ default: module.StocktakesPage })),
)

const StocktakeDetailPage = lazy(() =>
  import('../pages/Stocktakes/StocktakeDetailPage').then((module) => ({ default: module.StocktakeDetailPage })),
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
            <Route path="/production" element={<ProductionPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/waste" element={<WastePage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/prep-plan" element={<PrepPlanPage />} />
            <Route path="/purchasing" element={<PurchasingPage />} />
            <Route path="/stock-counts" element={<StocktakesPage />} />
            <Route path="/stock-counts/:id" element={<StocktakeDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </BrowserRouter>
  )
}
