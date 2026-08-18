# Maw3id database

This folder contains database migrations for the production Maw3id domain.

The first production milestone is not a generic appointment table. It is a consistency-safe queue system:

1. verified cabinets and doctors;
2. queue sessions per doctor/cabinet/date/window;
3. tickets with strict state transitions;
4. audit events for every sensitive action.

For local development, run migrations against a disposable PostgreSQL database before seeding demo data.

## Local PostgreSQL workflow

Create a local database on your laptop, then set `DATABASE_URL` in `backend/.env` or your shell.

Example:

```text
DATABASE_URL=postgresql://maw3id:maw3id_password@localhost:5432/maw3id
```

Then from `backend/`:

```bash
npm run db:check
npm run db:migrate
```

`db:check` verifies that Node can connect to PostgreSQL.

`db:migrate` applies every SQL file in `db/migrations/` once and records applied files in `schema_migrations`.

After migrating an isolated database whose name ends in `_test` or `_validation`, run the
PostgreSQL-backed queue checks:

```bash
npm run test:integration
```

The integration suite deliberately refuses to run against any other database name. It creates
unique fixtures, exercises committed queue transactions and concurrency, and removes its data
after each test.

Future implementation note: the app can move to Prisma, Drizzle, or node-pg-migrate before a real pilot. The SQL files here define the intended database contract and constraints.
