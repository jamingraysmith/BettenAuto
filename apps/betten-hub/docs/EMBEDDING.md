# Application embedding

Browser checks performed October 28, 2026 using normal provider URLs in a cross-origin frame. No response headers, cookies, browser protections or access controls were altered.

| Application | Observed result | Hub behavior |
| --- | --- | --- |
| BettenAuto | Native same-origin Hub workspace uses existing authorized inventory backend. | Center workspace. |
| vAuto | Initial embedded OAuth sign-in failed. After the user signed in normally in a separate tab, the actual Betten Imports dashboard loaded in the frame. | Center workspace with separate sign-in and reload controls. Session-dependent; not single sign-on from Hub. |
| KeyTrack | `X-Frame-Options: DENY`; browser refused the frame. | Separate tab. Because the dealership owns this application, its source can later allow an exact Hub frame ancestor, with corresponding login testing. No KeyTrack source or hosting changes made here. |
| VinSolutions | Application startup throws a SecurityError when writing `tabContextId` to a cross-origin parent window. | Separate tab. Needs a provider-supported embedding entry point or integration. |
| Dealer.com | Initial landing page loads, but frame later refuses to connect. With the Cox sign-in active, the frame reported too many redirects. | Separate tab pending supported authentication/embedding flow. |

Only exact tested vAuto origins in `lib/external-apps.ts` enable embedding. App names and IDs cannot allow an arbitrary destination. The embedded dashboard URL is fixed; credentials are entered only on the provider's own sign-in page in a separate tab. Hub does not read or proxy the remote document, copy cookies, intercept credentials or grant Cox permissions. The frame preserves the browser origin boundary and uses a sandbox allowing the scripts/forms/popups/downloads needed by the application while disallowing top-level navigation.

Cross-origin frame load events cannot prove successful sign-in or page rendering. The UI therefore keeps sign-in, reload and separate-tab recovery controls visible and never labels a frame as authenticated based solely on a load event. Browser privacy settings, provider changes and session expiry can require a new top-level sign-in. Hub messaging remains available, with inventory attachments chosen from the Hub's authorized inventory; it does not automatically read selection inside the external vAuto page.
