# Maw3id

**Real-time medical queue visibility and patient ticketing for Moroccan private practices.**

Maw3id helps patients discover verified doctors, understand current waiting conditions, join a queue remotely, and eventually follow their position without arriving hours early. It also provides the foundation for doctors and secretaries to operate queues safely and fairly.

> [!IMPORTANT]
> Maw3id is under active development. The repository contains a production-oriented foundation, but it is **not ready for use by real clinics or patients**. See [Current status](#current-status) and [Production readiness](#production-readiness).

## Why Maw3id?

Patients in Morocco often have little visibility into how busy a medical practice is before travelling. This can cause early arrivals, overcrowded waiting rooms, and long, uncertain waits. Maw3id is designed around live operational truth rather than fabricated appointment availability:

- verified medical-practice locations;
- public queue status and freshness;
- secure patient queue tickets;
- fair, transactional queue ordering;
- privacy-safe nearby-doctor discovery;
- auditable staff and patient actions.

Video consultation is intentionally outside the current scope.

## Current status

Implemented:

- responsive React and TypeScript patient application;
- public doctor search by specialty, city, or coordinates;
- verified-only doctor and cabinet results;
- queue status, distance, freshness, and estimated-wait projections;
- lazy-loaded MapLibre integration;
- Moroccan phone-number normalization and OTP sign-in;
- hashed, expiring, single-use OTP challenges;
- phone, IP, resend, attempt, and platform-wide OTP limits;
- opaque HttpOnly browser sessions and CSRF protection;
- session restoration and logout;
- transactional queue admission with concurrency protection;
- PostgreSQL migrations, constraints, audit events, and integration tests;
- structured API errors, request IDs, CORS controls, and security headers.

Not yet implemented:

- a configured production SMS provider;
- patient ticket history and live ticket tracking UI;
- complete staff queue-management workflows;
- doctor onboarding and verification tooling;
- real-time queue updates;
- administrative tools;
- production deployment, monitoring, backups, and disaster recovery.

## Architecture

Maw3id is a modular monolith. PostgreSQL is the correctness authority for queue ordering, capacity, authentication sessions, and audit history.

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web | React 19, TypeScript, Vite | Search, authentication, patient experience, map UI |
| API | Node.js, Express 5 | Validation, authentication, authorization, queue and search boundaries |
| Database | PostgreSQL | Transactions, constraints, migrations, sessions, tickets, audit events |
| Validation | Zod and explicit API validation | Runtime response and request-boundary validation |
| Mapping | MapLibre | Optional verified-cabinet map display |
| Testing | Node test runner, Vitest, Testing Library | Unit, API, frontend, and real PostgreSQL integration tests |

The main architecture and domain decisions are documented in:

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Authentication and security](docs/AUTH_AND_SECURITY.md)
- [Queue engine](docs/QUEUE_ENGINE.md)
- [Database workflow](backend/db/README.md)

## Repository structure

```text
Maw3id/
├── backend/
│   ├── db/migrations/       PostgreSQL schema migrations
│   ├── src/auth/            OTP, sessions, CSRF, and authorization
│   ├── src/queue/           Transactional queue admission
│   ├── src/search/          Public nearby-doctor search
│   ├── src/routes/          HTTP routing
│   ├── test/                Unit and API tests
│   └── test-integration/    Real PostgreSQL integration tests
├── frontend/
│   └── src/
│       ├── api/             Validated HTTP client
│       ├── app/             Application shell and routing
│       └── features/        Search and patient authentication
└── docs/                    Product, architecture, security, and queue design
```

## Prerequisites

- Node.js 24 or a compatible current Node.js release;
- npm;
- PostgreSQL with permission to create and migrate a development database;
- a modern browser.

On Windows, PostgreSQL may be installed even when `psql` is not in `PATH`. A typical executable location is:

```text
C:\Program Files\PostgreSQL\18\bin\psql.exe
```

## Local development

### 1. Create a PostgreSQL database

Create an empty database with pgAdmin, `createdb`, or `psql`. For example:

```sql
CREATE DATABASE maw3id;
```

### 2. Install backend dependencies

```powershell
cd backend
npm.cmd ci
```

### 3. Configure the backend environment

Use [backend/.env.example](backend/.env.example) as the configuration reference. The backend currently reads process environment variables directly; it does not automatically load `.env` files.

For a local PowerShell session:

```powershell
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgresql://maw3id:your_password@localhost:5432/maw3id"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
$env:OTP_DELIVERY_MODE = "development"
$env:OTP_HASH_PEPPER = "local-development-pepper-change-me"
```

Development OTP mode returns the code in the development API response so the local UI can complete sign-in without sending an SMS. Production configuration rejects this mode.

### 4. Check and migrate PostgreSQL

From `backend/`:

```powershell
npm.cmd run db:check
npm.cmd run db:migrate
npm.cmd start
```

The API listens on `http://127.0.0.1:3000` by default.

### 5. Start the frontend

In a second terminal:

```powershell
cd frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

The web application is available at `http://localhost:5173` by default.

The map remains disabled until `VITE_MAP_STYLE_URL` points to a licensed, production-appropriate MapLibre style provider.

## API overview

Base path: `/api/v1`

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/doctors/nearby` | Public | Search verified doctors and current queue status |
| `POST` | `/auth/phone/request` | Public, trusted Origin | Request a patient OTP challenge |
| `POST` | `/auth/phone/verify` | Public, trusted Origin | Verify an OTP and establish a session |
| `GET` | `/auth/session` | Session cookie | Restore the user session and rotate CSRF |
| `POST` | `/auth/logout` | Session + CSRF | Revoke the current session |
| `POST` | `/queue-sessions/:id/tickets` | Patient session + CSRF | Join an open queue transactionally |

Health endpoints:

- `GET /healthz`
- `GET /readyz`

## Testing

### Backend unit and API tests

```powershell
cd backend
npm.cmd test
```

### PostgreSQL integration tests

Integration tests deliberately refuse to run against databases whose names do not end in `_test` or `_validation`.

```powershell
$env:DATABASE_URL = "postgresql://maw3id:your_password@localhost:5432/maw3id_validation"
npm.cmd run db:migrate
npm.cmd run test:integration
```

### Frontend quality gate

```powershell
cd frontend
npm.cmd run check
```

This runs TypeScript, ESLint, Vitest, and the production build.

## Security model

Security controls currently include:

- server-owned identities and roles;
- opaque session tokens stored only as hashes;
- `HttpOnly`, `SameSite=Lax` session cookies;
- CSRF tokens bound to server-side sessions;
- strict Origin checks for authentication mutations;
- HMAC-hashed OTP codes and IP identifiers;
- OTP expiry, attempt limits, cooldowns, and layered throttling;
- generic invalid/expired OTP responses;
- verified-only public doctor projection;
- parameterized SQL queries;
- resource-level queue authorization;
- append-only operational audit events;
- production configuration checks for HTTPS and secret/provider settings.

Never commit `.env` files, database credentials, provider tokens, OTP peppers, or real patient data.

Security issues should be reported privately to the maintainers rather than opened as public issues.

## Production readiness

Passing tests does not make Maw3id production-ready. A real pilot requires, at minimum:

- a reviewed SMS provider and cost/abuse alerts;
- staff queue lifecycle and authorization coverage;
- rate limiting backed by production deployment topology;
- monitoring, structured log transport, metrics, and error tracking;
- encrypted backups and tested restoration;
- HTTPS deployment and managed secrets;
- load, security, privacy, and operational testing;
- reviewed recovery processes for lost or recycled phone numbers;
- clinic onboarding and doctor-verification procedures.

## Development principles

- PostgreSQL remains the source of truth for queue correctness.
- Client-provided identity, role, ownership, or queue position is never trusted.
- Queue-changing operations are transactional and auditable.
- Public endpoints never expose patient or sensitive medical data.
- Location permission is optional; city-based search must remain available.
- Stale queue information becomes unavailable or unknown rather than appearing live.
- New features require meaningful tests at the appropriate boundary.

## Roadmap

The next coherent milestone is the patient ticket dashboard:

1. list active and historical tickets for the authenticated patient;
2. show position, estimated wait, freshness, and queue state;
3. allow safe patient cancellation;
4. add polling or Server-Sent Events for near-real-time updates.

After that, priority moves to staff queue operations, doctor onboarding/verification, realtime delivery, and production operations.

## Contributing

Before submitting a change:

1. keep the scope focused on one coherent milestone;
2. add or update meaningful tests;
3. run backend tests and the frontend quality gate;
4. run PostgreSQL integration tests for database-sensitive changes;
5. review the diff for secrets, generated files, unrelated edits, and migration safety;
6. update relevant documentation and configuration examples.
