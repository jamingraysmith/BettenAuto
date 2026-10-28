# Betten Hub

Standalone central application launcher for Betten Imports. The app connects server-to-server to the existing Inventory Desk's restricted Hub gateway for shared permissions, department messaging, customer records, announcements and resource links. It does not mirror the Inventory Desk interface or copy dealership financial records into a second database.

Runtime secret names: HUB_BRIDGE_SECRET and INVENTORY_SERVICE_TOKEN. Configure through Sites, never in source or local environment files. The Inventory Desk holds the matching bridge secret and shared data. Gateway requests bind the signed-in email to a signed, time-limited, replay-protected action. Employee access requires separate Site sharing and owner-assigned module permissions.

Applications open in separate tabs. External apps retain their own account controls. Customers and Hub information are entered manually. The messaging drawer works across native applications, with department-only channels, participant-only direct messages, and permission-protected customer links. No end-to-end encryption is claimed.

## Native BettenAuto workspace

BettenAuto now opens in the Hub center at `/?view=BettenAuto`. The native UI is served from this same application at `/bettenauto`, in a same-origin frame that isolates styles and preserves the Hub navigation and messenger. It is not an embed or reverse proxy of the private Inventory Desk website. Vehicle selection is exchanged only with the same-origin parent frame; messaging resolves VINs against the authorized inventory list.

The frontend snapshot lives in `features/betten-auto/`. Its requests use `/api/bettenauto/*`; the server signs an employee-bound assertion and sends it to the existing inventory gateway. Only fixed paths and methods in `lib/hub-desk-policy.ts` are permitted. The inventory service invokes its original route handlers, which recheck module permissions, field visibility, record revisions and owner-only actions. Response status codes, including 409 conflicts, are preserved. No new database or copied private records are used. Fleet market refresh and public comparison collection endpoints are excluded.

When updating Inventory Desk frontend features, synchronize the corresponding native UI files and API namespace, run both apps' checks and native transport tests, and publish the backend compatibility update before the Hub. External applications retain separate-tab launch behavior; their frame restrictions are never removed or bypassed.

vAuto can also open in the Hub center after signing in normally with Cox in a separate tab. The embedded workspace provides sign-in, reload and separate-tab recovery controls and retains Hub navigation/messaging. This is session-dependent provider access, not shared Hub authentication. KeyTrack, VinSolutions and Dealer.com remain separate-tab links after browser tests showed frame, startup or authentication failures. See `docs/EMBEDDING.md` for the observed limits.
