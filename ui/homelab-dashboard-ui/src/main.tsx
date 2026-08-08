import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeConfigError } from '@radoslavirha/ui-runtime';
import { App } from './App.js';
import { loadConfig } from './runtime/RuntimeConfig.js';
import '@radoslavirha/ui-kit/styles.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) {
    throw new Error('Missing #root element in index.html');
}

/**
 * Guidance per failure reason. In Kubernetes a bad config is caught by the
 * validating initContainer long before the browser sees it, so anything shown
 * here means a local run or a hand-edited file.
 */
const hintFor = (error: unknown): string => {
    if (!(error instanceof RuntimeConfigError)) {
        return 'Unexpected error while starting the dashboard.';
    }
    switch (error.reason) {
        case 'not-found':
            return 'Copy config.example.json to public/config.json, or mount it as a ConfigMap at /usr/share/nginx/html/config.json.';
        case 'not-json':
            return 'nginx must serve config.json before the SPA catch-all, or the response is index.html.';
        case 'invalid':
            return 'config.json was loaded but does not match the schema in src/runtime/RuntimeConfig.ts.';
        case 'network':
            return 'The config request never completed — check the dev server or the network.';
    }
};

const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

loadConfig()
    .then(config => {
        createRoot(root).render(
            <StrictMode>
                <App config={config} />
            </StrictMode>
        );
    })
    .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        root.innerHTML = `
      <div class="config-error">
        <div class="config-error__title">Configuration Error</div>
        <pre class="config-error__msg">${escape(message)}</pre>
        <div class="config-error__hint">${escape(hintFor(err))}</div>
      </div>`;
    });
