# Daily dealership work — release 12

Today is the Hub landing page. Work queues link tasks to current inventory and optional customer records; employees with Operations edit may create and manage tasks in their assigned department. Owners and users with Operations edit plus Reports edit manage all queues. Assignment must be to an active employee in that department (the owner may also be assigned). Others can read only their department or personally assigned tasks. Completed and cancelled tasks remain available through the All filter. Status changes retain timestamps and account history.

Vehicle readiness is a staff-confirmed checklist, separate from public inventory observation dates. Unknown checks cannot produce Ready. Existing stop-sale, sale-pending, sold/wholesale, keys-out or needs-fuel flags override a completed checklist. Checking a box does not change those underlying records, website prices or vendor data. Staff checklists and tasks live in hub_work in the existing Inventory Desk D1 database, with atomic revision-checked saves and audit entries. Existing vehicle costs, dates, messages and other records are not migrated or replaced.

Team and department messages offer Create task when the user has Operations edit. The task draft uses a generic title and references the message without copying its body. Department tasks must stay in their source department. Private direct messages are excluded from this conversion. Discuss task opens the department conversation with an editable draft and vehicle attachment; it does not send automatically. Customer references require Customers access.

Role presets now include Sales, Service, Detail, Manager and Administrator. Presets change only the unsaved form; the owner must save each employee's access. Administrator is a module preset, not Site ownership: user management, full backups and destructive actions retain owner restrictions. No existing employee is automatically granted new Operations edit permission.

Reports use recorded task completion durations and existing stock dates/recon actuals. Completion duration is elapsed creation-to-completion, including waiting. Missing dates/costs are excluded, financial totals require Financials access, and historical charts are not manufactured. Work reports reflect the viewer's allowed task scope. Inventory connection provides official provider links and a copyable read-only feed request. No external API/feed is activated and no provider has been contacted.

Validation: backend permission, revision, assignment, source-message boundaries, checklist blocker and reporting tests; complete existing backend suite; Hub tests, type checks and production builds. Local browser QA uses an ignored synthetic-data proxy, never production messages or checklist writes.

## KeyTrack used-car migration

KeyTrack records is a separate owner-only Hub view. BettenAuto’s daily key and connection screens omit the source-history table. It reads the same Inventory Desk settings records through the existing authenticated workspace bridge. Server projection excludes all settings records for non-owners, even when they have Connections access. Source snapshots contain business and customer information and must never be committed to the public source repository.

The one-time Used Cars migration verifies unique VINs against visible vehicle forms and source rows, adds missing vehicle identities as a partial own-inventory import, and fills only blank operating fields. Existing values, including financials, dispositions and false/zero values, remain unchanged. Conflicting values are retained in a separate owner-only review category. A partial migration does not replace the complete website snapshot or promise ongoing KeyTrack synchronization. Future complete website captures can archive KeyTrack-only vehicles without deleting their records.

Historical sales without VINs remain a separate searchable source table; they do not create guessed vehicle/customer links. Historical key events preserve original displayed dates without inferring years or timezones. Repair-order listings retain source numbers, dates and displayed amounts; original PDF documents and vehicle photo files require a separate file export. Imported staff labels do not create accounts or grant permissions. The signed-in source messaging view showed no messages; no messages were fabricated or sent.


## Key Board refresh

Keys & Operations now opens on a two-column Keys In / Keys Out board with a quick VIN/stock scanner, purpose presets and short confirmation dialogs. Checkout requires an exact unique active VIN or stock number and a key confirmed In; partial matches, ambiguous stocks, sold vehicles, already checked-out, lost and unknown keys are rejected. Check-in explicitly confirms physical return. Lost and unrecorded keys remain in Needs attention. Existing revision-checked saves and key permissions remain authoritative; financial and other unrelated fields are preserved. Operations overview, detailed management and Sales remain available.

The large KeyTrack source-history table was removed from the bottom of BettenAuto. Imported history remains stored and available on the separate owner-only KeyTrack records page in Hub. No records are deleted.


## Current separation: KeyTrack remains external

Key Board, key checkout/return, tracker dashboards and the KeyTrack source-history screens have been removed from BettenAuto and Hub. Hub starts on Applications with messages, staff, customers and information. KeyTrack is an external website shortcut only; framing it is disabled. Tracker-style work queues/readiness/report screens and message-to-task actions are no longer exposed. Vehicle details omit the tracker lot-location field. Existing database and historical source records are retained without modification for a possible future merge. No ongoing KeyTrack sync is enabled, and no data is written to KeyTrack.

The retired tracker/workflow API is also removed from the Hub gateway. Legacy database tables and stored permission grants remain intact; no destructive schema migration or record deletion is performed. Inventory rows omit repeated helper labels and the empty market placeholder column; live market pricing remains in vehicle details.
