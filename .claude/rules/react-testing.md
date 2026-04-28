---
paths:
  - "ui/**/*.spec.{ts,tsx}"
---

# React Testing Conventions

## Environment

Tests run in jsdom. The vitest config for each UI package sets:

```ts
test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
}
```

The setup file imports `@testing-library/jest-dom/vitest` to extend `expect` with DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, `toHaveTextContent`, etc.).

## Imports

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

## Mock lifecycle

Restore mocks and reset the browser location after each test:

```ts
afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
});
```

## Mocking `fetch`

Replace `globalThis.fetch` with a `vi.fn()` for tests that make HTTP calls:

```ts
const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ items: [sample] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })
);
Object.assign(globalThis, { fetch: fetchMock });
```

Helper for common response shapes:

```ts
const okJson = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
```

## Rendering components

Pass the minimum required props; use factory functions for shared fixtures:

```ts
const config = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
    apiBaseURL: 'https://api.server.home/qr',
    basePath: '/',
    ...overrides
});

render(<App config={config()} />);
```

## Querying the DOM

Prefer queries in this order (most semantic → least):

| Query | When to use |
|---|---|
| `getByRole` | Interactive elements (button, link, heading, img, etc.) |
| `getByLabelText` | Form fields associated with a `<label>` |
| `getByText` | Visible text content |
| `getByTestId` | Last resort when no semantic query works |

- Use `getBy*` when the element must exist (throws if absent)
- Use `findBy*` for async elements that appear after data loads
- Use `queryBy*` only when asserting an element is absent

```ts
// preferred
const heading = screen.getByRole('heading', { name: 'QR codes' });
const link = screen.getByRole('link', { name: 'List' });
const input = screen.getByLabelText('Type');

// async
await waitFor(() => expect(screen.getByText('Shelf 1')).toBeInTheDocument());
// or
const el = await screen.findByText('Shelf 1');

// asserting absence
expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
```

## User interactions

Use `@testing-library/user-event` for realistic user events:

```ts
const onChange = vi.fn();
render(<Filters value={{}} onChange={onChange} />);

await userEvent.selectOptions(screen.getByLabelText('Type'), 'iot-device');
expect(onChange).toHaveBeenCalledWith({ type: 'iot-device' });
```

## Test data factories

Define typed constants or factory functions at the top of the test file:

```ts
const sample: QrCode = {
    id: 'id1',
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: 'iot-device',
    active: true,
    qrURL: 'https://qr.home/x7k2',
    imageURL: 'https://api.server.home/qr/qr-codes/id1/image',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z'
};
```

## Assertions

```ts
// element presence
expect(screen.getByText('Shelf 1')).toBeInTheDocument();

// attribute check
expect(img).toHaveAttribute('src', `${sample.imageURL}?format=svg`);

// fetch called correctly
expect(fetchMock).toHaveBeenCalledWith('https://api.server.home/qr/qr-codes');
const [url, init] = fetchMock.mock.calls[0];
expect(init.method).toBe('POST');
expect(JSON.parse(init.body)).toEqual({ active: false });

// routing
expect(window.location.pathname).toBe('/admin');
```

## API client tests (pure unit, no rendering)

Test path-building helpers and HTTP methods directly, without mounting any component:

```ts
describe('buildListPath', () => {
    it('encodes the type filter', () => {
        expect(__test__.buildListPath({ type: 'iot-device' })).toBe('/qr-codes?type=iot-device');
    });
});

describe('createQrCodesClient', () => {
    it('lists QR codes and unwraps the items array', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson({ items: [sample] }));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        const items = await client.list({ type: 'iot-device' });
        expect(fetchMock).toHaveBeenCalledWith('https://api.server.home/qr/qr-codes?type=iot-device');
        expect(items).toEqual([sample]);
    });
});
```

## File organization

- Test files co-located with source: `QrImage.spec.tsx` next to `QrImage.tsx`
- Naming: `<ComponentName>.spec.tsx` for components, `<module>.spec.ts` for non-JSX modules
- `pages/**` are excluded from coverage — exercise via `App.spec.tsx` or e2e

## Coverage thresholds

Each UI package targets 70% lines/statements/functions/branches. Pages directory is excluded. Run `pnpm test` inside the UI package directory.
