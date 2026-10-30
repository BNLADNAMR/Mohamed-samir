import { installGlobalAbortErrorGuard } from './utils/abortErrorGuard';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

installGlobalAbortErrorGuard();

createRoot(document.getElementById('root')!).render(<App />);
