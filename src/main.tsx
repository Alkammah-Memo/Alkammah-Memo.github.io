import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './glass.css';
import { applyTheme } from './lib/theme';
import { AppLockGate } from './components/auth/AppLockGate';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <AppLockGate>
    <App />
  </AppLockGate>
);

// never let another site show this app inside its own page (clickjacking)
if (window.top !== window.self) document.body.innerHTML = '';
