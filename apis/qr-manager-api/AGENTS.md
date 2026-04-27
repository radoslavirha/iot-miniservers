# Instructions

- Stick to root [AGENTS.md](../../AGENTS.md) instructions.
- API end-user documentation lives in [.README.hbs](./.README.hbs) (compiled to `README.md` via `docs.js`). Keep it up to date when adding or changing endpoints, config keys, or protocols. Swagger UI is mounted at `/`.
- Technical architecture reference lives in [DEVELOPMENT.md](./DEVELOPMENT.md).

## Source structure

```text
src/
├── controllers/        # Ts.ED HTTP controllers — one file per resource
│   ├── QrCodeController.ts        # /qr-codes admin CRUD + image
│   └── RedirectController.ts      # GET /:slug → 302
├── handlers/
│   ├── RedirectHandler.ts
│   └── qr-codes/                   # one file per QrCodeController action
├── mappers/
│   ├── MongoQrCodeMapper.ts        # DTO ↔ domain model
│   └── QrCodeResponseMapper.ts     # domain → public response (adds qrURL, imageURL)
├── models/
│   ├── config/                     # Zod config schemas
│   ├── QrCode.ts                   # domain model
│   ├── QrCode{Create,Update}Request.ts
│   ├── QrCode{,List}Response.ts
│   ├── QrType.enum.ts
│   ├── QrImageFormat.enum.ts
│   └── SwaggerDocs.enum.ts
├── otel/                           # OpenTelemetry bootstrap
├── services/
│   ├── ConfigService.ts
│   ├── QrCodeMongoService.ts       # repo + mapper + slug allocator orchestration
│   ├── QrImageService.ts           # qrcode lib wrapper (PNG / SVG)
│   └── ShortIdService.ts           # nanoid-based slug generator
└── storage/
    └── qr-mongo/
        ├── dto/QrCodeMongoDTO.ts
        └── QrCodeMongoRepository.ts
```

All controllers mount at `/`. There is no API version prefix — versioning is at the package level via Changesets.

## Slugs

- 4 characters, lowercase alphanumeric (`[a-z0-9]`), generated with `nanoid` `customAlphabet`.
- Stored in a unique-indexed `slug` field (Mongo `_id` is the standard ObjectId).
- Insert is retried on `E11000` duplicate-key against the `slug` index up to 5 attempts before throwing `Conflict`.

## Routing

- `GET /:slug` → 302 to `target_url`. Slug format is enforced inside `RedirectHandler`; non-matching paths return 404 instead of hitting Mongo.
- `GET /qr-codes`, `POST /qr-codes`, `GET/PUT/DELETE /qr-codes/:id`, `GET /qr-codes/:id/image` — admin REST surface, fully documented in Swagger.
- Stable QR URLs come from the public domain (`qr.home`) and the 4-char slug. The path is constant for the lifetime of the printed QR; only DNS / proxy routing changes if the cluster moves.

## Coding rules

- Never use `any` type.
- Repositories return `null` (not `undefined`) for missing single-document results. Services convert to `undefined` where callers expect it.
- Use **constructor injection** for services that need to be stubbed in unit tests. `@Inject` property decorators are fine for thin singletons that don't need mocking.
- Zod is used **only** for server config validation. REST schemas use Ts.ED decorators (`@Property`, `@Required`, `@Enum`, `@Pattern`, `@Minimum`, `@Maximum`, ...).
- Constants (regex sources, retry counts, image bounds) live in [src/constants.ts](./src/constants.ts) — single source of truth shared by validators, services and tests.
