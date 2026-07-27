import { createTheme } from '@mui/material/styles'

export const ledgerTokens = {
  canvas: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F1ED',
  ink: '#171817',
  textSecondary: '#676962',
  textSubtle: '#858780',
  border: '#D9DAD4',
  borderStrong: '#BFC1BA',
  hover: '#EEEEEA',
  action: '#26332D',
  actionHover: '#19241F',
  success: '#2F6B4F',
  successBackground: '#E8F1EC',
  successBorder: '#BED4C7',
  warning: '#94631D',
  warningBackground: '#F6EEDC',
  warningBorder: '#E1C994',
  danger: '#A1433C',
  dangerBackground: '#F7E8E6',
  dangerBorder: '#E1BBB7',
} as const

export const numericFontFamily = '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace'

export const numericSx = {
  fontFamily: numericFontFamily,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.015em',
} as const

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: ledgerTokens.action,
      dark: ledgerTokens.actionHover,
      contrastText: '#FFFFFF',
    },
    success: {
      main: ledgerTokens.success,
      light: ledgerTokens.successBackground,
    },
    warning: {
      main: ledgerTokens.warning,
      light: ledgerTokens.warningBackground,
    },
    error: {
      main: ledgerTokens.danger,
      light: ledgerTokens.dangerBackground,
    },
    text: {
      primary: ledgerTokens.ink,
      secondary: ledgerTokens.textSecondary,
      disabled: ledgerTokens.textSubtle,
    },
    background: {
      default: ledgerTokens.canvas,
      paper: ledgerTokens.surface,
    },
    divider: ledgerTokens.border,
  },
  shape: {
    borderRadius: 5,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    fontSize: 14,
    h4: {
      fontSize: '1.625rem',
      lineHeight: 1.2,
      fontWeight: 500,
      letterSpacing: '-0.025em',
    },
    h5: {
      fontSize: '1.25rem',
      lineHeight: 1.3,
      fontWeight: 500,
      letterSpacing: '-0.015em',
    },
    h6: {
      fontSize: '1rem',
      lineHeight: 1.35,
      fontWeight: 500,
    },
    subtitle1: {
      fontSize: '0.9375rem',
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.8125rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '0.875rem',
      lineHeight: 1.55,
    },
    body2: {
      fontSize: '0.8125rem',
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.45,
    },
    overline: {
      fontSize: '0.6875rem',
      lineHeight: 1.4,
      fontWeight: 500,
      letterSpacing: '0.055em',
      textTransform: 'none',
    },
    button: {
      fontSize: '0.8125rem',
      lineHeight: 1.2,
      textTransform: 'none',
      fontWeight: 500,
      letterSpacing: 0,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'light',
        },
        body: {
          margin: 0,
          backgroundColor: ledgerTokens.canvas,
          color: ledgerTokens.ink,
        },
        '*': {
          boxSizing: 'border-box',
        },
        '*::selection': {
          backgroundColor: ledgerTokens.warningBackground,
          color: ledgerTokens.ink,
        },
        '::-webkit-scrollbar': {
          width: 10,
          height: 10,
        },
        '::-webkit-scrollbar-thumb': {
          backgroundColor: ledgerTokens.borderStrong,
          border: `3px solid ${ledgerTokens.canvas}`,
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': {
            outline: `2px solid ${ledgerTokens.action}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          minHeight: 36,
          borderRadius: 5,
          paddingInline: 14,
          transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
        },
        containedPrimary: {
          backgroundColor: ledgerTokens.action,
          '&:hover': {
            backgroundColor: ledgerTokens.actionHover,
          },
        },
        outlined: {
          borderColor: ledgerTokens.borderStrong,
          color: ledgerTokens.ink,
          '&:hover': {
            borderColor: ledgerTokens.action,
            backgroundColor: ledgerTokens.hover,
          },
        },
        text: {
          color: ledgerTokens.ink,
          '&:hover': {
            backgroundColor: ledgerTokens.hover,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          transition: 'background-color 150ms ease, color 150ms ease',
          '&:hover': {
            backgroundColor: ledgerTokens.hover,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 5,
          backgroundColor: ledgerTokens.surface,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: ledgerTokens.borderStrong,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: ledgerTokens.textSecondary,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderWidth: 1,
            borderColor: ledgerTokens.action,
          },
        },
        input: {
          paddingTop: 10,
          paddingBottom: 10,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${ledgerTokens.borderStrong}`,
          borderRadius: 6,
          boxShadow: '0 18px 48px rgba(23, 24, 23, 0.16)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '20px 24px 16px',
          fontSize: '1.0625rem',
          fontWeight: 500,
          borderBottom: `1px solid ${ledgerTokens.border}`,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: 24,
          '&.MuiDialogContent-dividers': {
            borderTop: 0,
            borderBottomColor: ledgerTokens.border,
          },
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 24px',
          borderTop: `1px solid ${ledgerTokens.border}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 26,
          borderRadius: 4,
          fontSize: '0.75rem',
          fontWeight: 500,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${ledgerTokens.border}`,
          borderRadius: 5,
          boxShadow: '0 8px 24px rgba(23, 24, 23, 0.12)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 36,
          fontSize: '0.8125rem',
          borderRadius: 0,
          '&:hover': {
            backgroundColor: ledgerTokens.hover,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            backgroundColor: ledgerTokens.surfaceSecondary,
            color: ledgerTokens.textSecondary,
            fontSize: '0.71875rem',
            lineHeight: 1.25,
            fontWeight: 500,
            letterSpacing: '0.045em',
            textTransform: 'none',
            borderBottom: `1px solid ${ledgerTokens.borderStrong}`,
            whiteSpace: 'nowrap',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '11px 14px',
          fontSize: '0.8125rem',
          borderBottom: `1px solid ${ledgerTokens.border}`,
        },
        sizeSmall: {
          padding: '8px 12px',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 140ms ease',
          '&.MuiTableRow-hover:hover': {
            backgroundColor: ledgerTokens.hover,
          },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        toolbar: {
          minHeight: 48,
          fontSize: '0.75rem',
        },
        selectLabel: {
          fontSize: '0.75rem',
        },
        displayedRows: {
          fontFamily: numericFontFamily,
          fontSize: '0.75rem',
          fontVariantNumeric: 'tabular-nums',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          border: `1px solid ${ledgerTokens.borderStrong}`,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
        },
      },
    },
  },
})
