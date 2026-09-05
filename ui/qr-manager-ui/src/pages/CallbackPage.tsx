import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleCallback, useAuth, type AuthClient, type CallbackResult } from '@radoslavirha/ui-auth';

/**
 * The registered redirect URI. Always a top-level return — there is no iframe
 * variant, because Authentik refuses to be framed at all.
 *
 * Three outcomes, and only one of them is an error:
 *  - signed-in  the code was exchanged; go where the user was headed
 *  - no-session the prompt=none probe found no SSO session. Ordinary: fall
 *               through to the app, which renders the sign-in page
 *  - failed     a replayed code or a stale state entry. Offer a retry
 */
export const CallbackPage = ({ client }: { client: AuthClient }) => {
    const navigate = useNavigate();
    const { resolveAnonymous } = useAuth();
    const [result, setResult] = useState<CallbackResult | undefined>();

    useEffect(() => {
        void handleCallback(client).then(outcome => {
            setResult(outcome);
            if (outcome === 'signed-in') {
                navigate('/admin', { replace: true });
                return;
            }
            if (outcome === 'no-session') {
                // No userLoaded event is coming, so the provider must be told
                // to settle — otherwise it waits forever and the app shows
                // Loading… where the sign-in page belongs.
                resolveAnonymous();
                navigate('/admin', { replace: true });
            }
        });
    }, [client, navigate, resolveAnonymous]);

    if (result === 'failed') {
        return (
            <p role="alert">
                Sign-in could not be completed. Reload the page to try again.
            </p>
        );
    }

    return <p>Signing in…</p>;
};
