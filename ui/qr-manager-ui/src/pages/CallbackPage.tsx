import { useNavigate } from 'react-router-dom';
import { AuthCallback, type AuthClient } from '@radoslavirha/ui-auth';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';

/**
 * The registered redirect URI.
 *
 * Everything that can go wrong here — the single-use code, the `no-session`
 * outcome that must settle the provider, the return path a renewal has to
 * preserve, the basename the router prepends twice — lives in `AuthCallback`,
 * because none of it is specific to this app. What is left is this app's three
 * answers: how it navigates, where it lives, and where "home" is.
 */
export const CallbackPage = ({ client }: { client: AuthClient }) => {
    const navigate = useNavigate();
    const { basePath } = useRuntimeConfig();

    return <AuthCallback client={client} navigate={navigate} basePath={basePath} defaultPath="/admin" />;
};
