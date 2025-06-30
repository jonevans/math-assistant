import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0d4b8c',
      light: '#3271ad',
      dark: '#093464',
    },
    secondary: {
      main: '#ff6b1a',
      light: '#ff8c47',
      dark: '#e55800',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    info: {
      main: '#2196F3',
    },
    success: {
      main: '#4CAF50',
    },
    error: {
      main: '#F44336',
    },
    warning: {
      main: '#ff9800',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
        },
        containedPrimary: {
          boxShadow: '0 2px 8px rgba(13, 75, 140, 0.2)',
        },
        containedSecondary: {
          boxShadow: '0 2px 8px rgba(255, 107, 26, 0.2)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        elevation1: {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        },
      },
    },
  },
}); 