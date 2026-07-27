import { lazy, Suspense } from 'react'
import { Box, CircularProgress, Typography } from '@mui/material'
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
    <Box
      sx={{
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CircularProgress size={30} />
      <Typography variant="body2" color="text.secondary">
        Loading workspace...
      </Typography>
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
