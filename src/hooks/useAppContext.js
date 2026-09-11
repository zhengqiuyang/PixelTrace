import { useContext } from 'react';
import { AppContext } from '../store/AppContext.jsx';

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
