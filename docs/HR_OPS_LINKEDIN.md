# Optional interactive LinkedIn sending

This extension was explicitly requested after the draft-only MVP. It uses the already-declared Playwright dependency, a dedicated visible browser profile and a human-operated terminal. It sends at most one direct message per invocation. Research, `hr-ops.mjs`, draft generation and OpenClaw remain unable to dispatch messages automatically.

The retained Career-Ops `modes/contacto.md` discovers a contact and drafts a message; it is not an existing sender to reuse. This adapter is new. LinkedIn prohibits unauthorized automated activity, including messaging. See its [automation guidance](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en) and [User Agreement](https://www.linkedin.com/legal/user-agreement). The adapter is not a platform-approved integration. It does not bypass restrictions or provide anti-detection measures.

## Run

Use Node 24, installed project dependencies, and an actual personal LinkedIn profile URL for the sender. The configured firm sender name must match the visible sender profile. The recipient URL must have saved evidence naming that contact. Keep primary company-page evidence as the source of the recipient's current role; a search result can locate the profile without establishing role freshness.

```powershell
node hr-ops-linkedin.mjs preview PROSPECT_ID --draft DRAFT_ID --profile-url RECIPIENT_PROFILE_URL --sender-profile-url YOUR_PROFILE_URL --revision CURRENT_REVISION
node hr-ops-linkedin.mjs send PROSPECT_ID --draft DRAFT_ID --profile-url RECIPIENT_PROFILE_URL --sender-profile-url YOUR_PROFILE_URL --revision CURRENT_REVISION
```

These are command templates, not values to paste unchanged. `node hr-ops.mjs status COMPANY` supplies current IDs and revision. Preview is offline and creates no delivery attempt. An optional explicit browser installation, if missing, is `npx playwright install chromium`. Installation is never implicit.

The send command rejects non-interactive input before opening a browser. A human types OPEN, logs in privately if required, navigates to their own profile, then types READY. The adapter validates the own-profile URL and name, navigates to the exact recipient profile, verifies its name, opens a direct-message composer and fills the saved text. Existing composer text is never overwritten.

After checking the visible sender, recipient and exact message, the human types `SEND DRAFT_ID`. The adapter records a content-bound human review, then revalidates the expected approval revision, qualification, suppression, hold, draft freshness, firm hash, profile evidence and composer text under the workspace writer lock. Any other revision change stops delivery. It persists an attempt before a single send click. The human then checks the conversation and types SENT only if the exact outgoing message is visibly sent. That confirmation creates a normal `sent` event and follow-up schedule through the existing CLI. The recorded occurrence time is the browser click completion time, not a server delivery timestamp. Clicking alone does not establish server delivery.

Do not answer these human prompts through agent tools or piped input. The human terminal check is a workflow boundary, not an independent security barrier against arbitrary filesystem/code access. No fictional approvals or interaction records are created during development.

## Storage and recovery

- Dedicated login session: `{DATA_ROOT}/local/browser-profiles/hr-ops-linkedin/`. Contains sensitive cookies. Git ignores local files; the HR backup manifest deliberately excludes this profile. Never export or copy it into captures or evidence.
- Attempt receipts: `{DATA_ROOT}/data/hr-ops/delivery-attempts/`. Include the approved exact message, recipient, authorization and outcome state. Normal HR backups include these receipts. Doctor does not certify remote delivery or validate LinkedIn's live UI.
- Pipeline history: only an actual human confirmation adds a sent event. A missing email address does not block LinkedIn direct messages.

Any existing attempt for the same draft blocks another attempt, including a timeout or process interruption. Never delete the receipt to retry. Inspect the actual conversation, then record an actual human-reported send through `hr-ops.mjs record` if necessary. A terminal failure after a click may leave an unconfirmed receipt even when LinkedIn sent the message. A failure after the sent event but before receipt annotation must also be reconciled; existing sent events independently block replay. There is no automatic retry or exactly-once remote-delivery claim.

The core `send_enabled: false` output still means the core CLI/draft objects are not send APIs. Build information separately identifies this optional interactive adapter. Email delivery, external CRM writes, batch sending, connection invitations, InMail, purchases and autonomous agent delivery remain unsupported.

## Tested scope

Tests cover plan binding, recipient URL validation, draft freshness, holds/suppression, revision races, duplicate attempts, failed clicks, and an actual Playwright browser against locally intercepted HTML. Tests never contact LinkedIn or send a real message. The English LinkedIn DOM adapter is deliberately narrow and may stop on a changed layout, localization, account restriction, sign-in checkpoint or unavailable direct-message option. A human-supervised live acceptance run is still required before calling it operationally validated. No live account was opened during implementation.
