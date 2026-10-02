# Contributing

Use Node 24 (see `.nvmrc`) and a disposable PostgreSQL database. Public checks do not require the maintainer's other repositories.

```bash
npm ci
npm run setup          # generate missing secrets, preserve existing values
# Set DATABASE_URL in .env to a development database.
npm run migrate
npm run dev
```

Run local checks before opening a PR:

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npx vitest run test/setup.test.ts
npm run verify:prefilter
npm run build
npm audit
```

`npm test` runs unit, setup and integration files. Integration tests skip entirely if `TEST_DATABASE_URL` is absent; a skipped run is not a database verification. Apply migrations first and never use a database whose data matters:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/bot_observability_test npm run migrate
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/bot_observability_test npm run test:integration
```

The fixtures create records/schemas and clean them up. `verify:prefilter` compares the maintained Next.js sender with the collector and exercises the registry's positive UA fixtures. Update both pattern copies together. There are no private sibling-repository prerequisites.

GitHub Actions is disabled at the operator's request. Keep useful tests and run them locally. For a UI change inspect desktop and a narrow viewport, plus the affected empty/filtered/historical state. Keep new regressions focused on a concrete bug; no snapshot or coverage-percentage target is required.

Migrations are recorded and never rerun once applied. New schema changes belong in a new numbered file. Review [maintenance and history preservation](docs/operations.md) before changing retained data, and [security reporting](SECURITY.md) for private disclosures.
