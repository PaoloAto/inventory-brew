import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1A73E8',
    },
    secondary: {
      main: '#43A047',
    },
    background: {
      default: '#f5f7fb',
      paper: '#ffffff',
    },
    divider: '#e6e9f2',
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'radial-gradient(circle at 10% 20%, #f0f4ff 0, transparent 30%), radial-gradient(circle at 90% 10%, #f2fbff 0, transparent 25%), #f5f7fb',
          color: '#1f2933',
        },
        '::-webkit-scrollbar': {
          width: '10px',
          height: '10px',
        },
        '::-webkit-scrollbar-thumb': {
          backgroundColor: '#cbd5e1',
          borderRadius: '10px',
        },
        '::-webkit-scrollbar-thumb:hover': {
          backgroundColor: '#b3bed1',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 12px 30px rgba(9, 32, 76, 0.12)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: '0 8px 18px rgba(26, 115, 232, 0.25)',
          paddingInline: '18px',
        },
        containedPrimary: {
          background: 'linear-gradient(90deg, #1A73E8 0%, #3BB5FF 100%)',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#f5f7fb',
          '& .MuiTableCell-root': {
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#6b7280',
            borderBottom: '1px solid #e6e9f2',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 150ms ease, transform 150ms ease',
          '&:hover': {
            backgroundColor: '#f8fbff',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
        },
      },
    },
  },
})
