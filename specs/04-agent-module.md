# Agent Module

The single source of truth for agent accounts, agent sign-in, and agent-scoped access. Other specs refer here instead of repeating these rules. Decisions D6 and D8 in `01-requirements.md` remain the founding decisions; this document refines them.

Status key used below: **Built** (implemented and should have tests), **Proposed** (agreed direction, not yet implemented), **Open** (needs a decision before building).

---

## 1. Purpose and scope

Agents are field staff who register participants on behalf of the organiser. Every participant is owned by exactly one agent, so registrations can be attributed and each agent sees only their own people.

In scope:
- Agent accounts: creation, profile edits, activation state, generated agent IDs.
- Agent sign-in and session rules.
- What an agent can and cannot do, enforced by the server.
- Participant ownership by agents (assignment, reassignment, scoping).

Out of scope (see §11 Open questions): commissions, payment collection by agents, agent performance reporting.

## 2. Glossary

| Term | Meaning |
|---|---|
| Agent | A person with an `AGENT` login who registers participants. |
| Agent ID | Human-readable, permanent identifier, e.g. `AG-1000`. Stored as `agentCode`. Distinct from the internal UUID `id`. |
| Assigned agent | The agent that owns a participant (`Participant.agentId`). |
| Active / Deactivated | Agent account state. Only active agents can sign in or be assigned new participants. |

## 3. Roles and permissions

Every rule in this table is enforced by the API. The UI hides actions to match, but the UI is never the authorization boundary.

| Capability | Super admin | Agent | Status |
|---|---|---|---|
| Open the Agents menu; list, search, create, edit, activate or deactivate agents | Yes | No (403) | Built |
| See the Overview, Campaigns, Draws, Prizes, Winners screens and their APIs | Yes | No (403) | Built |
| List campaigns (names, to pick one when registering) | Yes | Yes | Built |
| Add a participant | Yes, must choose an active agent | Request for approval; assigned to self once approved | Built — by approval request (`06-agent-approvals-module.md`) |
| Choose the serial number when adding (prefilled suggestion, editable) | Yes | Yes, in the request | Built (AC-PAR-23) |
| List, search, filter participants | All agents' participants, optional agent filter | Own participants only; agent filter ignored | Built |
| View participant detail (draw and payment history, read-only) | Any participant | Own participants only; others return 404 | Built |
| Edit participant contact details and address | Any participant | Request for approval, own participants only | Built — by approval request (`06-agent-approvals-module.md`) |
| Change an existing participant's serial number | Yes | No (403) | Built (AC-PAR-24) |
| Reassign a participant to another agent | Yes, to an active agent only | No (403) | Built |
| Export participant list (Excel/PDF) and single-participant PDF | Any participants | Own participants only | Built |
| Record payments | Yes | Request for approval, own participants only | Built — by approval request (`06-agent-approvals-module.md`) |
| Void payments | API only (AC-PAY-5) | No (403) | Built |
| Update a winner's prize claim/delivery status | Yes | Request for approval, own participants only | Built — by approval request (`06-agent-approvals-module.md`) |
| Manage complimentary prize options | Yes | No (403) | Built (AC-CMP-1) |
| Record a complimentary choice and mark it delivered | Any participant | Request for approval, own participants only | Built — by approval request (`06-agent-approvals-module.md`) |
| Review, edit, approve or reject agents' requests | Yes | No (403); agents see and withdraw their own | Built — by approval request (`06-agent-approvals-module.md`) |
| Reset an agent's password | Yes | No | Proposed (AC-AGT-14) |
| Change own password | Yes | Yes | Proposed (AC-AGT-15) |

## 4. Data model

`Agent` (see `backend/prisma/schema.prisma`):

| Field | Rules |
|---|---|
| `id` | UUID, internal. |
| `agentCode` | Unique. Generated as `AG-` + the next value of the global `agent-code` sequence, starting at 1000, padded to at least 4 digits. Never changes and never reused. |
| `name` | Required, trimmed, non-empty. |
| `email` | Required, stored lower-case, unique among agents **and** must not match any super-admin email (it is the sign-in identity). |
| `mobile` | Required, 10-digit Indian mobile (`^[6-9]\d{9}$`), unique among agents. |
| `passwordHash` | scrypt hash. Initial password set by a super admin, minimum 12 characters. Never returned by any API. |
| `isActive` | Defaults to `true`. |
| `createdAt`, `updatedAt` | Set by the database. |

Relationships and counters:
- `Participant.agentId` → `Agent.id`. Delete is restricted, so an agent who owns participants cannot be removed from the database.
- `SequenceCounter` row `agent-code` is incremented in the same transaction that creates the agent. A failed creation may still consume a number; gaps are acceptable, reuse is not.

Proposed fields (not yet in the schema):
- `passwordChangedAt DateTime?` for session revocation after a password change (AC-AGT-14/15).
- `createdByAdminId`, `statusChangedByAdminId`, `statusChangedAt` for the audit trail (AC-AGT-17).

## 5. Agent lifecycle

```
            create (super admin)
                   │
                   ▼
   ┌──────────►  ACTIVE  ──── deactivate ────►  DEACTIVATED
   │                                                │
   └──────────────────── activate ──────────────────┘
```

- There is no delete. Agents are only ever deactivated, whether or not they have participants (Constitution principle 9: keep history).
- Deactivation takes effect immediately: the next request carrying that agent's session is rejected with 401, and sign-in is refused.
- Deactivation does not change participant ownership. The agent's participants stay visible to super admins, labelled with the deactivated agent, and a super admin can reassign them one by one.
- A deactivated agent cannot be chosen when adding or reassigning participants.
- Reactivation restores sign-in with the existing password and the same agent ID.

## 6. Requirements

### US-9 Manage agents
As a super admin, I want to create and manage agents so participant registrations can be attributed and scoped to an agent.

| ID | Acceptance criterion | Status |
|---|---|---|
| AC-AGT-1 | Only a `SUPER_ADMIN` can open the Agents menu or call agent-management endpoints. | Built |
| AC-AGT-2 | A super admin can create an agent with a generated unique agent ID, name, 10-digit Indian mobile number, email, and initial password (minimum 12 characters). | Built |
| AC-AGT-3 | Agent IDs are globally unique, sequential, start at `AG-1000`, and are never reused. | Built |
| AC-AGT-4 | Agent email and mobile are required and unique. Invalid or duplicate details are rejected with field-level errors (`VALIDATION_ERROR`) or `DUPLICATE_AGENT`. | Built |
| AC-AGT-5 | A super admin can list and search agents, edit name, mobile and email, and activate or deactivate an agent. Agent ID is immutable. Agents are never deleted, only deactivated. | Built (clarified: no deletion) |
| AC-AGT-6 | Active agents can sign in and register participants assigned to themselves. Deactivated agents cannot sign in or add participants. | Built |
| AC-AGT-7 | The participant form shows an agent selector (active agents only) to super admins and a read-only current agent identity to agents. | Built |
| AC-AGT-8 | Agents cannot assign a participant to another agent or read another agent's participant records, even by calling the API directly. | Built |
| AC-AGT-9 | Deactivating an agent ends their existing sessions: the next API request with that session returns 401. | Built |
| AC-AGT-10 | An agent's email cannot match a super admin's email, on create or edit. | Built |
| AC-AGT-11 | The agent list shows agent ID, name, email, mobile, number of assigned participants (all campaigns) and status, sorted by agent ID. Search matches agent ID, name, email or mobile. | Built |
| AC-AGT-12 | An agent signed in sees only the Participants menu. They can pick any campaign, and see read-only draw and payment history for their own participants, but no payment actions. | Built |
| AC-AGT-13 | Deactivating an agent keeps their participants assigned to them. Super admins still see those participants and can reassign each one to an active agent. | Built |
| AC-AGT-14 | A super admin can set a new password (minimum 12 characters) for any agent. Existing sessions for that agent end immediately. | Proposed |
| AC-AGT-15 | A signed-in user can change their own password by giving the current password and a new one (minimum 12 characters). Their other sessions end; the current one continues. | Proposed |
| AC-AGT-16 | Deactivating an agent asks for confirmation and shows how many participants they own. Activating needs no confirmation. | Proposed |
| AC-AGT-17 | The system records which super admin created each agent and who last changed its active state, with timestamps, and shows them on the agent row. | Proposed |

Related participant criteria owned by US-2 (unchanged, listed for traceability): AC-PAR-1, AC-PAR-11, AC-PAR-13, AC-PAR-16, AC-PAR-21.

### Sign-in rules (apply to agents and super admins)
- One login form for both roles. Email is matched case-insensitively.
- Wrong email, wrong password and deactivated account all return the same `401` "Email or password is incorrect." so the response never reveals which accounts exist. A password check runs even when the email is unknown, to keep response times similar.
- The session is an HMAC-signed token in an httpOnly, `SameSite=Strict` cookie scoped to `/api/v1`, valid for 8 hours. It carries the account id and role.
- Every authenticated request re-reads the agent and rejects it if missing or inactive.

## 7. API

All under `/api/v1`, all require a session. Error shape: `{ error: { code, message, details? } }`.

| Method | Path | Who | Request | Success | Errors | Status |
|---|---|---|---|---|---|---|
| GET | `/agents?search=` | Super admin | `search` optional | `200 { agents: Agent[] }`, each with `_count.participants` | 401, 403 | Built |
| POST | `/agents` | Super admin | `{ name, email, mobile, password }` | `201 { agent }` (no password hash) | 400 `VALIDATION_ERROR`, 409 `DUPLICATE_AGENT` | Built |
| PATCH | `/agents/:id` | Super admin | Any of `{ name, email, mobile, isActive }`, at least one | `200 { agent }` | 400, 404 `NOT_FOUND`, 409 `DUPLICATE_AGENT` | Built |
| POST | `/agents/:id/password` | Super admin | `{ password }` | `204` | 400, 404 | Proposed (AC-AGT-14) |
| POST | `/auth/password` | Any signed-in user | `{ currentPassword, newPassword }` | `204`, session cookie re-issued | 400, 401 | Proposed (AC-AGT-15) |
| POST | `/auth/login` | Anyone | `{ email, password }` | `200 { admin: { id, name, email, role, agentCode? } }` + cookie | 400, 401 | Built |
| GET | `/auth/me` | Signed in | – | `200 { admin }` with `role` and, for agents, `agentCode` | 401 | Built |
| POST | `/auth/logout` | Anyone | – | `204`, session cookie cleared (also when the session is already missing or expired) | – | Built (AC-AUTH-3, AC-AUTH-5) |

Agent scoping on participant endpoints (server-side, always):
- `GET /campaigns/:id/participants` and `/export`: `agentId` forced to the signed-in agent.
- `GET /participants/:id`: lookup includes `agentId = signed-in agent`, so another agent's participant is a 404 (not 403, to avoid confirming it exists).
- `PATCH /participants/:id`: 404 for another agent's participant; 403 if an agent sends a different `agentId`.
- `POST /campaigns/:id/participants`: `agentId` forced to self; a different `agentId` is 403.

Session revocation design (for AC-AGT-14/15): set `Agent.passwordChangedAt` (and the same field on `Admin`) when a password changes; `requireAuth` rejects tokens whose `iat` is earlier than `passwordChangedAt`. The password-change endpoint issues a fresh cookie for the current session.

## 8. Screens

**Agents (super admin only)**
- Header with "Add agent". Search box (agent ID, name, email, mobile).
- Table: Agent ID, Name, Contact (email and mobile), Participants, Status, Actions (Edit, Activate/Deactivate).
- Create form: Name, Email, Mobile, Initial password. The agent ID is shown after creation only.
- Edit form: Name, Email, Mobile; states that the agent ID is permanent. No password field (password reset is a separate action, AC-AGT-14).
- States: loading, error, empty ("No agents yet" / "No matching agents"), success notice after save.
- Proposed: confirmation dialog on Deactivate with participant count (AC-AGT-16); "Reset password" action (AC-AGT-14); created-by and status-changed details (AC-AGT-17).

**Agent experience**
- Sidebar shows only Participants; the profile card shows the agent's name, role "Agent" and agent ID, with a **Sign out** button below it (AC-AUTH-2).
- Add participant: agent field is read-only and shows the signed-in agent ID.
- Participant list: no agent column and no agent filter.
- Participant detail: draw and payment history visible; no "Record payment" or "Void" actions.
- Proposed: "Change password" in the profile menu (AC-AGT-15).

## 9. Error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Field rules fail; `details` lists the fields. |
| `DUPLICATE_AGENT` | 409 | Email or mobile already used by another agent, or email used by a super admin. |
| `NOT_FOUND` | 404 | Unknown agent id; or an agent asking for another agent's participant. |
| `FORBIDDEN` | 403 | Agent calling a super-admin-only route, or trying to assign/reassign ownership. |
| `UNAUTHORIZED` | 401 | No session, expired or revoked session, deactivated agent, bad credentials. |

## 10. Gaps found while writing this spec

Code and specs disagree, or something is missing. Each needs a task or a spec change.

| # | Gap | Recommendation |
|---|---|---|
| G1 | `02-design.md` says the super admin's `agentId` is optional when adding a participant, but the API requires it. | Keep it required (every participant has an owner) and fix the design row. Needs your confirmation: OQ-AGT-1. |
| G2 | No test names an `AC-AGT-*` id (Constitution principle 2). The backend agent controller (ID allocation, duplicate checks, edit, activate) is untested apart from input validation. | Add controller and integration tests per §12 (T20). |
| G3 | `DUPLICATE_AGENT`, `FORBIDDEN` and `NOT_FOUND` are used but missing from the error list in `02-design.md`. | Fix the design error list (done with this spec). |
| G4 | Participant detail returns the recording super admin's email to agents (`paymentTransactions.recordedByAdmin.email`). | Return only the name to agents (T21). |
| G5 | The seed script does not check whether the admin email already belongs to an agent; if both exist, login signs in as the admin. | Seed should refuse an email already used by an agent (T21). |
| G6 | AC-AGT-5 originally implied agents without history could be deleted; no delete exists. | Clarified above: no deletion. |
| G7 | The agent list has no pagination. | Acceptable at current scale; revisit above ~500 agents. |
| G8 | No limit on repeated failed sign-ins. | Decision needed: OQ-AGT-5. |
| G9 | **Fixed.** Agents were blocked (403) from every participant route in the running app: the prize, payment and winner routers are mounted on `/api/v1` and applied the super-admin guard to all requests passing through them, before the participant router. Controller-level tests did not exercise routing, so it went unnoticed. | Guards are now per route, and `backend/tests/routing.test.ts` checks agent access through the real router. |

## 11. Open questions

- **OQ-AGT-1** Must a super admin always pick an agent when adding a participant? Recommended: yes (current behaviour).
- **OQ-AGT-2** Should agents be able to record payments they collect in the field? Today they cannot (D6). If yes, payments would need to record "collected by agent" and super admins might need to approve them.
- **OQ-AGT-3** When an agent is deactivated, should a super admin be offered a bulk "reassign all participants to…" action? Recommended: yes, as a follow-up.
- **OQ-AGT-4** Should agents be forced to change the initial password on first sign-in? Depends on AC-AGT-15.
- **OQ-AGT-5** Should sign-in lock or slow down after repeated failures (for example 5 failures in 15 minutes)?
- **OQ-AGT-6** Are agent commissions or per-agent collection reports needed? Out of scope until decided.
- **OQ-AGT-7** Should agents see campaign details (draw dates, per-draw amount) to answer participants' questions? Today they see campaign names only.

## 12. Test plan and traceability

| Criterion | Existing tests | Missing |
|---|---|---|
| AC-AGT-1 | `backend/tests/auth.test.ts` (agent gets 403 on `/agents`) | Name the AC id in the test |
| AC-AGT-2, 3 | `frontend/src/pages/agents/AgentsPage.test.tsx` (create shows ID); `backend/tests/agent.validator.test.ts` | Backend: ID allocation from `agent-code`, `AG-1000` then `AG-1001`, no reuse after failure |
| AC-AGT-4, 10 | Validator tests | Backend: duplicate email, duplicate mobile, email used by super admin → 409 |
| AC-AGT-5 | `AgentsPage.test.tsx` (deactivate) | Backend: edit fields, `agentCode` cannot be changed (unknown field ignored or rejected) |
| AC-AGT-6, 9 | `auth.test.ts` (active login; deactivated token rejected) | Deactivated agent login → 401 |
| AC-AGT-7 | `ParticipantsPage.test.tsx` (super admin selector) | Agent sees read-only agent field |
| AC-AGT-8, AC-PAR-21 | `backend/tests/participant.controller.test.ts` | Detail and edit of another agent's participant → 404 |
| AC-AGT-11 | – | List search fields and sort order |
| AC-AGT-12 | – | Agent sidebar shows Participants only; no payment actions in detail |
| AC-AGT-13 | – | Deactivated agent's participants still listed for super admin; reassignment to inactive agent rejected |
| AC-AGT-14..17 | – | Write with the feature |

## 13. Tasks

Added to `03-tasks.md`:
- T20 Agent test coverage: backend controller and integration tests for AC-AGT-1..13, AC ids in test names. (G2)
- T21 Agent data hygiene: hide admin email from agents in participant detail; seed refuses agent emails. (G4, G5)
- T22 Password management: super-admin reset and self-service change with session revocation. (AC-AGT-14, 15) Blocked by OQ-AGT-4.
- T23 Agent admin safeguards: deactivation confirmation and audit fields. (AC-AGT-16, 17)
