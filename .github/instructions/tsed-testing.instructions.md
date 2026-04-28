---
description: "Ts.ED + Vitest testing conventions for this monorepo. Use when writing or reviewing unit/integration tests for APIs: services, handlers, mappers, controllers, repositories."
applyTo: "apis/**/*.spec.ts"
---

# Ts.ED Testing Conventions

## Vitest imports

Always import test utilities explicitly from `vitest`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
```

## Unit tests — with DI container

Ts.ED is DI-based. All `@Service`, `@Injectable`, `@Controller` and `@Provider` classes must be resolved via the DI container, never instantiated with `new` in tests.

### PlatformTest.create — for services and mappers without MongoDB

```ts
import { PlatformTest } from '@tsed/platform-http/testing';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { QrCodeService } from './QrCodeService.js';

describe('QrCodeService', () => {
    let service: QrCodeService;

    beforeEach(PlatformTest.create);
    beforeEach(() => {
        service = PlatformTest.get<QrCodeService>(QrCodeService);
    });
    afterEach(PlatformTest.reset);

    it('does something', async () => {
        // ...
    });
});
```

Use `vi.spyOn` to override behaviour of injected dependencies:

```ts
beforeEach(() => {
    vi.spyOn(consoleLike._stdout, 'write').mockImplementation(() => true);
});
afterEach(() => vi.restoreAllMocks());
```

### TestContainersMongo — for services, mappers, and repositories that need Mongoose

Requires `globalSetup` in `vitest.config.ts`:

```ts
// vitest.config.ts
export default defineConfig(mergeConfig(defaultConfig, {
    test: {
        globalSetup: [import.meta.resolve('@tsed/testcontainers-mongo/vitest/setup')],
    }
}));
```

Test structure:

```ts
import { PlatformTest } from '@tsed/platform-http/testing';
import { TestContainersMongo } from '@tsed/testcontainers-mongo';
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { QrCodeMongoRepository } from './QrCodeMongoRepository.js';

describe('QrCodeMongoRepository', () => {
    let repository: QrCodeMongoRepository;

    beforeEach(() => TestContainersMongo.create());
    beforeEach(() => {
        repository = PlatformTest.get<QrCodeMongoRepository>(QrCodeMongoRepository);
    });
    afterEach(() => TestContainersMongo.reset());

    it('creates and retrieves a document', async () => {
        const doc = await repository.create({ slug: 'x7k2' });
        const found = await repository.findById(doc._id);
        expect(found?.slug).toBe('x7k2');
    });
});
```

## Test data

### Domain models — CommonUtils.buildModelStrict

Always use `CommonUtils.buildModelStrict` (or `buildModelPartial` / `buildModelCore`) from `@radoslavirha/utils`. Never use `new` or object literals:

```ts
const buildModel = (overrides: Partial<QrCode> = {}): QrCode =>
    CommonUtils.buildModelStrict(QrCode, {
        id: '671b00000000000000000001',
        slug: 'x7k2',
        targetURL: 'https://iot-ui.home/devices/shelf-1',
        label: 'Shelf 1',
        type: QrType.IOT_DEVICE,
        active: true,
        ...overrides
    });
```

### Mongo model instances — direct property assignment

For Mongoose model instances used in mapper tests, assign properties directly:

```ts
const mongo = new QrCodeMongo();
mongo._id = new Types.ObjectId('671b00000000000000000001').toHexString();
mongo.createdAt = new Date('2026-04-01T00:00:00Z');
mongo.updatedAt = new Date('2026-04-01T00:00:00Z');
mongo.slug = 'x7k2';
```

### expect.assertions

Declare `expect.assertions(n)` at the top of async tests to guard against silent promise resolution:

```ts
it('returns a model instance', async () => {
    expect.assertions(3);
    const result = await repository.findById(doc._id);
    expect(result).toBeInstanceOf(QrCode);
    expect(result!.slug).toBe('x7k2');
    expect(result!.createdAt).toBeInstanceOf(Date);
});
```

## Integration tests — controllers

Handlers are **not** tested directly. Their behaviour is covered by controller-level integration tests that exercise the full HTTP stack via `PlatformTest.bootstrap` + `SuperTest`.

Integration test files are **co-located** with the controller or server they test:
- `DevicesController.integration.spec.ts` next to `DevicesController.ts`
- `Server.integration.spec.ts` next to `Server.ts`

```ts
import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { Server } from './Server.js';

describe('DevicesController (integration)', () => {
    let request: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
    });
    afterEach(PlatformTest.reset);

    it('GET /devices returns 200', async () => {
        const response = await request.get('/devices').expect(200);
        expect(response.body).toMatchObject({ items: expect.any(Array) });
    });
});
```

To override a provider (e.g. replace a real MQTT client):

```ts
beforeEach(PlatformTest.bootstrap(Server, {
    imports: [{ token: MqttClientProvider, use: null }]
}));
```

## File naming

- Unit test: `<ClassName>.spec.ts` — co-located with source file
- Integration test: `<ClassName>.integration.spec.ts` — co-located with the controller or `Server.ts`

## Coverage exclusions

Exclude the following from unit-test coverage (covered by integration tests or not applicable):
- `src/models/**` — schema-only decorator classes
- `src/controllers/**` — tested via integration tests
- `src/handlers/**` — tested via controller integration tests
- `src/storage/**` — requires live DB (tested with TestContainersMongo)
- `src/otel/**` — bootstrap code
- `src/index.ts`, `src/Server.ts`
