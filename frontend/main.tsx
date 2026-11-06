import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Runtime } from './Runtime';
import { installKeyboardInset } from './lib/hooks';
import './fonts.css';
import './styles.css';

installKeyboardInset();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Runtime />
  </StrictMode>,
);
