# Local asking-price sources

Initial regional capture collected October 20, 2026, for the Betten Imports pricing desk. The counts below are historical evidence, not the current production total. The current shared collector has 80 configured reviewed feed paths; see PUBLIC_MARKET.md and the production status/coverage readback for their actual latest results. These are observed public dealer listings, not sold-price records or a complete market database. The machine-readable coverage and page timestamps are in `data/market-source-report.json`; the app consumes `app/lib/seed-comps.json`.

| Public source | Observed unique VINs / stated source total | Coverage |
|---|---:|---|
| SHARPE Cars | 104 / 104 | Four pages; complete source snapshot |
| Crown group via Crown Volkswagen | 488 / 488 | 21 pages; complete source snapshot |
| Volvo Cars Kalamazoo | 76 / 76 | Four pages; complete source snapshot |
| Mercedes-Benz of Kalamazoo | 17 / 17 | One page; complete source snapshot |
| Combined | 685 unique VINs | 637 retail listings and 48 explicitly excluded wholesale listings |

Nine listings have no published asking price and two Sharpe listings have no captured mileage; those values remain null. The selected feeds contain only two Volvo listings and twenty Mercedes-Benz listings. Unmatched Betten vehicles must show insufficient comparable coverage rather than a made-up estimate.

## Sources

**SHARPE Cars, Grand Rapids:** [used inventory](https://www.sharpecars.com/inventory/used). All four public result pages were fetched directly, yielding 104 unique VINs against a stated source total of 104. The source supplies year, make, model, configuration, VIN, price, URL, certification indicator and vehicle-card mileage. The dealership's own structured address is 1010 28th St SE, Grand Rapids, MI 49508, and its structured coordinates are 42.91188402, −85.64021068. These are source-declared dealership coordinates, not verified vehicle locations.

**Crown group, Holland:** [Crown Volkswagen used inventory](https://www.crownvolkswagen.com/used-inventory/index.htm). This public page aggregates multiple Crown rooftops; each normalized record retains the actual rooftop name and address supplied in the feed's account mapping. It must not be labeled entirely Crown Volkswagen. The 488 listings comprise Crown Honda 162, Crown Toyota 157, Crown CDJR 121 and Crown Motors Wholesale 48. Wholesale records are explicitly tagged `condition: Wholesale` and `wholesaleSource: true` so retail comparisons can exclude them. Public browser DOM captures were necessary because direct requests returned HTTP 403. The source total initially changed; affected pages were recaptured, and the final 21-page set consistently reported 488 with 488 distinct VINs.

**Volvo Cars Kalamazoo:** [used inventory](https://www.volvocarskalamazoo.com/used-inventory/index.htm). All four public result pages were captured through the browser, yielding 76 unique VINs against a stable stated total of 76. Its account mapping supplies the dealership address 5622 W Main Street, Kalamazoo, MI 49009-1014. This feed includes other makes as well as Volvo; its two advertised Volvo listings are a 2023 XC90 B6 Plus 6-Seater and a 2025 XC90 B5 Plus.

**Mercedes-Benz of Kalamazoo:** [used inventory](https://www.mercedesbenzofkalamazoo.com/used-inventory/index.htm). The legacy `searchused.aspx` URL redirects to this current Dealer.com page. Its one public result page contains 17 distinct VINs against a stated total of 17: 15 Mercedes-Benz vehicles, one Honda and one Subaru. The feed supplies the actual rooftop address 543 W Michigan Ave, Kalamazoo, MI 49007-3715. Direct HTTP requests returned 403; the public browser page supplied the verified snapshot. No access controls were bypassed.

Additional direct requests to Gezon Motors were denied; Audi Grand Rapids returned a service error. No invented records were added to fill those gaps.

## Price basis and comparison limits

- Sharpe's visible **Price Now** agrees with its structured Offer price. For the observed records it can include a dealer fee component: the vehicle card's pre-fee selling figure and final visible figure are preserved separately as `preFeePrice`, `price` and `feeComponent`. For example, a $39,000 pre-fee price appeared as $39,314. Do not silently mix that with another dealer's pre-fee asking price. The site's analytics price field sometimes holds an older list/MSRP figure and is deliberately not used as the selling price or fee basis.
- Dealer.com sources use the unique displayed final vehicle-price row marked `isFinalPrice`, retaining its label in `pricingBasis`. A `totalFees` row is excluded even if marked final; a call-for-price vehicle with only a numeric fee remains unknown. This matches Crown's displayed **Crown Price**. Volvo Kalamazoo's **Sale Price** and Mercedes-Benz Kalamazoo's **Fox Price** include an explicitly displayed $314 dealer documentation/CVR fee; `preFeePrice` and `feeComponent` preserve those displayed components. The analytics `trackingPricing.askingPrice` can differ from both the displayed pre-fee and final prices, so it is retained only as `rawTrackingAsking`, never chosen over a displayed final price. Example: a Mercedes GLB 250 displays Price $44,802 + fees $314 = Fox Price $45,116, while its analytics asking value is $44,498. Compare fee bases before deciding on a price.
- `observedAt` is the timestamp when the public listing snapshot was retrieved, not the vehicle's acquisition date or a promise of availability.
- `distanceMiles` stays null. Approximate distance may later be computed from verified coordinates with its method clearly labeled; no exact travel distance is supplied here.
- Certification, year, mileage, drivetrain, engine, trim, body style, equipment and condition affect comparability. Matching make/model/year alone does not establish equal value. Listings are asking prices, and source labels can vary: Mercedes-Benz **GLE** with a **350** trim can correspond to Betten's **GLE 350** model label; BMW **5 Series** with **540i xDrive** trim can correspond to **540i**.
- Selected-source price position is not a whole-market rank, a book valuation, a demand score or a prediction of sale price.

## Refresh and evidence

Run `ops/import_market.py --refresh-sharpe` with the bundled Python runtime to fetch and validate Sharpe's known four-page public source. The importer refuses to replace the existing seed if the distinct VIN count does not match the source total. It also normalizes saved public DOM payloads named `data/market-raw/crown-*.json` , `data/market-raw/volvo-kalamazoo-*.json` and `data/market-raw/mercedes-kalamazoo-*.json`. These Dealer.com sources need an authorized feed or successful public browser/network access for unattended refresh; a local normalization script alone is not a scheduled live-market integration.

Raw retrieved HTML and browser JSON are retained in `data/market-raw/` for traceability. The normalized record preserves its listing URL, source page, dealer, observation timestamp and all observed source listings for a duplicate VIN. No paid accounts, contract acceptance or auction access were used.

## Expanded US listings

See EXPANDED_MARKET.md and lib/seed-expanded-comps.json for the independently verified wider-area sample introduced for P23277. The original regional table above describes the initial 685-vehicle import; it does not describe the subsequent expanded sample. Expanded coverage is vehicle-specific and varies by model. Regional refreshes retain expanded observations without resetting their timestamps. Both Pricing and Appraisals expose the actual scope and strict trim/year criteria.

Daily collection targets a **9:00 AM Eastern** start. The public runner performs one source per request, up to 200 bounded requests and stops as soon as no work remains. Additional detail passes can fill observed same-VIN metadata without changing result-page asking prices; retained fields keep their original observation dates. The original four-source browser refresh must be aggregated with all retained configured public source snapshots and the expanded saved sample. Never replace that full library with just this historical regional subset.
