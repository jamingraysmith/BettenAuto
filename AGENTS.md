# Betten Imports development instructions

- Betten Hub is in apps/betten-hub; BettenAuto Inventory Desk is in apps/betten-auto.
- After every new app version you create, upload the corresponding current source to this GitHub repository. Preserve unrelated changes and never force push.
- Exclude credentials, customer records, internal financial/operating data, local databases, runtime evidence and generated outputs. Keep runtime secrets in hosting settings.
- Preserve each live Site's current audience and existing database records. Publish compatible backend updates before dependent Hub UI updates.
- Native BettenAuto UI lives in apps/betten-hub/features/betten-auto and must stay aligned with the Inventory Desk frontend. The native API namespace is /api/bettenauto and must use the fixed, signed, employee-bound gateway; retain original authorization and revision checks.
- Competitor data must come strictly from the configured on-demand provider. Do not activate legacy public collectors, paid plans or fleet refreshes. External vendor login/frame protections must be respected.
