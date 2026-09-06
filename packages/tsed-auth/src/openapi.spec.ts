import { describe, expect, it } from 'vitest';
import { Controller } from '@tsed/di';
import { Get, Post, SpecTypes, getSpec } from '@tsed/schema';
import type { Principal } from '@radoslavirha/auth';
import { Anonymous, Authenticate, BEARER_JWT_SCHEME, CurrentPrincipal } from './decorators.js';

@Controller('/qr-codes')
@Authenticate()
class DocumentedController {
    @Get('/')
    list(@CurrentPrincipal() principal: Principal | undefined): string {
        return principal?.subject ?? '';
    }

    @Post('/')
    create(): string {
        return 'created';
    }

    @Get('/:slug')
    @Anonymous()
    resolve(): string {
        return 'redirect';
    }
}

/** Method-level use: supported, though the class-level form is the safe default. */
@Controller('/mixed')
class PartlyProtectedController {
    @Get('/open')
    open(): string {
        return 'open';
    }

    @Get('/closed')
    @Authenticate()
    closed(): string {
        return 'closed';
    }
}

const specOf = (token: Parameters<typeof getSpec>[0]) =>
    getSpec(token, { specType: SpecTypes.OPENAPI }) as {
        paths: Record<string, Record<string, { security?: unknown[]; responses?: Record<string, unknown> }>>;
    };

const spec = getSpec(DocumentedController, { specType: SpecTypes.OPENAPI }) as {
    paths: Record<string, Record<string, { security?: unknown[]; responses?: Record<string, unknown> }>>;
};

const operation = (path: string, method: string) => spec.paths[path]?.[method];

describe('generated OpenAPI', () => {
    it('marks a protected operation with the bearer scheme', () => {
        expect(operation('/qr-codes', 'get')?.security).toEqual([{ [BEARER_JWT_SCHEME]: [] }]);
    });

    it('marks every operation of the controller, not just the first', () => {
        // The whole reason @Authenticate goes on the class: a route added later
        // is documented as protected without anyone remembering to say so.
        expect(operation('/qr-codes', 'post')?.security).toEqual([{ [BEARER_JWT_SCHEME]: [] }]);
    });

    it('documents the two responses the guard can actually produce', () => {
        const responses = operation('/qr-codes', 'get')?.responses ?? {};

        expect(Object.keys(responses)).toEqual(expect.arrayContaining(['401', '503']));
    });

    it('overrides an anonymous operation with an empty requirement', () => {
        // OpenAPI's own opt-out: `security: []` on the operation. Swagger UI
        // stops offering the padlock on a route that ignores it.
        expect(operation('/qr-codes/{slug}', 'get')?.security).toEqual([]);
    });

    it('does not claim an anonymous operation can answer 401', () => {
        const responses = operation('/qr-codes/{slug}', 'get')?.responses ?? {};

        expect(Object.keys(responses)).not.toContain('401');
        expect(Object.keys(responses)).not.toContain('503');
    });

    it('emits nothing but standard OpenAPI — no vendor extensions', () => {
        // The requirement was "native, no new inventions in the swagger json".
        // An `x-` key anywhere would break a generator that does not know it.
        const asText = JSON.stringify(spec);
        expect(asText).not.toMatch(/"x-/);
    });

    it('does not name a scheme the document has not defined', () => {
        // The scheme itself is declared once, by the swagger config, under
        // components.securitySchemes. Operations only reference it by name.
        expect(BEARER_JWT_SCHEME).toBe('BEARER_JWT');
    });
});

describe('generated OpenAPI — method-level @Authenticate', () => {
    const mixed = specOf(PartlyProtectedController);

    it('marks only the operation it sits on', () => {
        expect(mixed.paths['/mixed/closed']?.['get']?.security).toEqual([{ [BEARER_JWT_SCHEME]: [] }]);
    });

    it('leaves an undecorated sibling with no requirement at all', () => {
        // Which is exactly why the class-level form is the recommended default:
        // silence here means "public", and silence is what a forgotten decorator
        // produces.
        expect(mixed.paths['/mixed/open']?.['get']?.security).toBeUndefined();
    });
});
