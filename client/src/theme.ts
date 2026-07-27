import { alpha, createTheme } from '@mui/material/styles'

const fontFamily = '"Manrope", "Avenir Next", "Segoe UI", sans-serif'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2D7FF9',
      light: '#6EA8FF',
      dark: '#1F5FC9',
    },
    secondary: {
      main: '#00A7A0',
    },
    success: {
      main: '#22A06B',
    },
    warning: {
      main: '#F79009',
    },
    error: {
      main: '#F04438',
    },
    text: {
      primary: '#0F1E38',
      secondary: '#5D6B83',
    },
    background: {
      default: '#F1F4FB',
      paper: '#FFFFFF',
    },
    divider: '#E2E8F3',
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily,
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 750, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 700, letterSpacing: '0.03em' },
    button: {
      textTransform: 'none',
      fontWeight: 700,
      letterSpacing: '0.01em',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            'radial-gradient(900px 500px at 20% -10%, rgba(44,127,249,0.12), transparent 65%), radial-gradient(900px 500px at 95% 5%, rgba(0,167,160,0.10), transparent 60%), #F1F4FB',
          color: '#0F1E38',
        },
        '::-webkit-scrollbar': {
          width: '10px',
          height: '10px',
        },
        '::-webkit-scrollbar-thumb': {
          backgroundColor: '#C5D0E3',
          borderRadius: '10px',
        },
        '::-webkit-scrollbar-thumb:hover': {
          backgroundColor: '#B0BCD2',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid #E7ECF5',
          transition: 'box-shadow 180ms ease, border-color 180ms ease',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          border: '1px solid #E7ECF5',
          boxShadow: '0 14px 34px rgba(10, 34, 81, 0.10)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          paddingInline: '18px',
          minHeight: 40,
          transition: 'transform 140ms ease, box-shadow 180ms ease, filter 180ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          boxShadow: '0 10px 24px rgba(45, 127, 249, 0.22)',
          '&:hover': {
            boxShadow: '0 14px 28px rgba(45, 127, 249, 0.28)',
            filter: 'saturate(1.05)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(90deg, #2D7FF9, #55A5FF)',
        },
        outlined: {
          borderColor: '#C9D4E8',
          '&:hover': {
            borderColor: '#9FB4D8',
            backgroundColor: alpha('#2D7FF9', 0.04),
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: alpha('#FFFFFF', 0.94),
          '& fieldset': {
            borderColor: '#D9E3F2',
          },
          '&:hover fieldset': {
            borderColor: '#B7CAE7',
          },
          '&.Mui-focused fieldset': {
            borderColor: '#2D7FF9',
            boxShadow: `0 0 0 3px ${alpha('#2D7FF9', 0.12)}`,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'background-color 140ms ease, transform 140ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 700,
          transition: 'transform 140ms ease, box-shadow 180ms ease, background-color 180ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          marginInline: 6,
          marginBlock: 2,
          transition: 'background-color 140ms ease, transform 140ms ease',
          '&:hover': {
            transform: 'translateX(1px)',
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          transition: 'background-color 150ms ease, color 150ms ease, transform 130ms ease',
          '&:active': {
            transform: 'scale(0.99)',
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            backgroundColor: '#F7FAFF',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: '0.74rem',
            fontWeight: 800,
            color: '#60708A',
            borderBottom: '1px solid #DFE7F4',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#EDF2FA',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 160ms ease, box-shadow 180ms ease',
          '&:hover': {
            backgroundColor: '#F8FBFF',
          },
        },
      },
    },
  },
})
