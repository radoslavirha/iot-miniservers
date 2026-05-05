import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { loadRuntimeConfig } from './runtime/RuntimeConfig.js';
import '@radoslavirha/ui-kit/styles.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
    throw new Error('Missing #root element in index.html');
}

loadRuntimeConfig()
    .then(config => {
        createRoot(root).render(
            <StrictMode>
                <App config={config} />
            </StrictMode>
        );
    })
    .catch(error => {
        root.innerHTML = `<pre style="color:red">${(error as Error).message}</pre>`;
    });
