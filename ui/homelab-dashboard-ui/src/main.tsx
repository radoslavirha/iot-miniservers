import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { loadRuntimeConfig } from './runtime/RuntimeConfig.js';
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
    .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        root.innerHTML = `
      <div class="config-error">
        <div class="config-error__title">Configuration Error</div>
        <div class="config-error__msg">${msg.replace(/</g, '&lt;')}</div>
        <div class="config-error__hint">
          Copy <code>config.example.json</code> to <code>public/config.json</code> and fill in your values,
          or mount it as a k8s ConfigMap at <code>/usr/share/nginx/html/config.json</code>.
        </div>
      </div>`;
    });
