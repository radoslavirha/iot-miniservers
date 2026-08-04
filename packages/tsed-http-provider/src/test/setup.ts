// Initialises Ts.ED's schema/DI machinery (JsonEntityStore registry) before any
// decorated class is imported, so parameter decorators like `@Context()` can be
// evaluated at module-load time in unit tests.
import '@tsed/platform-http/testing';
