# Betten Hub

The Hub launches the Inventory Desk, appraisals, reports and native Keys & Operations. The external KeyTrack link opens the original application; there is no record synchronization. Operational fields start unrecorded. Staff manually enter key holders, departments, fuel requests, vehicle insights and confirmed sales. Department elapsed times start when an assignment is saved. Existing inventory and financial records are preserved.

Messages are shared across the native applications through a floating panel or expanded view. Authorized visitors register when opening the Hub; direct conversations are limited to their members. Site service credentials cannot impersonate a visitor. Chat tables are separate from the inventory workspace export. No employee roster or conversation history was copied from reference screenshots.

Vehicle screens include manual dated bookouts, photo URL management and ordering, a printable dealer information sheet, lifecycle tasks and retained vehicle change history. Book values do not connect to licensed valuation feeds. Photo file uploads are not implemented. The information sheet is not an OEM window sticker or a completed statutory Buyers Guide; the official guide is linked separately.

Dashboard history is recorded by future complete inventory imports, with known-field coverage. Historical trend lines and third-party benchmarks are never backfilled or fabricated. Market comparisons remain on demand under existing provider limits.

### Native workspace (October 28, 2026)

The standalone Hub now serves the BettenAuto frontend in its center panel from its own same-origin route. The signed `desk:*` gateway actions use `lib/hub-desk-policy.ts` and `lib/hub-desk.ts` to dispatch a fixed list of existing Inventory Desk handlers under the authenticated employee email. Service identities, pending/suspended employees and employees without tool access are rejected. Original handlers retain field projections, owner checks and revision conflict detection. The gateway never copies the service credential into a delegated request. Arbitrary paths/hosts, public sample collection and bulk market refresh are excluded. The Hub mirrors this allowlist before sending any request. Tests cover identity binding, access rejection, allowed method/path dispatch and status preservation.
