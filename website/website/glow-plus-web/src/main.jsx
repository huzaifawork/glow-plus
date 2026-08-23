import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import './lib/config.js';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </I18nProvider>
  </StrictMode>
);
