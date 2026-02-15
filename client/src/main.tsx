import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App.tsx'
import './index.css'
import { theme } from './theme'
import { AppSnackbarProvider } from './context/AppSnackbarContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppSnackbarProvider>
        <App />
      </AppSnackbarProvider>
    </ThemeProvider>
  </StrictMode>,
)
