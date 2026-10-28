# LinkedIn sending

`hr-ops-linkedin.mjs` sends one saved, current LinkedIn draft per invocation through a dedicated Playwright browser profile: a direct message, a connection request with the draft as its note, or a paid InMail. It runs either in a human-operated terminal or unattended by the agent when the user has instructed the send. Research, `hr-ops.mjs`, draft generation and OpenClaw never dispatch messages.

The retained Career-Ops `modes/contacto.md` discovers a contact and drafts a message; it is not a sender. LinkedIn prohibits unauthorized automated activity, including messaging and invitations. See its [automation guidance](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en) and [User Agreement](https://www.linkedin.com/legal/user-agreement). This adapter is not a platform-approved integration, provides no anti-detection or restriction bypass, and can lead to account restrictions.

## Run

Use Node 24, installed project dependencies and the workspace's designated personal LinkedIn profile URL for the sender. The configured firm sender name must match the visible sender profile. The recipient URL must have saved evidence naming that contact. `modes/hr-ops/contacts.md` defines which sources establish a current role: an opened LinkedIn profile or a current company page does, a search snippet alone does not.

```sh
node hr-ops-linkedin.mjs login --sender-profile-url YOUR_PROFILE_URL
node hr-ops-linkedin.mjs preview PROSPECT_ID --draft DRAFT_ID --profile-url RECIPIENT_PROFILE_URL --sender-profile-url YOUR_PROFILE_URL --revision CURRENT_REVISION [--method message|connection_request|inmail]
node hr-ops-linkedin.mjs send PROSPECT_ID --draft DRAFT_ID --profile-url RECIPIENT_PROFILE_URL --sender-profile-url YOUR_PROFILE_URL --revision CURRENT_REVISION [--method ...] [--authorization FILE] [--daily-cap N]
```

These are command templates, not values to paste unchanged. `node hr-ops.mjs status COMPANY` supplies current IDs and revision. Preview is offline and creates no delivery attempt. An optional explicit browser installation, if missing, is `npx playwright install chromium`. Installation is never implicit.

### Methods

| Method | Use | Draft requirements | Stops when |
|---|---|---|---|
| `message` (default) | Existing connection | No subject; within `outreach.linkedin_max_chars` | No unique direct Message button or composer |
| `connection_request` | Not a connection | No subject; must fit the invitation note limit (200 characters free, 300 Premium) | Invitation already pending, no Connect option naming the person, no Add a note option, note field missing (personalized-invitation limit reached) or too short |
| `inmail` | Not a connection, paid | `subject` of up to 200 characters | No InMail composer with a subject field (no Premium or credits) |

The Connect control is matched by LinkedIn's label for that exact person, either on the profile or under More actions. A pending invitation counts as a confirmed connection request; it does not mean the person accepted.

### Login

Login is always human. `login` requires an interactive terminal, opens the dedicated browser at LinkedIn's sign-in page, waits for the human to sign in and complete any verification, then confirms that LinkedIn's own-profile redirect lands on the workspace sender profile. The session stays in the private browser profile for later sends. Agents never type, request or store credentials or verification codes.

### Agent-operated send

`send --authorization FILE` runs without a terminal. The file holds `{"actor":"human","reference":"...","statement":"..."}` quoting the user's actual instruction for this send or for a batch that includes it. The tool:

1. Opens the dedicated profile and follows LinkedIn's own-profile redirect. A login page or checkpoint stops the run with a request for a human login.
2. Verifies the sender profile URL and name, opens the recipient profile, verifies its name and prepares the method's form with the exact saved text. Existing composer or note text is never overwritten.
3. Records a content-bound review event with the user's instruction, then revalidates the approval revision, qualification, suppression, hold, draft freshness, firm hash, profile evidence, daily cap and form text under the workspace writer lock.
4. Persists an attempt receipt, clicks Send once and observes the page: the exact message as the last item in the conversation, or the invitation shown as pending.
5. When observed, records a normal `sent` event with `method` and the user's instruction, marks the receipt `tool_confirmed_sent` and exits 0. Otherwise it prints the receipt path and exits 3. Unconfirmed is never a reason to click again.

### Human-operated send

Without `--authorization`, `send` requires an interactive terminal. The human types OPEN, logs in privately if required, navigates to their own profile and types READY. After checking the visible sender, recipient, method and exact text, the human types `SEND DRAFT_ID`. The tool then follows the same review, revalidation, receipt and single-click steps. The human checks the conversation or invitation and types SENT only if it was actually sent, which records the `sent` event and marks the receipt `human_confirmed_sent`.

The recorded occurrence time in both modes is the browser click completion time, not a server delivery timestamp.

### Distinct messages

Repeated outreach text gets accounts flagged as spam. Before any click, the sender compares the draft with every earlier LinkedIn attempt receipt and recorded LinkedIn `sent` event in the workspace, ignoring case, punctuation and the recipient's name. A match stops the send; write a distinct message for that person.

### Daily cap

Every receipt, confirmed or not, counts toward a cap of 20 attempts per workspace per local day (the workspace timezone). `--daily-cap N` changes the cap for that invocation; raise it only deliberately.

## Storage and recovery

- Dedicated login session: `{DATA_ROOT}/local/browser-profiles/hr-ops-linkedin/`. Contains sensitive cookies. Git ignores local files; the HR backup manifest deliberately excludes this profile. Never export or copy it into captures or evidence.
- Attempt receipts: `{DATA_ROOT}/data/hr-ops/delivery-attempts/`. Include the method, operator (`human` or `agent`), approved exact text, recipient, authorization and outcome state. Normal HR backups include these receipts. Doctor does not certify remote delivery or validate LinkedIn's live UI.
- Pipeline history: a sent event is recorded only after a human confirmation or the tool's own observation of the sent result. A missing email address does not block LinkedIn sending.

Any existing attempt for the same draft blocks another attempt, whatever its method, including a timeout or process interruption. Never delete the receipt to retry. Inspect the actual conversation or invitations, then record an actual human-reported send through `hr-ops.mjs record` if necessary. A failure after a click may leave an unconfirmed receipt even when LinkedIn sent the message. A failure after the sent event but before receipt annotation must also be reconciled; existing sent events independently block replay. There is no automatic retry or exactly-once remote-delivery claim.

The core `send_enabled: false` output still means the core CLI and draft objects are not send APIs. Build information identifies this optional adapter separately. Email delivery, external CRM writes, purchases other than InMail credits the user chose to spend, group messages and unrequested sending remain unsupported.

## Tested scope

Tests cover plan binding, method and subject rules, repeated wording, recipient URL validation, draft freshness, holds and suppression, revision races, duplicate attempts, failed clicks, the daily cap, receipt operator and method, sent-event methods, CLI authorization checks, and a real Playwright browser against locally intercepted HTML for messages, InMail, connection requests (including the More actions menu, pending invitations and note limits) and own-profile login checks. Set `HR_OPS_TEST_CHROMIUM_CHANNEL=chrome` to run the browser fixtures with an installed Chrome instead of downloading Chromium. Tests never contact LinkedIn or send a real message.

The English LinkedIn DOM adapter is deliberately narrow. Its selectors for connection invitations, InMail and sent-message confirmation were written for the fixtures, not observed on the live site, and may stop on a changed layout, localization, account restriction, sign-in checkpoint or unavailable option. A supervised live run of each method is required before calling it operationally validated.
