import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { themes, getTheme, type AppTheme } from './themes';

interface ThemeContextValue {
  currentTheme: AppTheme;
  setThemeId: (id: string) => void;
  availableThemes: AppTheme[];
}

const ThemeContext = createContext<ThemeContextValue>({
  currentTheme: themes[0],
  setThemeId: () => {},
  availableThemes: themes,
});

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const STORAGE_KEY = 'ytd-theme';

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'midnight';
    } catch {
      return 'midnight';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {}
  }, [themeId]);

  const currentTheme = getTheme(themeId);

  const muiTheme = useMemo(() => createTheme({
    palette: {
      mode: currentTheme.mode,
      primary: { main: currentTheme.colors.primary },
      secondary: { main: currentTheme.colors.secondary },
      background: {
        default: currentTheme.colors.background,
        paper: currentTheme.colors.paper,
      },
      text: {
        primary: currentTheme.colors.text,
        secondary: currentTheme.colors.textSecondary,
      },
      success: { main: currentTheme.colors.success },
      error: { main: currentTheme.colors.error },
      warning: { main: currentTheme.colors.warning },
      divider: currentTheme.colors.border,
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', borderRadius: 8 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
    },
  }), [currentTheme]);

  const contextValue: ThemeContextValue = {
    currentTheme,
    setThemeId,
    availableThemes: themes,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
