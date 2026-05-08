export interface AppTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  colors: {
    primary: string;
    secondary: string;
    background: string;
    paper: string;
    sidebar: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    error: string;
    warning: string;
  };
}

export const themes: AppTheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    colors: {
      primary: '#64ffda',
      secondary: '#7c4dff',
      background: '#0f0f23',
      paper: '#1a1a2e',
      sidebar: '#0d0d1a',
      text: '#e2e8f0',
      textSecondary: '#94a3b8',
      border: '#2a2a4e',
      success: '#4caf50',
      error: '#ef4444',
      warning: '#ff9800',
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    mode: 'dark',
    colors: {
      primary: '#ff0000',
      secondary: '#cc0000',
      background: '#0f0f0f',
      paper: '#1a1a1a',
      sidebar: '#0a0a0a',
      text: '#f1f1f1',
      textSecondary: '#aaaaaa',
      border: '#303030',
      success: '#2ba640',
      error: '#ff4444',
      warning: '#ffb830',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    mode: 'dark',
    colors: {
      primary: '#00bcd4',
      secondary: '#0097a7',
      background: '#0a1628',
      paper: '#132238',
      sidebar: '#081320',
      text: '#e0f7fa',
      textSecondary: '#80cbc4',
      border: '#1e3a5f',
      success: '#00e676',
      error: '#ff5252',
      warning: '#ffab40',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    mode: 'dark',
    colors: {
      primary: '#ff6b35',
      secondary: '#f7c948',
      background: '#1a0e1e',
      paper: '#2d1b33',
      sidebar: '#140a17',
      text: '#fde8e0',
      textSecondary: '#c9a0a0',
      border: '#4a2040',
      success: '#66bb6a',
      error: '#ef5350',
      warning: '#ffa726',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    mode: 'dark',
    colors: {
      primary: '#58a6ff',
      secondary: '#bc8cff',
      background: '#0d1117',
      paper: '#161b22',
      sidebar: '#010409',
      text: '#c9d1d9',
      textSecondary: '#8b949e',
      border: '#30363d',
      success: '#3fb950',
      error: '#f85149',
      warning: '#d29922',
    },
  },
  {
    id: 'light',
    name: 'Light',
    mode: 'light',
    colors: {
      primary: '#1976d2',
      secondary: '#9c27b0',
      background: '#f5f5f5',
      paper: '#ffffff',
      sidebar: '#fafafa',
      text: '#1a1a1a',
      textSecondary: '#666666',
      border: '#e0e0e0',
      success: '#2e7d32',
      error: '#d32f2f',
      warning: '#ed6c02',
    },
  },
];

export function getTheme(id: string): AppTheme {
  return themes.find(t => t.id === id) || themes[0];
}
