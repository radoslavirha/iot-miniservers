import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeConfigError } from '@radoslavirha/ui-runtime';
import { createAuthClient, handleCallback } from '@radoslavirha/ui-auth';
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
        return 'Unexpected error while starting the app.';
    }
    switch (error.reason) {
        case 'not-found':
            return 'Create public/config.json, or mount it as a ConfigMap at /usr/share/nginx/html/config.json.';
        case 'not-json':
            return 'nginx must serve config.json before the SPA catch-all, or the response is index.html.';
        case 'invalid':
            return 'config.json was loaded but does not match the schema in src/runtime/RuntimeConfig.ts.';
        case 'network':
            return 'The config request never completed — check the dev server or the network.';
    }
};

const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * `silent_redirect_uri` is the app's own /callback path, because Authentik
 * registers exactly one authorization redirect URI per application and matches
 * it strictly. nginx serves index.html there, so the hidden renew iframe would
 * otherwise boot this entire SPA — AuthProvider included — and that provider
 * would start a renewal of its own, in a nested iframe, and so on until each
 * level times out. Once every four minutes, forever.
 *
 * In the iframe there is nothing to render and no router to mount: finish the
 * code exchange, let oidc-client-ts post the result up to the parent, stop.
 *
 * The cleaner shape is a static silent-renew.html registered as a second
 * redirect URI. It is deferred because that is a homelab chart change applying
 * to every application; see the plan's "The better fix, deferred".
 */
const isFramed = window.self !== window.top;

loadConfig()
    .then(async config => {
        if (isFramed && window.location.pathname.endsWith('/callback')) {
            await handleCallback(createAuthClient(config.auth), { isFramed: true });
            return;
        }

        createRoot(root).render(
            <StrictMode>
                <App config={config} />
            </StrictMode>
        );
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        root.innerHTML = `
      <div class="config-error">
        <div class="config-error__title">Configuration Error</div>
        <pre class="config-error__msg">${escape(message)}</pre>
        <div class="config-error__hint">${escape(hintFor(error))}</div>
      </div>`;
    });
