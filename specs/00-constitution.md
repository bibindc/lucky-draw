# Constitution

## Purpose
Admin-operated lucky draw system: campaigns with scheduled draws, participants, manually recorded payments, prizes, fair random winner selection, and winner/prize tracking.

## Stack
- Frontend: React 18 + TypeScript, Vite, React Router, TanStack Query
- Backend: Node.js + Express + TypeScript, Zod validation, Prisma ORM
- Database: SQLite file for local development; Prisma provider can be changed for a hosted database deployment
- Tests: Vitest (frontend), Vitest/Jest + Supertest (backend)
- Auth: email + password for super admins and agents, JWT in httpOnly cookie, scrypt password hashing

## Principles
1. Specs first. Behavior changes start in `specs/`, then code.
2. Every acceptance criterion has an id (e.g. AC-PAR-3) and at least one automated test referencing it.
3. Money is stored as integer paise (₹300 = 30000). Never use floats.
4. Business rules live in the backend service layer, never only in the UI. The UI mirrors them for UX.
5. Draw execution is transactional and auditable: a draw runs once, its result is immutable.
6. Winner selection uses a cryptographically secure RNG (`crypto.randomInt`), and the eligible pool snapshot is stored with the result.
7. Role-based application: every API route except login and logout requires authentication; super-admin and agent permissions are enforced by the backend.
8. Payments are recorded manually by admins (no payment gateway). Every record keeps who recorded it and when.
9. Soft state over deletes for anything that affects history (payments, draws, winners).

## Conventions
- REST JSON API under `/api/v1`, consistent error shape `{ error: { code, message, details? } }`.
- Dates stored in UTC, displayed in Asia/Kolkata.
- Currency displayed as ₹ with Indian grouping (₹3,000).
- Small, focused commits; one task from `03-tasks.md` per PR.
