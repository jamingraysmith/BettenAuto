# Live vehicle-market system and activation

## What is implemented

The live lookup is vehicle-driven. It takes year, make, model, trim, condition, mileage and optional VIN from the current inventory or appraisal. It does not select a dataset by stock number and has no P23277-specific execution path. Every current or newly imported vehicle with sufficient identity fields can use the same lookup. Known inventory VIN requests use the server's current imported identity. Missing/invalid details, empty results, authentication failures, quota limits, malformed responses and provider outages have distinct states. Selected website samples remain separately labeled and are never substituted for a failed live result.

`POST /api/live-market` performs an authorized provider lookup when opening an inventory vehicle or selecting an explicit refresh. Typing appraisal identity, changing filters and editing a retail plan do not trigger provider requests. Duplicate clicks are suppressed while a request is active, and late responses are discarded after a vehicle or criterion change. The current result remains in memory while moving between tabs in the same vehicle drawer; closing the drawer clears it. Asking-price statistics use only locally matched, dated provider records, with the subject VIN, duplicates, wrong models/variants, wrong condition/trim, missing prices/mileage and stale/undated records excluded. Provider record update time is not the same as an independently verified source recheck. No condition, equipment, mileage or certification dollar adjustments are invented. A bounded page is a selected response; provider totals and truncation are displayed.

`GET /api/market-status` returns only non-secret configuration and operational coverage summaries. It does not return provider credentials or cached listing payloads. `POST /api/market-refresh` creates/updates jobs for all current eligible retail VINs, including new imports. It leases and processes at most five due jobs per call when authorized retention is configured. Sold, wholesale and absent/archived vehicles are excluded from the runner's active allowlist. Vehicle/query fingerprints and generation guards prevent a late response from overwriting a different identity. Failures preserve a previously licensed cache with its original expiry; retry time does not make old data fresh. Provider caches stay out of the public static seeds, generic comparison snapshot, workspace response and normal backup.

The deployment status endpoint reports whether a provider key is configured. Free accounts must use evaluation mode; no production subscription has been verified. The adapter and worker pipeline are validated with realistic fixtures and SQLite-backed tests, not a live paid provider account. Nationwide coverage, taxonomy compatibility and billing have NOT been validated. Activation requires an appropriate production account, agreed use/retention rights, representative live acceptance checks and a saved-version deployment applying its secret configuration.

## Supported provider contracts

- Auto.dev: official v2 `/listings` with Bearer authorization, structured year/make/model/trim, new/used/CPO and mileage criteria. It is a request-time candidate for an approved production internal automotive application. Free evaluation access must not be represented as a production service.
- Custom authorized JSON feed: a configured HTTPS endpoint receives vehicle identity/filter query parameters and a Bearer credential. It returns `{ "listings": [ ... ], "total": 123, "next": "same-endpoint-page-url-or-null" }`. Each listing requires VIN, year, make, model, trim, New/Used condition, positive numeric USD price, numeric mileage, advertised certification true/false/null, actual dealer/location, listing URL and a genuine `observedAt` or `providerObservedAt`. Pagination must remain on the configured origin/path. Taxonomy and source verification obligations belong in the provider contract.

Current vAuto, VinSolutions and Dealer.com subscriptions do not establish a configured nationwide competitor API. An approved Cox integration needs confirmation of exact modules/data scopes and authorization. Dealer.com's third-party inventory feed request covers the dealership's own inventory, not an assumed national competitor feed.

## Runtime configuration

Set values through native Sites environment controls; mark `MARKET_DATA_API_KEY` secret. Never put keys in source, client code, source manifests, logs, screenshots, chat-visible reports or local committed files. Environment changes require deploying a saved version to take effect.

| Key | Meaning / default |
|---|---|
| `MARKET_DATA_PROVIDER` | `autodev` or `custom`; unknown values block fetching |
| `MARKET_DATA_API_KEY` | Provider credential; secret; absent by default |
| `MARKET_DATA_ENABLED` | Must explicitly equal `true`; otherwise no provider calls |
| `MARKET_DATA_ENDPOINT` | Custom-provider HTTPS endpoint only; fixed server configuration |
| `MARKET_DATA_ACCOUNT_MODE` | `evaluation` for Free-plan testing, `production` for an authorized production account; defaultproduction |
| `MARKET_DATA_MONTHLY_LIMIT` | Reserved calls per UTC calendar month; default10000 in production, maximum1000 in evaluation |
| `MARKET_DATA_DAILY_LIMIT` | Maximum reserved provider calls per UTC day; default300 in production, maximum1000 in evaluation |
| `MARKET_DATA_MAX_PAGES` | Maximum1–2 pages of up to50 records; default1 |
| `MARKET_DATA_REFRESH_HOURS` | Licensed cache lifetime and scheduled refresh interval; default24 |
| `MARKET_DATA_CACHE_ALLOWED` | Defaultfalse. Set true only when the provider agreement expressly permits this application's durable response cache/bulk workflow |
| `MARKET_DATA_QUERY_VERSION` | Increment on query/taxonomy/endpoint interpretation changes; default1; invalidates prior cache identities |

The daily and monthly call allowances are enforced atomically in one monthly record before each lookup. Previous daily reservation records remain counted. Evaluation forces one page of up to20 listings, disables result retention and bulk searches, and caps this app at10 calls/day and200/month. Production Auto.dev requests up to100 listings per page; custom feeds default50. The call allowance reserves the maximum page count before each lookup, conservatively bounding usage even when fewer pages are returned. It is an application limit, not a provider bill or quota report; other applications and dashboard requests on the same Auto.dev account can consume the separate account allowance. Invalid/cross-origin requests and missing/disabled provider settings do not call the provider. Authentication, quota and budget failures stop batch work with backoff. Failed requests can still count against provider billing, so use the provider account's actual production plan and spending limits.

## Rights, retention and appraisal records

Live display is the default. Without express retention rights, raw API responses, market-price summaries and comparison VINs are not written to D1, audit, seed files, backups or appraisal snapshots. Applying a live price to expected retail records a dealership decision. The worksheet identifies the live lookup basis and omits raw licensed comparison statistics. This needs confirmation against the actual provider agreement before activation. MarketCheck's default terms expressly restrict persistent caching and competing data applications; do not connect its standard key to a durable replacement system without the necessary Enterprise/custom authorization.

Licensed scheduled mode stores each query's result only under the explicit retention setting. It never replaces the global manually collected comparison snapshot. Source-specific data limitations, provider totals, stale/unknown update time and missing results remain visible. Neither provider nor this application can guarantee an exact match or error-free listing for every rare vehicle. Insufficient data must remain explicit.

## Activation acceptance checks

1. Confirm provider plan, nationwide search scope, permitted internal dealership application use, API limits, retention and bulk rights.
2. Configure the secret and enabled/provider values, preserving the private audience, then deploy a saved version.
3. Check real lookups across Volkswagen, Volvo, Mercedes-Benz and other makes; New, Used and CPO; a non-Jetta, a rare vehicle, a newly imported VIN, and an unknown appraisal VIN.
4. Verify provider taxonomy against dealer names (e.g. `1.5T SEL` vs `SEL`, Mercedes numeric models vs class names). Apply only verified mapping overrides or query-version changes; never tune a result to a desired percentage.
5. Verify dates, currency, actual dealer location, fee basis, own-VIN exclusion, duplicates, empty results, pagination, provider totals and manual retail application.
6. Verify deployed writer authorization, quotas, failed-query behavior and original cache expiry. Enable unattended licensed batches only after these checks pass.

Official sources checked October20,2026:
- https://docs.auto.dev/v2/products/vehicle-listings
- https://docs.auto.dev/v2/reference/searchVehicleListings
- https://www.auto.dev/pricing
- https://www.auto.dev/terms
- https://www.dealer.com/support/thirdparty/
- https://www.vinsolutions.com/dealership-software/integrations/
- https://developer.coxautoinc.com/
- https://www.coxautoinc.com/terms/wp-content/uploads/sites/3/vAuto-Integration-Terms-and-Conditions.pdf
- https://developers.marketcheck.com/terms

## Free-plan vehicle opening (2026-10-23)
Opening an inventory vehicle starts one Auto.dev lookup after a 250 ms mount delay. Only the embedded vehicle pricing view auto-loads; appraisal entry and the inventory list do not. Filter edits, allowance updates and rerenders do not retry automatically. Reopening a vehicle or selecting a manual refresh uses another request. Results remain in the mounted screen only; no durable provider caching is enabled. Free-plan application budgets are capped at 1,000 calls per UTC month and 1,000 per day, with atomic reservations shared across users. Account usage outside this app is separate. One page of at most 20 results is requested. No inventory-wide automatic provider refresh is enabled.

## Familiar pricing workspace and empty-result diagnostics
The vehicle workspace now groups Competitive Criteria, Gauges and Competitive Set in a compact layout. Provider responses disclose received records and matching exclusions. When Auto.dev yields no matching records, previously collected matching dealer listings remain visible with their distinct source label; these are never described as live Auto.dev results. Jetta trim 1.5T SEL/FWD qualifiers translate to Auto.dev SEL for retrieval while strict equivalent-trim matching remains local. No automatic broad-query fallback consumes additional calls.

Live contract checked: Auto.dev listing responses can omit updatedAt while including createdAt. Creation is not a last update. The normalizer retains observedAt empty and providerObservedAt null, and marks active_provider_response. Only Auto.dev records with this explicit marker may qualify using a fresh retrievedAt; known stale update dates and arbitrary undated saved/custom records remain excluded. UI shows unknown last update separately from actual retrieval, and no dealer-verified date is invented.

## Exclusive market provider (owner request, October 23)
MARKET_DATA_AUTODEV_ONLY=true removes collected/manual comparison records from workspace display, disables public collector and market comparison import endpoints, and removes every saved-comparison fallback from pricing/appraisals/dashboard. Historical records stay preserved for recovery; no deletion of dealer work occurs. The inventory-only 9 AM heartbeat no longer collects competitor listings. The separately linked cloud public collector has no available edit tool; its old API calls now receive disabled/410 before any source requests. UI provider branding is replaced by Live Market / Market Comparisons while retrieval provenance and allowance limitations remain visible. Own inventory and dealer cost imports remain intact.

## Equivalent names and dealership distance
Live searches include bounded spelling aliases in a single provider request: Volkswagen trim prefixes/Technology wording, Volvo XC model/Recharge/plug-in-hybrid names and T8 trim prefixes, Mercedes series versus badge model names, and BMW badge versus Series labels. Local matching still excludes incompatible powertrains, observed engines/drivetrains, body variants, trims, certification, year and mileage. No fuzzy substring matching or extra automatic retries are used.

Inventory Competitive Criteria and appraisal searches offer Nationwide or a radius from Betten Imports, ZIP 49546. The server fixes this origin and sends the provider zip and distance filters. A returned listing may have a verified search-area scope without an individual distance: show “Within N mi (search area)”, never invented dealer mileage. Such scope only qualifies for the same ZIP and an equal or wider radius. Nationwide responses cannot satisfy a local radius without distance evidence. Changing criteria clears the active view and requires Refresh comparisons; opening a vehicle still uses at most one bounded free-plan request, and provider results are not stored.
The Inventory distance choice is remembered on this browser for the next vehicle. Appraisals have their own distance selector. Provider search aliases do not modify the imported vehicle name or stock record. Existing private stock/cost data and source restrictions remain intact.

## Wrangler naming / transition-year matching (2026-10-26)
Wrangler searches now put the observed model and its equivalent Wrangler/Unlimited/JK/JL naming forms into one OR query and normalize redundant Unlimited/4x4/4WD trim wording. Body and generation are checked separately; Sport S, Rubicon and special editions are not collapsed into Sport. For 2018 only, FCA's published VIN guide (December 1, 2017, page 4) provides positions 5–7: JW is JK, JX is JL; D/E/F/K/L/M are four-door and A/B/C/G/H/J are two-door. This rule requires the 2018 VIN year code J, a 1C4 WMI and a recognized descriptor. Explicit label/body contradictions fail closed; unknown transition-year generation is excluded. No VIN-specific comparable list, extra automatic provider retry or external comparison source is introduced. Source: https://www.jlwranglerforums.com/forum/attachments/vindecode-pdf.47156/ (FCA-authored manufacturer guide).
The pricing screen distinguishes no returned listings from returned listings excluded by identity, mileage, distance, certification or freshness. A bounded empty sample never establishes zero available vehicles nationwide.
