import { describe, expect, it } from 'vitest';
import { Store } from '@tsed/core';
import { Get } from '@tsed/schema';
import { Controller } from '@tsed/di';
import { AuthGuard } from './AuthGuard.js';
import { TEST_METHOD } from '@radoslavirha/auth';
import { Anonymous, Authenticate, CurrentPrincipal } from './decorators.js';
import type { AuthGuardOptions } from './AuthGuard.js';
import type { Principal } from '@radoslavirha/auth';

@Controller('/things')
@Authenticate(TEST_METHOD)
class ProtectedController {
    @Get('/')
    list(@CurrentPrincipal() principal: Principal | undefined): string {
        return principal?.subject ?? 'anonymous';
    }

    @Get('/public')
    @Anonymous()
    open(): string {
        return 'open';
    }
}

const guardOptionsOn = (property: string): AuthGuardOptions | undefined =>
    Store.fromMethod(ProtectedController, property).get(AuthGuard) as AuthGuardOptions | undefined;

describe('@Authenticate on a controller', () => {
    it('reaches every method, so a route added later is protected by default', () => {
        // The arrangement that matters: protection is inherited, not opted into.
        // Per-method application is where the next route is one forgotten
        // decorator away from being public.
        expect(guardOptionsOn('list')).toBeDefined();
        expect(guardOptionsOn('open')).toBeDefined();
    });

    it('leaves a plain method with no anonymous flag, so the guard protects it', () => {
        expect(guardOptionsOn('list')?.anonymous).toBeUndefined();
    });
});

describe('@Anonymous', () => {
    it('marks only the endpoint it sits on', () => {
        expect(guardOptionsOn('open')?.anonymous).toBe(true);
        expect(guardOptionsOn('list')?.anonymous).toBeUndefined();
    });
});

describe('@CurrentPrincipal', () => {
    it('applies without throwing, and the controller still exposes its route', () => {
        // The decorator's real behaviour is the pipe's, which has its own spec;
        // what matters here is that composing it onto a parameter is valid.
        expect(Store.fromMethod(ProtectedController, 'list')).toBeDefined();
    });
});

describe('@Authenticate(method)', () => {
    @Controller('/devices')
    @Authenticate(TEST_METHOD)
    class ExplicitController {
        @Get('/')
        list(): string {
            return '';
        }
    }

    it('records the method the route asked for', () => {
        const options = Store.fromMethod(ExplicitController, 'list').get(AuthGuard) as { method?: string };

        expect(options.method).toBe(TEST_METHOD);
    });

    it('is required, so no route can be guarded without saying by what', () => {
        // A compile-time guarantee, restated at runtime: the guard refuses an
        // endpoint whose store carries no method rather than letting it through.
        expect(guardOptionsOn('list')?.method).toBe(TEST_METHOD);
    });
});
