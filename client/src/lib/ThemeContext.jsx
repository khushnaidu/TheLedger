import { createContext, useContext, useState, useEffect } from 'react';
import { getTheme, setThemeStorage, THEME_ASSETS, GUS_FACES_MAP, GUS_PERSONA, GUS_QUOTES, STATUS_LABELS, APP_TITLE, LEVEL_TITLES } from './theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = () => {
    const next = theme === 'ledger' ? 'tome' : 'ledger';
    setThemeStorage(next);
    setThemeState(next);
  };

  const value = {
    theme,
    toggle,
    assets: THEME_ASSETS[theme],
    gusFaces: GUS_FACES_MAP[theme],
    gusPersona: GUS_PERSONA[theme],
    gusQuotes: GUS_QUOTES[theme],
    statusLabels: STATUS_LABELS[theme],
    appTitle: APP_TITLE[theme],
    levelTitles: LEVEL_TITLES[theme],
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
