import { createContext, useContext } from 'react'

type SnackbarSeverity = 'success' | 'info' | 'warning' | 'error'

export interface SnackbarOptions {
  severity?: SnackbarSeverity
  duration?: number
  actionLabel?: string
  onAction?: () => void
}

export interface AppSnackbarContextValue {
  showSnackbar: (message: string, options?: SnackbarOptions) => void
}

export const AppSnackbarContext = createContext<AppSnackbarContextValue | null>(null)

export const useAppSnackbar = () => {
  const context = useContext(AppSnackbarContext)
  if (!context) {
    throw new Error('useAppSnackbar must be used within AppSnackbarProvider')
  }
  return context
}

