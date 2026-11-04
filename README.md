# Betten Imports applications

Source snapshot of the standalone Betten Hub and BettenAuto Inventory Desk, prepared October 28, 2026.

- `apps/betten-hub`: central application launcher, staff directory, permissions interface and messaging page.
- `apps/betten-auto`: inventory, pricing, appraisals, recon, key operations, workbook imports, messaging backend and vehicle research.

Each app is an independent Node.js project. Requires Node.js >=22.13.0. Run `npm run install:ci`, then `npm run dev` within the app directory. Production builds use `npm run build`. These applications use the Sites/Cloudflare runtime; local preview is not a replacement for production authentication, database bindings or secret provisioning.

## Data and configuration

This repository is a source backup, not a dealership database export. Runtime credentials, customer records, entered costs, notes, messages, appraisals, permission records and local databases are excluded. Public inventory seed files already present in the published source are included as dated snapshots, not current inventory guarantees. Historical collector code and comparison fixtures are retained for source completeness; current policy allows competitor comparisons strictly through the configured market provider on demand. Do not activate legacy public comparison collectors.

BettenAuto requires its production D1 binding and separately provisioned runtime credentials. Betten Hub uses `HUB_BRIDGE_SECRET` and `INVENTORY_SERVICE_TOKEN`; the backend must have the matching bridge secret. Never commit secret values. Existing hosting metadata refers to the original Sites projects; do not deploy to those projects without verifying the intended target and preserving sharing settings.

## Current behavior and limits

Hub includes shortcuts to BettenAuto, KeyTrack, vAuto, VinSolutions and Dealer.com. External applications keep their own sign-in. Messaging has department channels, participant-only direct messages and permission-checked vehicle/customer links; it is not end-to-end encrypted. Book values require manual entry or separately licensed data. CDK, vAuto and VinSolutions feeds have not been activated.

Market comparisons load on vehicle open within the configured free/evaluation allowance. Government VIN, model recall, EPA and dealership weather information use separate public services. Daily own-dealership inventory imports are configured externally; cloning this repository does not create or transfer schedules.

## Verification

At the last published feature release, 286 tests, type checking and production builds passed. See each app's documentation and tests for relevant checks. A fresh installation and environment configuration are required on a new machine.

## Source provenance

- Hub source commit: `b5c0255b2c295a8ab40cd9cc5a7020739c543c34`
- BettenAuto source commit: `6ac016c68ac37a69ea316a966c0ca8802d50077e`

The original deployment histories are intentionally excluded from this clean snapshot.

BettenAuto now opens natively within the Hub center panel, retaining Hub navigation and messaging. Its employee-bound server connection uses the original inventory database and route permissions. KeyTrack opens inside Hub under its owner-approved frame policy. vAuto also opens inside Hub after a normal Cox sign-in; VinSolutions and Dealer.com continue opening separately after compatibility testing.

Daily work release (November 4, 2026): Today, department work queues, vehicle readiness, message-to-task actions, separate Service/Detail and Administrator presets, operational reports, and provider-feed setup guidance. Work data remains in the existing Inventory Desk D1 database with employee-bound authorization and optimistic revisions. No provider feed or paid service is activated. See apps/betten-hub/docs/DAILY_WORK.md.

Hub release 13 fixes sidebar overflow on shorter windows and adds owner-only vAuto Excel cost/stock-date import review directly to Inventory connection. This remains a report snapshot; no automated vAuto session access or provider feed is implied.

Hub release 14 / BettenAuto release 29 add an owner-only, searchable KeyTrack Used Cars source-history view. Existing server projection keeps these settings records out of non-owner responses. History stays separate from current vehicle status; migration fills blanks and preserves entered records. Private migration snapshots and financial/customer data are excluded from this repository. Repair PDF and vehicle photo files require a separate export. Type checks, production builds, 11 authorization/bridge tests, local search/pagination and production import readback passed.
