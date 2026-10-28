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

At the last published feature release, 271 tests, type checking and production builds passed. See each app's documentation and tests for relevant checks. A fresh installation and environment configuration are required on a new machine.

## Source provenance

- Hub source commit: `281077eda5ab0bb54e369af8577056fba341df5d`
- BettenAuto source commit: `9fcd5c8236e10c0af7cf4975083f420da348020d`

The original deployment histories are intentionally excluded from this clean snapshot.
