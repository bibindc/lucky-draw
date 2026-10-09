# Requirements

## Decisions already made
- D1. Payments are recorded manually by an admin (no online gateway).
- D2. A participant who wins is excluded from all later draws, and their remaining draw payments are waived.
- D3. If a participant paid for future draws before winning, those payments are NOT refunded. They are retained as non-refundable credit (see OQ-1).
- D4. The application is admin-only. Participants do not log in; "participant views" in the original stories are admin views of that participant.
- D5. Eligibility for a draw = payment status for that draw is `Paid` AND participant has not won an earlier draw. (Replaces the earlier wording "paid OR won a previous draw", which contradicted the exclusion rule.)
- D6. The application has `SUPER_ADMIN` and `AGENT` roles. Super admins manage agents and all campaign data. Agents can add and view only participants assigned to themselves; they cannot manage campaigns, draws, prizes, payments, or winners.
- D7. Every participant has a serial number from 1000 to 9999, unique across all campaigns; no two participants ever hold the same number. When adding a participant the form suggests the next number in sequence (skipping numbers already taken), and super admins and agents may type a different unused number instead, e.g. to match a pre-printed card. Super admins can change a serial number later; agents cannot.
- D8. Every agent has a generated, immutable unique agent ID (`AG-1000`, `AG-1001`, ...). Agents sign in with their email and password; the super admin sets the initial password when creating an agent.
- D9. A draw is conducted in one of two modes, chosen when it starts and applied to all its rounds: **Automatic** (the system picks each winner with a secure RNG) or **Manual** (each round is drawn offline, e.g. lots drawn at an event, and an admin records its winner). Both modes use the same eligibility, prize, waiver and immutability rules; only the way winners are chosen differs.
- D10. A draw is conducted one prize at a time. Each round draws exactly one winner for one prize unit chosen by the admin, so a draw with 5 prizes has 5 separate rounds. A draw completes only when all its rounds are drawn; it cannot be finished early.

## Glossary
- Campaign: one lucky draw programme (e.g. 5 months, 10 draws, ₹3,000 total).
- Draw: one scheduled event within a campaign.
- Participant: a person registered in a campaign.
- Draw payment: the ₹300 (per-draw amount) for one participant for one draw.

---

## US-1 Create and configure campaign
As an admin, I want to create a campaign with multiple scheduled draws, so that I can manage the whole draw period and its rules.

- AC-CAM-1: Admin can create a campaign with name, duration (months), number of draws, total participation amount, and per-draw amount.
- AC-CAM-2: Defaults for a standard campaign: 5 months, 10 draws, ₹3,000 total, ₹300 per draw.
- AC-CAM-3: Validation: total amount must equal draws × per-draw amount; number of draws ≥ 1; amounts > 0.
- AC-CAM-4: Admin sets date and time for each draw. Draw dates must be unique, in the future at creation, in chronological order by draw number, and within the campaign duration from the first draw date.
- AC-CAM-5: Admin sets the number of prizes (winners) for each draw (e.g. 5 or 10), minimum 1.
- AC-CAM-6: Admin can view all draws of a campaign with number, date/time, prize count and status (`Scheduled`, `In progress` with rounds drawn so far, `Completed`, `Cancelled`).
- AC-CAM-7: Structural settings (draw count, amounts) cannot be changed once any payment is recorded. For a `Scheduled` draw, an admin can open an edit form with its current date/time and prize count prefilled, save valid changes, or cancel without saving. Completed and cancelled draws have no edit action.
- AC-CAM-8: Invalid configurations are rejected with field-level error messages.
- AC-CAM-9: The create form proposes the draw schedule from a first draw date and time, spreading the draws evenly across the campaign duration in calendar months, all at the first draw's time of day. Draw *i* (counting from 0) falls at month offset *i* × months ÷ draws from the first draw; a fractional offset is that share of the following calendar month, rounded to whole days. Examples: 5 months and 5 draws gives one draw a month on the same day; 5 months and 10 draws gives two a month (about every 2 weeks); 2 months and 4 draws gives about every 15 days; 2 months and 10 draws gives about every 6 days. Changing the duration, number of draws or first draw rebuilds the dates and keeps prize counts already entered. The admin can still change any individual date before saving, subject to AC-CAM-4.

## US-2 Add participant
As an admin, I want to add users as participants, so that eligible users can be included in the draws.

- AC-PAR-1: An authorized user can open Participants → Add User. Super admins can choose an agent; agents are automatically assigned to the registering agent.
- AC-PAR-2: Fields: serial number (required, prefilled, see AC-PAR-23), name (required), email and/or mobile number (at least one required), user ID (optional), address (optional, see AC-PAR-25).
- AC-PAR-3: Required fields and formats are validated (email format, 10-digit Indian mobile).
- AC-PAR-4: The same user cannot be added twice to the same campaign (duplicate if same email, mobile, or user ID). A clear validation message is shown.
- AC-PAR-5: On success a participant record is created with status `Registered`, appears in the participant list, and a success message is shown.
- AC-PAR-6: Each participant gets one draw-payment row per draw, initially `Not Paid`.
- AC-PAR-7: Admin can cancel the form without saving.
- AC-PAR-8: Only authenticated admins can add participants.
- AC-PAR-9: Participant detail shows payment history and draw participation history.
- AC-PAR-10: Every participant has a serial number (D7). It is visible in participant lists, detail, PDFs and exports, and is unique across all campaigns.
- AC-PAR-11: Super admins can view participants across all agents and filter by agent. Agents can view only participants assigned to their own agent ID.
- AC-PAR-12: An authorized user can edit a participant's name, email, mobile, external user ID and address. A super admin can also change the serial number (AC-PAR-24). Campaign, payment history and draw history cannot be changed through participant edit.
- AC-PAR-13: Super admins can reassign a participant to an active agent. Agents can edit only their assigned participants and cannot change agent ownership.
- AC-PAR-14: Participant edits validate formats and prevent duplicate email, mobile, or external user ID within the same campaign, excluding the participant being edited.
- AC-PAR-15: An authorized user can download a participant PDF containing serial, campaign, assigned agent, contact details, address, status, draw/payment states, retained-credit flags, and payment transaction history. Dates use Asia/Kolkata and amounts use INR formatting.
- AC-PAR-16: Agents can export PDFs only for their own participants; direct API requests for another agent's participant remain forbidden.
- AC-PAR-17: From the participant list, an authorized user can export the selected campaign's participant list as Excel (`.xlsx`) or PDF.
- AC-PAR-18: The export contains every participant that matches the filters currently applied to the list (search text, status, and, for super admins, agent), not only the visible page. With no filters applied it contains every participant the user is allowed to see in that campaign.
- AC-PAR-19: Each exported row shows serial number, name, agent ID and name, email, mobile, external user ID, address, status, paid draws / total draws, waived draws, amount paid, and registration date. Dates use Asia/Kolkata and amounts use INR formatting (Excel stores amounts as numeric rupee values).
- AC-PAR-20: Every export identifies the campaign, the filters applied (or "All participants"), the number of records, and when it was generated. Rows are ordered by serial number.
- AC-PAR-21: Agent exports contain only participants assigned to that agent; the server enforces this and ignores any agent filter an agent supplies.
- AC-PAR-22: Export actions are disabled while the list is loading, while an export is in progress, or when no participants match the filters. An export failure shows an error message and leaves the list unchanged.
- AC-PAR-23: The Add participant form prefills the serial number with the next suggested number and lets the user change it. The serial number must be a whole number from 1000 to 9999 and unused by any participant in any campaign. A used number is rejected with "Serial number N is already used by another participant." and the form offers the next available number. If two people save the same number at the same time, only the first succeeds.
- AC-PAR-24: Only super admins can change an existing participant's serial number, with the same range and uniqueness rules (the participant's own current number is allowed). Agents see the serial number read-only when editing, and the server rejects a serial change from an agent.
- AC-PAR-25: Address is an optional free-text field of up to 500 characters that may span several lines. Leading and trailing spaces are trimmed and a blank address is stored as empty. It is shown in the participant list next to the name (AC-PAR-27), on participant detail, and in the participant PDF and list exports.
- AC-PAR-26: The suggested serial number is the next number in sequence after the last suggestion that was used, skipping any number already taken (for example by a manually entered number). Numbers freed by a serial change are not suggested again but can still be typed. When no number from 1000 to 9999 is free, there is no suggestion and the form says all serial numbers are in use.
- AC-PAR-27: The participant list shows, in order: serial number, name, address, agent (super admins only), contact, status, and paid draws. Contact shows the mobile number, or the email when there is no mobile; the participant detail heading follows the same order. The address appears beside the name on one line, shortened with "…" when long, with the full address shown on hover; a participant without an address shows "—". The list does not show the date a participant was added (it remains in exports and the participant PDF).
- AC-PAR-28: The participant search also matches the serial number: a search made only of digits finds the participant with exactly that serial, in addition to any name, email, mobile or user ID containing the text.
- AC-PAR-29: The list can be sorted by serial number or by name, ascending or descending, by selecting the column heading (selecting it again reverses the order). Name ties are ordered by serial number. Without a chosen sort the list shows the newest participants first, and a "Show newest first" action returns to that order. Sorting does not change export order (AC-PAR-20).
- AC-PAR-30: The list is paginated, 25 rows per page by default with 50 or 100 available. It shows the range and total (e.g. "Showing 26–50 of 501"), the current page and page count, and Previous/Next actions that are disabled at the first and last page. Changing the campaign, agent, status, search text, sort or page size returns to the first page.

## US-9 Manage agents
Specified in full in [`04-agent-module.md`](04-agent-module.md): acceptance criteria AC-AGT-1..17, permissions, lifecycle, API, screens and open questions OQ-AGT-1..7.

## US-3 Record payment for a draw
As an admin, I want to record the ₹300 a participant pays for a draw, so that the participant is eligible for it.

- AC-PAY-1: Admin sees a participant's upcoming draws and each draw's payment status.
- AC-PAY-2: Admin can record a ₹300 payment for one draw, with method (cash, UPI, bank transfer, other) and optional reference note.
- AC-PAY-3: Recording a payment creates a payment transaction and sets that draw payment to `Paid`.
- AC-PAY-4: A draw cannot be paid after it is `Completed`. A draw already `Paid` or `Waived` cannot be paid again.
- AC-PAY-5: Admin can void a payment recorded in error while the draw is `Scheduled`; the draw returns to `Not Paid` and the transaction is kept with status `Voided`. The participant detail screen does not offer a Void action; voiding is available only through the API (`POST /payments/:transactionId/void`).
- AC-PAY-6: A participant becomes `Eligible` once at least the next upcoming draw is `Paid`; `Payment Pending` otherwise.
- AC-PAY-7: Payment history lists every transaction (payment date, amount, draws covered, method, recorded by, status), latest payment date first. When a payment was entered on a later day than it was paid, the entry date is shown too.
- AC-PAY-8: Recording or requesting a payment takes a payment date: the day the money was received, as an India date. It defaults to today and may be any earlier day (an agent may collect the money and enter it later), but not a future day (`VALIDATION_ERROR`). An agent's requested date is kept when the request is approved, and the super admin may correct it while approving. The date is stored separately from when the payment was entered, which existing payments take as their payment date. It appears in payment history, on the participant PDF and in pending payment requests.

## US-4 Record advance payment
As an admin, I want to record payment for multiple future draws at once.

- AC-ADV-1: Admin selects number of draws N (1 to remaining unpaid draws); amount is auto-calculated as N × per-draw amount (e.g. 2 → ₹600, 5 → ₹1,500, 10 → ₹3,000).
- AC-ADV-2: Payment is allocated to the earliest unpaid `Scheduled` draws in order. Admin may instead pick specific draws.
- AC-ADV-3: One transaction is created and linked to all covered draws; each becomes `Paid`.
- AC-ADV-4: Admin can see which future draws are already paid.
- AC-ADV-5: N cannot exceed the number of unpaid, upcoming draws.

## US-5 Waive remaining payments after winning
As an admin, I want a winner's remaining payments waived automatically.

- AC-WAV-1: When a participant wins any draw, every later draw payment that is `Not Paid` becomes `Waived` automatically, in the same transaction as the draw result.
- AC-WAV-2: Later draw payments already `Paid` stay `Paid` and are flagged `Retained credit` (no refund, per D3). They are shown in the participant's history.
- AC-WAV-3: A winner cannot be recorded new payments for later draws.
- AC-WAV-4: Participant's remaining payment requirement shows ₹0 after a win.

## US-6 Conduct draw
As an admin, I want to conduct each scheduled draw one prize at a time, using only eligible participants, so that every prize gets its own moment and its own winner.

- AC-DRW-1: A draw can be started only on or after its scheduled date/time, only if `Scheduled`, and only once. The admin confirms before starting. Starting moves the draw to `In progress`.
- AC-DRW-2: Eligible pool = participants with that draw `Paid` and no win (D5). The pool is evaluated again for every round, so a winner from an earlier round of the same draw is never in a later round.
- AC-DRW-3: The draw has one round per winner. The number of rounds is fixed when the draw starts: min(configured prize count, eligible pool size, available prize units of this draw). The admin sees this number before confirming the start.
- AC-DRW-4: If the number of rounds is 0 (nobody eligible, or no prize stock), starting completes the draw at once with zero winners and a warning; the admin is told before confirming.
- AC-DRW-5: Before each round the admin chooses which prize is being drawn, from this draw's prizes that still have units. The screen suggests the lowest-ranked prize first (so the 1st prize is drawn last), and the admin can pick any available prize. The round's winner receives that prize and its available quantity drops by one.
- AC-DRW-6: A previous winner (from an earlier draw or an earlier round) is never in a later pool.
- AC-DRW-7: Each round is saved the moment it is drawn and is immutable: round number, prize, winner, eligible pool snapshot at that round, time drawn, and the admin who drew it. The draw also keeps the pool snapshot at start, when it started and who started it, and when it completed.
- AC-DRW-8: Each round is atomic and happens exactly once. A repeated or concurrent request for a round that has already been drawn is rejected with `ROUND_CONFLICT` and creates no second winner.
- AC-DRW-9: A draw cannot be finished early. It becomes `Completed` automatically when its last round is drawn. The admin can leave an in-progress draw and continue it later; the draw list shows progress (e.g. "Round 3 of 5").
- AC-DRW-10: While a draw is `In progress`, payments for it cannot be recorded or voided, its date/time and prize count cannot be edited, and its prizes cannot be added, moved away, deleted, or have name, rank or quantity changed (`DRAW_IN_PROGRESS`). Description and value can still be edited.
- AC-DRW-11: A round's winner effects happen in the same transaction as the round: participant status `Winner`, later unpaid draws waived and later paid draws flagged retained credit (AC-WAV-1, AC-WAV-2). When the last round of the campaign's final draw completes, non-winners become `Completed` (AC-WIN-4).
- AC-DRW-12: In an automatic round, after **Draw winner** the screen runs a lucky-draw spinner for at least 10 seconds: it cycles quickly through the serial numbers (with names) of the participants eligible for that round, slows down, and stops on the winner's serial before the winner is revealed. The spinner is presentation only: the server picks the winner with secure randomness when the round is requested, and the round is saved then (AC-DRW-7, AC-DRW-8), even if the screen is closed during the spin. The winner, round progress and winners list are not shown until the spinner stops, and the draw room cannot be closed while it spins. If the round fails (e.g. `ROUND_CONFLICT`), the spinner stops at once and the error is shown. Manual rounds have no spinner.

## US-11 Record a manual draw
As a super admin, when a draw is held manually (offline), I want to record each round's winner and how the draw was conducted, so that prizes and payment waivers are tracked exactly as for an automatic draw.

- AC-MDR-1: When starting a due draw, the admin chooses the mode: **Automatic** (the system draws each round) or **Manual** (each round is drawn offline and the admin records it). The mode applies to every round of that draw and cannot change after the draw starts.
- AC-MDR-2: Starting in Manual mode captures how the draw is held: date and time held (required; not before the scheduled time and not in the future), conducted by (required), draw method (required, e.g. "Lots drawn from a box"), venue, witnesses, notes, and an evidence reference such as a video link or register page (all optional).
- AC-MDR-3: In each manual round the admin chooses the prize being drawn and the participant who was drawn offline, from the current eligible pool (searchable by serial number, name, agent and contact). The server rejects anyone outside the pool with `INELIGIBLE_WINNER`, and a prize from another draw or without units with `PRIZE_UNAVAILABLE`.
- AC-MDR-4: Manual rounds follow the same rules as automatic rounds: one winner and one prize per round, rounds fixed at start, round conflict protection, effects in the same transaction, no early finish (AC-DRW-3, AC-DRW-5..11).
- AC-MDR-5: Each manual round shows the chosen prize and participant for confirmation before it is saved; once saved it is immutable.
- AC-MDR-6: Draw results and the draw list show the mode (`Automatic` or `Manual`). A manual result also shows when it was held, who conducted it, the method, venue, witnesses, notes and evidence reference. Every round shows who recorded it and when. The Winners list shows the mode for each winner's draw.

## US-7 Manage winners and winnings
- AC-WIN-1: Admin can view winners per draw and the prize each won.
- AC-WIN-2: Winner record stores participant, draw number, draw date, prize, winning status, and prize claim/delivery status (`Pending`, `Claimed`, `Delivered`).
- AC-WIN-3: Admin can update claim/delivery status with a timestamp and note.
- AC-WIN-4: A winning participant's status becomes `Winner`; after the final draw all participants who did not win become `Completed`.
- AC-WIN-5: Winners are excluded from future draws (see AC-DRW-6).
- AC-WIN-6: From the Winners screen, a super admin can export the selected campaign's winners list as Excel (`.xlsx`) or PDF.
- AC-WIN-7: The export contains every winner matching the filters currently applied (draw, claim status). With no filters it contains every winner in the campaign. Rows are ordered by draw number, then the order winners were drawn.
- AC-WIN-8: Each row shows draw number, date the draw was held, draw mode (Automatic/Manual), position drawn, participant serial number, winner name, agent, email, mobile, prize name, prize rank, prize value, claim/delivery status, claim last updated, and claim note. Dates use Asia/Kolkata and amounts use INR (Excel stores prize value as a numeric rupee amount; blank when the prize has no value).
- AC-WIN-9: Every export identifies the campaign, the filters applied (or "All winners"), the number of winners, totals per claim status, the total prize value, and when it was generated.
- AC-WIN-10: Export actions are disabled while the list is loading, while an export is in progress, or when no winners match. An export failure shows an error message and leaves the list unchanged.

## US-8 Add and manage prizes
- AC-PRZ-1: Admin can add a prize to a specific draw with name (required), description, value (optional), quantity (required, ≥ 1), and rank/category (required, e.g. 1st Prize).
- AC-PRZ-2: Admin can edit a prize before it is assigned to any winner; after assignment only description and value can change. An unassigned prize may be moved to another draw in the same campaign.
- AC-PRZ-3: Admin can delete a prize only if it has not been assigned.
- AC-PRZ-4: Saving without required fields is rejected with messages.
- AC-PRZ-5: Available quantity = total quantity − assigned for that prize in its draw. Updated on each assignment.
- AC-PRZ-6: Every draw has its own prize inventory; adding or assigning a prize to one draw does not change another draw's stock. The draw screen warns if that draw's available prizes are fewer than the winners to pick.
- AC-PRZ-7: Existing prizes without a draw assignment remain visible in an Unassigned view and are not eligible for any draw until an admin assigns each prize to a draw in its campaign.
- AC-PRZ-8: A super admin can upload one image per prize (JPG, PNG or WebP, up to 2 MB), replace it, or remove it. The file's contents must be a real image of an allowed type, whatever its name or declared type; anything else is rejected with a clear message.
- AC-PRZ-9: A prize image is cosmetic: it can be added, replaced or removed at any time, including after the prize has been assigned to a winner or while its draw is in progress (unlike name, rank and quantity, AC-PRZ-2, AC-DRW-10). Deleting a prize deletes its image.
- AC-PRZ-10: The prize list shows each prize's image as a thumbnail, or a placeholder when it has none. The prize form shows the current image with Upload/Replace and Remove actions, and a preview before saving.
- AC-PRZ-11: The draw room's winner reveal and the draw result show the image of the prize won when it has one.
- AC-PRZ-12: Prize images are served only to signed-in users, like the rest of the API.

## US-10 Campaign overview dashboard
As a super admin, I want an overview of the selected campaign built from live data, so that I can see progress and what needs attention without opening each screen.

- AC-DSH-1: Only a `SUPER_ADMIN` can open the Overview or call the dashboard endpoint. The overview defaults to the most recently created campaign and offers a campaign selector when several exist. With no campaigns it prompts the admin to create one.
- AC-DSH-2: The progress banner shows the campaign name, duration and draw count, completed draws out of total (excluding cancelled draws from "remaining"), percentage complete, and the first draw date.
- AC-DSH-3: Metric cards show, all computed by the server from stored records:
  - Participants: total, number added in the last 7 days, number of winners.
  - Next draw eligibility: eligible count for the next scheduled draw (D5), that count as a percentage of participants who have not won, and the number still unpaid for that draw.
  - Prize inventory: available units, assigned units and number of prizes across draw-assigned prizes; legacy unassigned prizes are counted separately.
  - Payments collected: total of `RECORDED` transactions (voided excluded), transaction count, amount still due for the next draw (unpaid non-winners × per-draw amount), and the share of payable draw payments that are paid.
- AC-DSH-4: Upcoming draws lists up to the next 3 `Scheduled` or `In progress` draws with draw number, date/time (Asia/Kolkata), prize count, eligible count, and a status: `In progress` (with round progress) for a started draw, `Ready` once the scheduled time has passed, otherwise `Today`, `Tomorrow` or `In N days`.
- AC-DSH-5: A next-draw card shows the next scheduled draw's date, time, eligible count, prize count and days left, with a link to the Draws screen. When no draw is scheduled it says all draws are complete.
- AC-DSH-6: Recent activity shows the 6 latest events across the campaign (participant added, payment recorded, payment voided, winner drawn, prize claim updated), newest first, with relative time and amount where relevant.
- AC-DSH-7: The greeting follows the Asia/Kolkata time of day, and the top bar shows today's date in Asia/Kolkata. Overview actions navigate to the matching screen (Add participant → Participants, draw links → Draws). The Overview shows loading and error states and never shows placeholder figures.

## US-12 Sign in and sign out
As a super admin or agent, I want to sign out when I finish, so that nobody else using this device can act as me or see my data.

- AC-AUTH-1: Super admins and agents sign in on one form with email and password. Wrong email, wrong password and deactivated accounts get the same message. A session lasts 8 hours. (Full rules: `04-agent-module.md` §6, sign-in rules.)
- AC-AUTH-2: Every signed-in screen shows a clearly labelled **Sign out** control in the sidebar, for both roles. On narrow screens where the sidebar collapses to icons it stays visible as an icon with the accessible name "Sign out". On short windows the menu scrolls while the profile and Sign out stay pinned at the bottom, so Sign out is never cut off.
- AC-AUTH-3: Signing out ends the session on the server (the session cookie is cleared) and returns to the sign-in screen with the message "You have been signed out."
- AC-AUTH-4: Signing out clears all data the app has loaded in the browser, so the next person who signs in on that device never sees the previous user's records, even briefly.
- AC-AUTH-5: Signing out works even if the session has already expired. If the server cannot be reached, the user stays signed in and sees an error, because their session would otherwise remain valid.
- AC-AUTH-6: While signing out, the control is disabled and shows "Signing out…".
- AC-AUTH-7: If the session expires or is revoked while the app is open (e.g. 8 hours pass, or an agent is deactivated), the next request that is refused as unauthenticated clears loaded data and returns to the sign-in screen with "Your session has ended. Please sign in again."

## US-13 Complimentary prizes
Specified in full in [`05-complimentary-module.md`](05-complimentary-module.md): participants who paid every draw and did not win choose a complimentary prize (AC-CMP-1..10).

## US-14 Agent changes need approval
Specified in full in [`06-agent-approvals-module.md`](06-agent-approvals-module.md): every change an agent makes (adding or editing participants, payments, prize claims, complimentary prizes) is a request a super admin approves, edits or rejects (AC-APR-1..10).

## US-15 Public showcase website
Specified in full in [`07-public-website.md`](07-public-website.md): a public website, without sign-in, showcasing one featured campaign — next draw with countdown, prizes, complimentary gifts, recent winners (first name and initial), past results, how it works and contact details — managed by super admins (AC-PUB-1..14).

## Status models
- Participant: `Registered → Payment Pending → Eligible → Winner → Completed`
- Draw payment (per participant per draw): `Not Paid → Paid → Waived`
- Draw: `Scheduled → In progress → Completed` (or `Cancelled`); an in-progress draw advances one round at a time
- Prize claim: `Pending → Claimed → Delivered`
- Approval request: `Pending → Approved | Rejected | Withdrawn` (see `06-agent-approvals-module.md`)
- Complimentary choice: `Chosen → Delivered`, or `Chosen → Cancelled` by the system (see `05-complimentary-module.md`)

## Open questions (resolve before building the relevant task)
- OQ-1. What can the retained credit be used for (nothing, transfer to another campaign, transfer to another person)? Default in spec: recorded only, no further use.
- OQ-2. ~~If prizes run out mid-draw, run with fewer winners or block the draw?~~ Resolved by D10: the number of rounds is fixed when the draw starts and prize stock is locked while it runs.
- OQ-3. Is the 5-month duration enforced against draw dates, or informational only? Spec default: enforced.
- OQ-4. Can an admin add participants after the campaign has started? Spec default: yes; earlier completed draws are marked `Not Paid` and not payable.
- OQ-6. Can a manual draw be recorded as held before its scheduled time (e.g. the event started early)? Spec default: no, held time must be at or after the scheduled time.
- OQ-7. Should a recorded draw result (either mode) ever be correctable, e.g. a wrong winner entered for a manual draw? Spec default: no; results are immutable (Constitution principle 5). A correction process would need its own audited "void result" feature.
- OQ-5. Single campaign at a time, or several? Spec default: model supports several, UI works on one selected campaign.
