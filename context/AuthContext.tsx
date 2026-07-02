'use client';

import React, { createContext, useContext, useState } from 'react';

interface LocalUser {
  uid: string;
  email: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  language: 'hr' | 'en';
  setLanguage: (lang: 'hr' | 'en') => void;
}

const LOCAL_USER: LocalUser = {
  uid: 'local-profile',
  email: 'Local profile',
};

const AuthContext = createContext<AuthContextType>({
  user: LOCAL_USER,
  loading: false,
  logout: async () => {},
  language: 'hr',
  setLanguage: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<'hr' | 'en'>(() => {
    if (typeof window === 'undefined') return 'hr';
    const saved = window.localStorage.getItem('aivalidator_lang');
    return saved === 'hr' || saved === 'en' ? saved : 'hr';
  });

  const setLanguage = (lang: 'hr' | 'en') => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('aivalidator_lang', lang);
    }
  };

  const logout = async () => {
    // Local-first mode has no cloud session. Keeping this as a no-op preserves the old UI contract.
  };

  return (
    <AuthContext.Provider value={{ user: LOCAL_USER, loading: false, logout, language, setLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
