# Lucky Draw System

Admin web app to manage lucky draw campaigns, participants, payments, prizes, draws and winners.

- Frontend: React + TypeScript (Vite)
- Backend: Node.js + Express + TypeScript
- Database: SQLite for local development (Prisma ORM; no Docker required)
- Approach: Spec-Driven Development (specs are the source of truth, code follows)

## Repository layout (planned)

```
lucky-draw/
  specs/
    00-constitution.md      Principles, stack, conventions
    01-requirements.md      User stories, acceptance criteria, business rules
    02-design.md            Architecture, data model, API contract, UI screens
    03-tasks.md             Ordered, testable implementation tasks
    04-agent-module.md      Agent accounts, sign-in, permissions and scoping
    05-complimentary-module.md  Complimentary prizes for fully paid non-winners
    06-agent-approvals-module.md  Agent changes as requests a super admin approves
    07-public-website.md    Public showcase website for one featured campaign
  backend/                  Express API (created in task T1)
  frontend/                 React admin app (created in task T1)
  site/                     Public showcase website (task T36)
```

## Spec-driven workflow

1. Read `specs/01-requirements.md` and resolve every item under "Open questions".
2. Review `specs/02-design.md`. Change the spec first if the design should change.
3. Implement `specs/03-tasks.md` one task at a time, in order.
4. Each task lists the acceptance criteria (AC ids) it must satisfy; write tests for those first.
5. If code and spec disagree, update the spec in the same commit.

## Run locally

Prerequisites: Node.js 20 or newer and npm.

1. Install dependencies from the repository root:

  ```powershell
  npm install
  ```

2. Create the backend environment file and set a unique JWT secret and admin password:

  ```powershell
  Copy-Item backend/.env.example backend/.env
  ```

  `DATABASE_URL` should be `file:../dev.db` for the local SQLite file at the repository root. If `backend/.env` already exists from a PostgreSQL setup, update that variable. Set `JWT_SECRET` to at least 32 characters and `ADMIN_PASSWORD` to at least 12 characters.

3. Generate the Prisma client, apply the migration, and seed the administrator:

  ```powershell
  npm run prisma:generate --workspace backend
  npm run prisma:migrate --workspace backend
  npm run prisma:seed --workspace backend
  ```

4. Start the API, admin app and public website together:

  ```powershell
  npm run dev
  ```

  Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env`. Use **Sign out** at the bottom of the sidebar to end the session; sessions also end automatically after 8 hours.

  The public website runs at `http://localhost:5180` (set its API address in `site/.env`, see `site/.env.example`). It shows nothing until a super admin picks a featured campaign under **Public website** in the admin app.

  Run `npm run dev` only once: a second copy cannot use the same ports and its web app moves to another port that the API does not accept.

The seeded account is a super admin. Use the **Agents** menu to create and activate agent accounts. Agents sign in with their own email/password and can only register or view participants assigned to themselves. Participant serial numbers start at `1000` and increase globally across campaigns.

## Deploying

To host the admin app, API and public website for free on Render with a Neon PostgreSQL database, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Local development keeps using SQLite.

## Project commands

```powershell
npm run build
npm test
npm run lint
```

The API health endpoint is `http://localhost:<PORT>/api/v1/health` (`PORT` defaults to `4000`). Docker is not needed for local development.
