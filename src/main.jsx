import React from 'react';
import ReactDOM from 'react-dom/client';
import FinanceApp from './FinanceApp';
import AuthGate from './AuthGate';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>{({ profile, signOut }) => <FinanceApp profile={profile} signOut={signOut} />}</AuthGate>
  </React.StrictMode>
);
