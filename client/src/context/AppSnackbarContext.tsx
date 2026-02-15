import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Alert, Button, Snackbar } from '@mui/material'

type SnackbarSeverity = 'success' | 'info' | 'warning' | 'error'

interface SnackbarOptions {
  severity?: SnackbarSeverity
  duration?: number
  actionLabel?: string
  onAction?: () => void
}

interface SnackbarItem extends SnackbarOptions {
  id: number
  message: string
}

interface AppSnackbarContextValue {
  showSnackbar: (message: string, options?: SnackbarOptions) => void
}

const AppSnackbarContext = createContext<AppSnackbarContextValue | null>(null)

export const AppSnackbarProvider = ({ children }: { children: ReactNode }) => {
  const [queue, setQueue] = useState<SnackbarItem[]>([])

  const current = queue[0] ?? null

  const showSnackbar = useCallback((message: string, options: SnackbarOptions = {}) => {
    setQueue((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        message,
        severity: options.severity ?? 'info',
        duration: options.duration ?? 2500,
        actionLabel: options.actionLabel,
        onAction: options.onAction,
      },
    ])
  }, [])

  const handleClose = () => {
    setQueue((prev) => prev.slice(1))
  }

  const value = useMemo<AppSnackbarContextValue>(() => ({ showSnackbar }), [showSnackbar])

  return (
    <AppSnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id}
        open={Boolean(current)}
        autoHideDuration={current?.duration ?? 2500}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={current?.severity ?? 'info'}
          onClose={handleClose}
          action={
            current?.actionLabel && current.onAction ? (
              <Button
                size="small"
                color="inherit"
                onClick={() => {
                  current.onAction?.()
                  handleClose()
                }}
              >
                {current.actionLabel}
              </Button>
            ) : undefined
          }
          sx={{ width: '100%' }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </AppSnackbarContext.Provider>
  )
}

export const useAppSnackbar = () => {
  const context = useContext(AppSnackbarContext)
  if (!context) {
    throw new Error('useAppSnackbar must be used within AppSnackbarProvider')
  }
  return context
}
