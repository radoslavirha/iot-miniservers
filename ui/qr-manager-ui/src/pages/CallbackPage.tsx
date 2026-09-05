import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleCallback, type AuthClient, type CallbackResult } from '@radoslavirha/ui-auth';

/**
 * The one registered redirect URI, serving both a top-level login return and
 * the hidden iframe of a silent renewal. In the iframe case nothing is
 * rendered and no navigation happens — oidc-client-ts reads the result out of
 * the frame itself.
 *
 * In practice `main.tsx` intercepts the framed case before <App> mounts, so
 * this component only ever runs top-level. The check stays because the two
 * guards fail in opposite directions, and this is the one that survives if the
 * app ever gains a static silent-renew.html.
 */
export const CallbackPage = ({ client }: { client: AuthClient }) => {
    const navigate = useNavigate();
    const [result, setResult] = useState<CallbackResult | undefined>();

    useEffect(() => {
        void handleCallback(client, { isFramed: window.self !== window.top }).then(outcome => {
            setResult(outcome);
            if (outcome === 'signed-in') {
                navigate('/admin', { replace: true });
            }
        });
    }, [client, navigate]);

    if (result === 'failed') {
        return (
            <p role="alert">
                Sign-in could not be completed. Reload the page to try again.
            </p>
        );
    }

    return <p>Signing in…</p>;
};
