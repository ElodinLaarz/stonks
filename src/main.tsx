import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <div>Stonks</div>;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('No #root element found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
