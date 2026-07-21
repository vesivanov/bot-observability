# Contributing

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and BOT_LOG_TOKEN
npm run migrate        # apply db/migrations/*.sql to your database
npm run dev            # http://localhost:3000
```

Requires Node 20+ (see `.nvmrc`) and a PostgreSQL database.

## Tests

```bash
npm run test:unit          # pure-logic tests, no database required — always run these
npm run test:integration   # needs a real Postgres database
```

Integration tests (`test/integration/*.test.ts`) read `TEST_DATABASE_URL` and **skip themselves entirely if it is unset** — point it at a throwaway/disposable Postgres instance, never a database with data you care about. They apply migrations, seed fixtures, and clean up after themselves.

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/bot_observability_test npm run test:integration
```

`npm test` runs the same thing as `npm run test:unit`.

## Lint and typecheck

```bash
npm run lint        # eslint
npx tsc --noEmit    # typecheck
npm audit           # dependency advisories
```

## CI

Every push/PR to `main` runs, in order: lint, typecheck, unit tests, `npm run migrate`, integration tests (against a Postgres service container), and `npm run build`. See `.github/workflows/ci.yml`. Make sure all of the above pass locally before opening a PR.
