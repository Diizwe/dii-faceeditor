import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);

// Test hook for the browser suite (tests/browser). Exposes no data beyond what the page already holds.
import { useStore } from './store';
import { exportImage } from './core/export';
import { detectFaces } from './core/faces';
import { loadImage } from './core/image';
import { sourceToOut, outputSize, apply } from './core/geometry';
(window as unknown as { __diiTest: unknown }).__diiTest = { store: useStore, exportImage, detectFaces, loadImage, sourceToOut, outputSize, apply };
