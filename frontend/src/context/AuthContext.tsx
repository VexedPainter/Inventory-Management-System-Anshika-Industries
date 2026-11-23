import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../api/client';

export interface User {
  username: string;
  role: 'admin' | 'manager' | 'storekeeper';
  full_name?: string;
  must_change_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  login: (username: string, password: string) => Promise<{ mustChange: boolean }>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  dismissForcedPasswordModal: () => void;
  showForcedPasswordModal: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = sessionStorage.getItem('ss_user') || localStorage.getItem('ss_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return sessionStorage.getItem('ss_token') || localStorage.getItem('ss_token');
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showForcedPasswordModal, setShowForcedPasswordModal] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        body: { username, password }
      });

      const authToken = res.token || res.access_token;
      const userData: User = res.user || {
        username: res.username || username,
        role: res.role || 'storekeeper',
        full_name: res.full_name || username,
      };

      if (res.must_change_password || res.require_password_change) {
        userData.must_change_password = true;
        setShowForcedPasswordModal(true);
      }

      sessionStorage.setItem('ss_token', authToken);
      sessionStorage.setItem('ss_user', JSON.stringify(userData));
      localStorage.setItem('ss_token', authToken);
      localStorage.setItem('ss_user', JSON.stringify(userData));

      setToken(authToken);
      setUser(userData);

      return { mustChange: Boolean(userData.must_change_password) };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem('ss_token');
    sessionStorage.removeItem('ss_user');
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_user');
    setUser(null);
    setToken(null);
    setShowForcedPasswordModal(false);
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword }
    });

    if (user) {
      const updatedUser = { ...user, must_change_password: false };
      setUser(updatedUser);
      sessionStorage.setItem('ss_user', JSON.stringify(updatedUser));
      localStorage.setItem('ss_user', JSON.stringify(updatedUser));
    }
    setShowForcedPasswordModal(false);
  };

  const dismissForcedPasswordModal = () => {
    setShowForcedPasswordModal(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        theme,
        toggleTheme,
        login,
        logout,
        changePassword,
        dismissForcedPasswordModal,
        showForcedPasswordModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
