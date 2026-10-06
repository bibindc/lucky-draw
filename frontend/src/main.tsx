import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import App from './App';
import { createAppQueryClient } from './session';
import './styles.css';

const queryClient = createAppQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>{(admin, signOut) => <App adminName={admin.name} agentCode={admin.agentCode} onLogout={signOut.signOut} role={admin.role ?? 'SUPER_ADMIN'} signOutError={signOut.error} signingOut={signOut.pending} />}</AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);