import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './glass.css';
import { applyTheme } from './lib/theme';

applyTheme();

createRoot(document.getElementById('root')!).render(<App />);
