import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#675AF9',
      dark: '#210076',
    },
    secondary: {
      main: '#5CAAFA',
    },
    success: {
      main: '#08CA97',
    },
    error: {
      main: '#F94C46',
    },
    background: {
      default: '#F7F7FB',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: '"Red Hat Display", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          padding: '10px 24px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
  },
});

export default theme;
