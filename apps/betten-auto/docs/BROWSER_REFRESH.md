# Verified public inventory refresh

The verified authoritative imported source is Betten Imports' combined inventory at
https://www.bettenimports.com/all-inventory/index.htm . The initial verified capture advertised **290** vehicles
on 2026-10-20: **214 new**, **76 pre-owned**, of which **12 certified**. All 13 result
pages were read through the normal browser interface and yielded **290 unique VINs**,
including **128 Mercedes-Benz**, **68 Volvo**, **60 Volkswagen**, and 34 other makes.
The UI facet counts were independently saved in `data/raw/combined-facets.json` and
match the normalized record counts. This certifies the combined feed's completeness;
it does not establish that every brand website has identical coverage.

The combined inventory includes 9,054 public photo URLs. Public records expose prices,
MSRP, VIN, stock, specs, website inventory date, detail URLs, and photo galleries.
Vehicle detail pages expose equipment, highlighted features, and dealer notes.
The source inventory date is **not a verified acquisition date**. Actual dealer cost,
reconditioning invoices, DMS records, historical sales, and licensed market valuations
are unavailable from this public inventory.

Direct HTTP fetching from this computer returned 403. Do not try to circumvent source
access controls. The repeatable successful path below reads already-public browser DOM.
A full live refresh should only replace inventory when the unique VIN count equals the
source's advertised total and every page reports the same total. Failure must retain
the last complete import and show the stale/failed status in the app.

## Browser DOM capture recipe

Initialize CUA with its documented first-call selection API, then read its documentation.
Use one browser tab for the verified combined inventory URL. `tab`, `fs`, and `out`
below are task-local variables; `fs` is Node's `node:fs/promises`, and `out` is an
absolute **new capture directory**. No credentials are needed or written.

```js
var extractPublicInventory = () => {
  const scripts = Array.from(document.scripts);
  const script = scripts.find(s => s.textContent.includes("DDC.WS.state['ws-inv-data']"));
  if (!script) throw new Error('No public structured inventory; keep previous import.');
  const line = script.textContent.split('\n').find(s =>
    /^DDC\.WS\.state\['ws-inv-data'\]\['[^']+'\] = \{/.test(s));
  if (!line) throw new Error('Inventory markup changed; keep previous import.');
  const payload = JSON.parse(line.slice(line.indexOf(' = ') + 3).replace(/;\s*$/, ''));
  return {
    ...payload,
    structuredData: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => JSON.parse(s.textContent)),
    nextHref: Array.from(document.querySelectorAll('a'))
      .find(a => a.getAttribute('aria-label') === 'Go to next page')?.getAttribute('href')
  };
};
```

Navigate to the combined source URL and collect fresh `getAXState` before extraction.
The first page's `payload.WIS.pageInfo` gives `totalCount`, `pageSize`, and `pageStart`.
`payload.WIS.inventory` contains up to 24 complete listing records. Save each capture
with the public page URL and current UTC `observedAt`, using filenames
`bettenimports-000.json`, `bettenimports-024.json`, ..., `bettenimports-288.json`.
Follow the **observed** next-page link rather than guessing source URLs. Every navigation
must be followed by `getAXState` before extraction. A normal page loop:

```js
var payload = await tab.playwright.evaluate(extractPublicInventory);
var capture = {url:currentPublicUrl, observedAt:new Date().toISOString(), ...payload};
await fs.writeFile(out + '/bettenimports-' +
  String(payload.WIS.pageInfo.pageStart).padStart(3, '0') + '.json',
  JSON.stringify(capture, null, 2));
// If another page exists, resolve payload.nextHref against the currentPublicUrl,
// navigate with tab.goto(), read getAXState(), and repeat.
```

Use bounded batches of at most four pages per tool call to avoid execution timeouts.
For the initial observed count of 290, 13 pages were required. Recalculate the required pages from the current advertised total on every run; the old count is not a current-coverage assertion. A run should capture to a new empty
directory so stale pages from an older larger inventory cannot contaminate the run.

## Normalize and validate

Use the bundled Python executable if the OS Python prompts for Xcode tools:

```text
/Users/jaminsmith/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/jaminsmith/Documents/ChatGPT/Betten Cox/betten-inventory/app/ops/import_inventory.py \
  --from-raw --raw-dir /ABSOLUTE/NEW/CAPTURE/DIRECTORY
```

The command writes `data/inventory.json`, `data/source-report.json`, and their
`app/lib/seed-*.json` equivalents atomically after validation. For a deployed app,
submit the normalized inventory through the app's authorized server import endpoint
or rebuild and deploy the verified source state. Do not claim a published app updated
until its returned import count and current inventory can be verified.

To try a direct authorized fetch, run the same script without `--from-raw`. On 403,
markup errors, changed totals, missing VINs, or incomplete pagination, it exits nonzero,
keeps prior complete inventory, and writes `data/last-import-attempt.json` with the error.

## Detail enrichment and previous detail preservation

For each newly discovered or changed VIN, the normalized record's `sourceUrl` is an
observed public detail link. Open that URL in the normal browser and read fresh
`getAXState` before extracting these embedded states from `document.scripts` with
`^DDC\.WS\.state\['([^']+)'\]\['([^']+)'\] = (\{.*\});?\s*$`:

- `ws-quick-specs`: `quickSpecs` contains VIN, stock, full engine, MPG, colors, drive,
  seating, and transmission. Validate this VIN against the listing before saving.
- `ws-hl-features`: `features` is an array of `[id, label]` pairs.
- `ws-pckg-accessories`: `options` contains installed option `text` values.
- `ws-dealernotes`: `comments` contains the dealer's published HTML notes.
- `ws-detailed-specs`: `equipment` includes specification categories and labeled specs.
- `ws-standard-features`: `standardFeatures` contains additional package data.
- `ws-vehicle-media`: `media` contains gallery images.
- `ws-vehicle-title` and `ws-vehicle-ctas`: public vehicle identity and listing attributes.

Save `{url, observedAt, states, structuredData}` to `details/<VIN>.json` inside the new
capture directory, where `states` is keyed first by widget name then widget ID. The
normalizer enriches its record and preserves the detail observation timestamp. Use
at most two tabs concurrently and bounded batches; no forms or retailer accounts
are involved. If a detail page has no matching VIN, retry once and record its failure
in `detail-errors.json` without substituting another vehicle's details. Keep its valid
listing record. A listing-only refresh retains previously verified details for existing
VINs with the original `detailObservedAt`; it never labels retained details newly read.

## App seed compaction

`data/inventory.json` retains the complete normalized source evidence, including provider
specification IDs, sorting priorities, and weights. The app seed is minified and its
`equipment` field is normalized to an array of groups:

```json
[{"category":"Convenience Features","items":[{"label":"Air conditioning","detail":"automatic","availability":"S"}]}]
```

Every source specification is retained with its category, visible label, detail, and
availability code. Only provider IDs and sorting metadata are omitted from the app seed.
All photos, installed features, seller notes, and observation timestamps stay intact.
The verified initial dataset contains 44,434 specifications across 290 vehicles; the
app seed is approximately 5.1 MB instead of the 14 MB full evidence JSON.

## Daily operation

The requested daily desktop start is **9:00 AM Eastern (America/Detroit)**. Browser-only inventory and legacy comparison sources require the computer, Codex and supported browser access to be available. Capture and verification finish after the start time; report incomplete or blocked runs and retain the prior complete dataset. Public sources that support reviewed server HTTP use the separate collector described in PUBLIC_MARKET.md. Its 80 configured feed paths and up-to-200 request loop must be read back after completion; neither the browser schedule nor registry alone proves every car has nationwide matches.
