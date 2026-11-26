import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ensureMonacoReady } from './editor/monacoSetup';
import { IdeProvider } from './state/IdeContext';
import './styles.css';

ensureMonacoReady();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IdeProvider>
      <App />
    </IdeProvider>
  </React.StrictMode>,
);
