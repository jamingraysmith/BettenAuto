# Public government data

No API keys or paid providers are used by these features. Auto.dev market comparisons and their budgets are unchanged.

BettenAuto's Research tab calls `/api/vehicle/research` only for inventory-authorized users and a VIN already present in dealership inventory. The existing appraisal decoder uses the same NHTSA cache. Decoded data never overwrites inventory fields, costs, recall-review flags or stop-sale flags.

- NHTSA vPIC: https://vpic.nhtsa.dot.gov/api/ (30-day cache).
- NHTSA recall campaigns: https://www.nhtsa.gov/nhtsa-datasets-and-apis (24-hour cache). Year/make/model campaigns are **not VIN-specific repair status**. Zero results do not certify the VIN as clear. Use the manufacturer/NHTSA VIN check before recording dealership review.
- EPA: https://www.fueleconomy.gov/feg/ws/index.shtml (30-day model/configuration cache). Staff must explicitly choose an EPA configuration. IDs must belong to the selected model/year/make. MPG and MPGe are labeled separately. Annual cost estimates use entered miles/price and only apply to single-fuel MPG configurations; PHEV/EV estimates are not calculated with the gasoline formula.
- NWS: https://www.weather.gov/documentation/services-web-api (Grand Rapids city coordinates). Hub Home shows six forecast periods and active alerts. Point metadata caches 7 days, forecasts 10 minutes and alerts 2 minutes. The frontend checks every ten minutes while visible. It is not an emergency notification service.

Server fetches use a fixed host allowlist, timeouts and manual redirect rejection. Data is stored under `system:government:` records, shared across authorized users. Failures preserve the original observation and expiry; stale data is visibly labeled. Missing alerts are never shown as “no alerts.” Weather requires an active Hub account through the existing signed gateway; no customer or employee data is sent upstream.

Checks: `node --test tests/government-data.test.mjs tests/access-control.test.mjs tests/hub-messaging.test.mjs`; `node node_modules/typescript/bin/tsc --noEmit`.
