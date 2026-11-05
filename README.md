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

The separation release passed 17 permission, bridge and external-application tests, both type checks and production builds. Local browser checks confirmed the clean launcher, inventory-first workspace, absent tracker navigation and external-only KeyTrack link.

## Source provenance

- Hub source commit: `0d8df9900f4ca64e563f31bbeeef0fb3d547532d`
- BettenAuto source commit: `d43d30537bb8bd9ec36edbb3090f7c9e79b22f3b`

The original deployment histories are intentionally excluded from this clean snapshot.

BettenAuto opens natively inside Hub with the existing employee-bound inventory connection. Hub release 16 / BettenAuto release 31 remove the Key Board, checkout/return, tracker dashboards, imported KeyTrack history screens, work queues, readiness screens and their retired workflow API. KeyTrack is an external website shortcut only and is not embedded. VinSolutions and Dealer.com remain external; vAuto keeps its tested embedded flow.

Hub starts on a clean Applications page with messages, staff directory, customers and information. BettenAuto starts on Inventory, with fewer repeated row labels and no empty market placeholder column; pricing and comparisons remain inside the vehicle. Existing dealership database records and historical imports are retained unchanged for a possible future merge. No destructive schema migration, KeyTrack synchronization or paid provider activation is performed.

The November 5 vehicle tools release adds per-VIN research, financing estimates, factory build reports and a price-free dealer window sticker with a listing QR code. See the Inventory Desk operations guide for plan access and application spending limits.

The redesigned Inventory Desk gives staff a shorter vehicle menu and dedicated choices for the dealer QR sticker, original Monroney PDF, and VIN-specific factory build report.
