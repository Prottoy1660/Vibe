import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import './index.css';

const el = document.getElementById('root');
if (!el) {
  throw new Error('Missing #root element in index.html');
}

createRoot(el).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
