import { useAuth } from '@radoslavirha/ui-auth';

/**
 * What an unauthenticated visitor sees INSTEAD of the app — not alongside it.
 *
 * By the time this renders, the provider has already asked the IdP whether this
 * browser has a session (top-level, prompt=none) and been told it does not. So
 * this page means "no SSO session anywhere", and the button is the deliberate,
 * prompt-ful login.
 */
export const SignInPage = () => {
    const { login } = useAuth();

    return (
        <section className="signin">
            <h1>QR Manager</h1>
            <p>You need to sign in to use this application.</p>
            <button className="signin__button" onClick={() => void login()}>
                Sign in
            </button>
        </section>
    );
};
