# Test Management System

A full-stack starter implementation for the Full Stack Developer assignment.

## Stack
- Frontend: React 18 + Vite + Material UI + Recharts
- Backend: Node.js + Express
- Database: PostgreSQL
- Cache: Redis (optional locally; automatically skipped when unavailable)
- Auth: JWT + bcrypt
- Security: Helmet, CORS, express-rate-limit, Zod validation
- API docs: Swagger UI at `/api-docs`

## Prerequisites
Node.js 20+, npm, Docker Desktop (recommended).

## Run with Docker
1. Copy `backend/.env.example` to `backend/.env`.
2. From the project root run:
   ```bash
   docker compose up --build
   ```
3. Open frontend at http://localhost:5173
4. API at http://localhost:5000
5. Swagger at http://localhost:5000/api-docs

The database schema and sample data are initialized automatically on backend startup.

## Demo accounts
All demo accounts use password `Demo@12345`:
- admin@testmanager.com (admin)
- lead@testmanager.com (test-lead)
- tester@testmanager.com (tester)
- viewer@testmanager.com (read-only)

Change demo passwords and JWT_SECRET before public deployment.

## Local development without Docker
Start PostgreSQL and Redis, create a database named `test_management`, then:
```bash
cd backend && cp .env.example .env && npm install && npm run dev
```
In another terminal:
```bash
cd frontend && npm install && npm run dev
```

## Implemented
- Registration/login, JWT auth, protected API routes and role-based access
- Project listing and project creation
- Test case listing, creation, editing, deletion, search and filters
- Test suites and suite membership
- Test execution with Pass/Fail/Blocked/Skipped results
- Defect creation from test executions
- Dashboard summary and charts
- PostgreSQL schema with foreign keys and indexes
- Redis caching with TTLs and update invalidation
- Endpoint-specific rate limits
- Lazy-loaded frontend routes and memoized dashboard calculations
- Swagger UI and Docker Compose

## Notes / production hardening
This is an assignment-ready MVP foundation, not a certified production QA platform. Before public production use, add refresh-token rotation, email verification/password reset, malware scanning for uploads, object storage, stronger audit-event coverage, automated tests, CI/CD, and stricter project-membership enforcement. File attachments are represented in the schema/API metadata but binary storage is not configured by default.
