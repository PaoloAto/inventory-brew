import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1A73E8',
    },
    background: {
      default: '#f8f9fb',
      paper: '#ffffff',
    },
  },
  shape: {
    borderRadius: 12,
  },
})
