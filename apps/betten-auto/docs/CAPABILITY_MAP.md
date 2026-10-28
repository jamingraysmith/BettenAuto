# Betten Imports inventory operating system — capability map

Research date: October 20, 2026. This is an independent workflow specification based on public product descriptions. It does not establish feature parity with the customer's particular vAuto contract, licensed datasets, or private integrations.

## What the reference suite covers

vAuto's public Provision description covers stocking, appraisals, pricing, merchandising, multi-store inventory, wholesale tracking and consumer offer reports. It also describes integrations for vehicle/service history and financing-oriented vehicle matching. [Provision](https://www.vauto.com/products/provision/)

ProfitTime GPS adds acquisition and pricing guidance informed by market signals and a dealership's strategy. Its scores, model and demand feeds are proprietary. [ProfitTime GPS](https://www.vauto.com/products/profittime-gps/)

iRecon describes vehicle task plans, assignments, approvals, approval elapsed time, workflow templates and last scanned location. [iRecon](https://www.vauto.com/products/irecon/)

Stockwave adds wholesale search, saved searches, market signals and auction access, including online bidding. [Stockwave](https://www.vauto.com/products/stockwave/)

Conquest addresses new vehicle pricing, group performance, dealer trades, rebates/incentives and merchandising. [Conquest](https://www.vauto.com/products/conquest/)

## Workflow and data boundary

| Daily workflow | Independently implementable now | Additional data/access for full operation |
|---|---|---|
| Inventory desk | Import public listings; normalize VIN/stock; identify duplicates; search/filter/sort; detail drawer; export; freshness and error report. | DMS/feed for cost, acquisition date, sale date, title status, floorplan and availability. A removed web listing is unconfirmed absence, not proof of sale. |
| Pricing desk | Enter cost and recon; save proposed retail prices; review margin and carrying expense; manual comparable vehicles; explicit approved/pending state; audit log. | Licensed broad comparable listings, adjustment methodology and permissioned feed/DMS writeback. Website ask prices alone cannot reveal sold prices. |
| Appraisal | VIN entry/validation; manual condition checklist, photos, cost worksheet, maximum offer and branded printable offer. | VIN decoder, authenticated vehicle history, guidebook values, auction results and service history. Do not label an internally calculated offer an external book value. |
| Reconditioning | Per-VIN staged board; line-item tasks, owner, estimate, actual, due date, approval and completion timestamps; notes and status history. | Service DMS and vendor interfaces; actual location requires explicit scan/device telemetry. A typed location is not GPS tracking. |
| Merchandising | Detect missing price, photos, description and VIN; retain source photo URLs and feature text; draft accurate descriptions from verified attributes. | Authorized listing/media syndication and website publishing feed. A generated description needs dealership review before publication. |
| Sourcing / stocking | Saved target criteria, manual opportunities, channel, landed-cost/max-bid worksheet and wish list. | Auction credentials, licensed inventory feeds and a sales/demand dataset. Demand predictions and automated bids require separate implementation and authorization. |
| Wholesale | Mark wholesale candidates; capture floor, reserve, channel, expenses and final proceeds; track statuses and notes. | Auction submissions, transport orders and auction results via permissioned partners. |
| Reports | Counts by make/model/condition; list-price total; completeness, recon cycle time, observation history and entered cost exposure. | Gross, turn and days supply need accurate sales/cost/history inputs. Distinguish listing age from actual stock age. |
| New vehicles | MSRP versus advertised price; separate discounts, accessories and entered incentive components. | OEM eligibility rules and current VIN/customer/region-specific incentives. Never automatically assume all rebates stack or every buyer qualifies. |
| Consumer offers | Print the entered retail-back calculation with notes, date, expiry and dealership details. | Actual appraisal inspection, verified title/history and dealer-approved offer terms. |
| Enterprise / team | Durable records, audit trail, backup/export and owner-private hosted app. | Dealer identity, per-user roles and shared access configured for the dealership; concurrency/version checks before multiple users edit the same record. |

## Initial product priorities

1. A trustworthy inventory desk populated with real Betten listings, visible import coverage and last successful observation. Preserve every source listing for a VIN; never silently discard conflicts.
2. Useful editable vehicle workspaces: costs, retail plan, recon stage/tasks, merchandising checklist, notes and wholesale plan.
3. Appraisal worksheets and manual comparable imports with transparent calculations. Show unavailable metrics as unavailable; no substitute scores masquerading as ProfitTime or Live Market View.
4. Daily work queues: missing information, incomplete recon, missing photos/price and overdue tasks. Website price updates and auction actions remain clearly separate from internal planning changes.
5. Authorized DMS and market-data connections, automation and multi-user controls after the dealership identifies existing providers and supplies access.

## Transparent calculations

These are ordinary arithmetic for planning, not reproductions of vAuto's methodology.

- **Landed cost:** acquisition + buy fees + transport + completed/estimated recon + other entered costs. Do not count an estimate and its replacement actual twice.
- **Planned front-end gross:** proposed retail − landed cost − entered selling expenses. F&I and taxes are excluded unless explicitly modeled.
- **Maximum acquisition offer:** expected retail − target gross − recon − transport − buy fees − selling expenses − carrying reserve. A negative result is displayed as an infeasible plan, not an offer of zero.
- **Price to selected comparables:** proposed retail / median usable comparable ask × 100. Display sample size, source and observation dates. Exclude self and duplicate VINs. A manual sample is not a complete market ranking.
- **Carrying expense:** financed principal × annual decimal interest rate × elapsed days / 365, plus separately entered daily overhead × elapsed days. Treat this as an estimate; preserve entered rate and basis.
- **Days observed:** whole calendar days since first successful web observation in dealership timezone. Actual days in stock require a verified acquisition/stock date.
- **Days supply:** active inventory / confirmed retail sales during lookback × lookback days. Without confirmed sales show unavailable, never zero or infinity.
- **Recon cycle:** retail-ready timestamp − recon start timestamp, with hours/days and timezone defined. Open vehicles contribute open elapsed time, not completed-cycle averages.

## Meaningful verification cases

- A multi-page source imports every reported result; duplicate VINs across source pages merge and retain source attribution.
- A failed/partial import cannot mark inventory sold or silently replace a complete dataset. Deleted listings move to a review state only after the configured absence policy.
- Existing cost notes, recon tasks and proposed prices survive a repeated public import; source asking price and internal plan remain distinct.
- Missing prices stay null; a cash price of zero is flagged for review, not treated as a saleable asking price. Currency strings, comma-separated miles and VIN case normalize correctly.
- Known worksheet: expected retail $30,000, target gross $3,000, recon $1,000, transport $300, buy fees $400, selling $200, reserve $100 produces a $25,000 maximum offer.
- A $25,000 acquisition plus $400 fees, $300 transport and $1,000 actual recon produces $26,700 landed cost; replacing a $1,200 estimate with $1,000 actual does not total both.
- Comparator asks $20,000 / $22,000 / $24,000 yield $22,000 median; a $23,100 proposal shows 105.0%. With no eligible comparables show unavailable.
- A first-observed vehicle has zero observed days on the import date, not its model-year age. Imported acquisition date overrides only the stock-age calculation.
- Unauthorized mutation requests fail; validation rejects invalid amounts/statuses; concurrent stale updates produce a conflict; audit rows identify before/after changes.
- Exports safely handle quotes/newlines and spreadsheet-formula-like text. Backup plus restore reproduces vehicle edits and appraisal calculations.

## Data acquisition handoff needed from Betten Imports

Confirm all dealership domains and rooftops; identify DMS, inventory feed provider, current vAuto exports, market-data/history subscriptions and intended users. These inputs decide the real integration scope. Public sites can seed advertised inventory, photos and listing details; they cannot supply the dealership's complete internal operating data.
