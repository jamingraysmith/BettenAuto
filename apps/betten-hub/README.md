# Betten Hub

Standalone central application launcher for Betten Imports. The app connects server-to-server to the existing Inventory Desk's restricted Hub gateway for shared permissions, department messaging, customer records, announcements and resource links. It does not mirror the Inventory Desk interface or copy dealership financial records into a second database.

Runtime secret names: HUB_BRIDGE_SECRET and INVENTORY_SERVICE_TOKEN. Configure through Sites, never in source or local environment files. The Inventory Desk holds the matching bridge secret and shared data. Gateway requests bind the signed-in email to a signed, time-limited, replay-protected action. Employee access requires separate Site sharing and owner-assigned module permissions.

Applications open in separate tabs. External apps retain their own account controls. Customers and Hub information are entered manually. The messaging drawer works across native applications, with department-only channels, participant-only direct messages, and permission-protected customer links. No end-to-end encryption is claimed.
