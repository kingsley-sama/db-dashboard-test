# n8n Workflow Specification: Project Email Context Retrieval & Summary

## 1. Purpose

When a Project Manager (PM) leaves the company or goes on leave, their email inbox holds
undocumented context about the projects they ran — client preferences, informal decisions,
scope changes — that never made it into the project management system. This workflow lets
any authorized user trigger a lookup by `project_id` and receive:

1. A detailed AI-generated summary of the project's email history, with special emphasis on
   **context that is not otherwise documented** (informal decisions, verbal-agreement-style
   exchanges, preference changes, complaints, off-the-record scope changes).
2. The full raw email thread as a clean, readable **Markdown (.md)** file, suitable both for
   a human to read and for pasting into another LLM later.

This is an **asynchronous** workflow: the initial trigger returns immediately with an
acknowledgment, and the real result (summary + file) is delivered later via an HTTP callback
to a URL supplied by the caller.

---

## 2. High-Level Flow

```
Trigger Webhook (project_id + callback_url)
        │
        ▼
Respond immediately: {status: "processing", job_id}
        │
        ▼
Look up project in Supabase → get assigned PM
        │
        ▼
Look up PM's stored OAuth token in Supabase → refresh if expired
        │
        ▼
Connect to PM's Microsoft 365 mailbox (Microsoft Graph API)
        │
        ▼
Search "Ongoing Projects" folder for subfolder named after project_id
   → if not found, search "Completed Projects" folder
        │
        ▼
Fetch all emails in the matched folder (full thread, chronological)
        │
        ▼
Build two things from the same email set:
   (a) Markdown raw-thread document
   (b) Prompt payload for LLM summarization
        │
        ▼
Call LLM (Anthropic API) with structured summarization prompt
        │
        ▼
Base64-encode the Markdown file
        │
        ▼
POST to callback_url: {project_id, job_id, status, summary, raw_thread_file (base64), metadata}
        │
        ▼
(On any failure at any stage) → POST error payload to callback_url instead
```

---

## 3. Trigger: Webhook Node

**Method:** `POST`
**Path suggestion:** `/webhook/project-email-summary`

### Expected request body

```json
{
  "project_id": "PRJ-1042",
  "callback_url": "https://developer-backend.example.com/api/n8n-callbacks/email-summary",
  "requested_by": "user_id_or_email_optional"
}
```

| Field | Required | Notes |
|---|---|---|
| `project_id` | Yes | Must match the folder-naming convention used in the mailbox (see §6). |
| `callback_url` | Yes | Must be a valid HTTPS URL. The workflow will POST the final result here. |
| `requested_by` | No | Passed through untouched into the callback payload for the frontend's own audit/logging use — the workflow does not act on it. |

### Validation (before doing anything else)
- Reject (respond `400` synchronously, do **not** proceed) if `project_id` or `callback_url`
  is missing, or if `callback_url` is not `https://`.
- **Judgment call:** I recommend rejecting `http://` callback URLs outright to avoid sending
  project data over plaintext. Confirm if you want to allow `http://` for local dev/testing.

### Immediate response (synchronous, before the long-running work)

```json
{
  "status": "processing",
  "job_id": "<generated UUID>",
  "project_id": "PRJ-1042",
  "message": "Your request is being processed. Results will be sent to the provided callback_url."
}
```

Generate `job_id` with a UUID function/node immediately after validation, and carry it through
every subsequent step so it can be included in the final callback and in any logging.

**Implementation note for the LLM building this:** in n8n, use a `Respond to Webhook` node
set to fire right after validation/job_id generation, with "Response Mode" on the Webhook node
set to allow continued execution afterward (n8n supports responding early and continuing the
workflow in the background when the Webhook node's response mode is set to "Using Respond to
Webhook Node" combined with the workflow continuing asynchronously). If the target n8n version/
setup doesn't cleanly support responding-then-continuing in one workflow, use two workflows:
Workflow A (webhook, validates, responds immediately, then calls Workflow B via "Execute
Workflow" node fired-and-not-awaited, passing all needed data). Workflow B does all the heavy
lifting and owns the callback POST at the end. **This two-workflow split is the safer,
more explicit pattern — recommend defaulting to it.**

---

## 4. Step: Look Up Project & PM (Supabase)

**Node type:** Supabase node (or HTTP Request to Supabase REST/PostgREST if more control is needed)

Query the projects table by `project_id` to retrieve at minimum:
- `project_manager` (foreign key to the PM/user table)
- project status (ongoing/completed) — **useful optimization**: if status is known, you can
  search only the relevant mailbox folder first instead of always checking both (see §6).
- `project_name` (nice-to-have, include in the final summary output for readability)

### Query

```sql
select project_id, project_name, project_manager
from projects
where project_id = :project_id
```

**Note:** this query doesn't select a `status` column, since it wasn't in the confirmed
field list above. If a status column exists under a different name, add it here — otherwise
§6's "check likely folder first" optimization isn't possible and the workflow should just
check both the Ongoing and Completed folders every time.

**Error handling:** If no project is found, stop the workflow and send a callback with:
```json
{
  "status": "error",
  "job_id": "...",
  "project_id": "PRJ-1042",
  "error": "PROJECT_NOT_FOUND",
  "message": "No project found with the given project_id."
}
```

Then, using `project_manager`, fetch the PM's record to get their mailbox email address (e.g.
from a `users` or `project_managers` table — `mailbox_email` field, placeholder name). This
is the address used to resolve which mailbox to sign into.

**Open item for you to confirm:** `project_manager` — is this a foreign key (an ID pointing
to a row in a users/PMs table), or does the `projects` table store the PM's email/name
directly? If it's an ID, confirm the table it references and the exact column holding the
mailbox email address. The doc assumes it's an FK requiring a lookup; if it already contains
the email directly, §5 can skip straight to token lookup.

---

## 5. Step: Authenticate into the PM's Mailbox (Microsoft Graph, OAuth)

Since tokens are OAuth, pre-generated per PM, and stored in Supabase, this workflow reads the
token rather than performing an interactive OAuth flow.

### Suggested Supabase table schema: `pm_mailbox_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `project_manager` | uuid, FK → PM/user table | one row per PM (matches `projects.project_manager`) |
| `mailbox_email` | text | the M365 mailbox address |
| `access_token` | text | short-lived Graph API token |
| `refresh_token` | text | used to mint new access tokens |
| `token_expires_at` | timestamptz | check before use |
| `tenant_id` | text | Azure AD tenant, if multi-tenant |
| `updated_at` | timestamptz | last refresh time |

**Security note:** these are sensitive credentials. Confirm whether Supabase row-level
security is enabled on this table and whether tokens should be encrypted at rest — this is
a decision for whoever owns your Supabase security policy, flagging it rather than assuming.

### Flow
1. Fetch the row for `project_manager`.
2. Check `token_expires_at`. If expired (or expiring within a safety buffer, e.g. 5 minutes):
   - Call Microsoft's OAuth token endpoint (`https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token`)
     with `grant_type=refresh_token` to get a new `access_token`.
   - Update the Supabase row with the new token and expiry.
3. Use the valid `access_token` as a Bearer token for all subsequent Microsoft Graph API calls.

**If no token row exists for this PM, or the refresh fails** (e.g. PM's account was fully
deprovisioned): stop and send an error callback:
```json
{
  "status": "error",
  "job_id": "...",
  "project_id": "PRJ-1042",
  "error": "MAILBOX_AUTH_FAILED",
  "message": "Could not authenticate to the PM's mailbox. Their access may have been revoked."
}
```

This is an important edge case for this business specifically: a PM who has *left the
company* may have had their M365 account disabled entirely, which would break this exact
scenario. **Flagging this for your decision:** do you want a fallback here — e.g. a shared
"mailbox archive" admin account, or delegated/shared-mailbox access set up in advance for
departing PMs, so their mail remains queryable after offboarding? Recommend addressing this
at the IT-offboarding-process level (grant an admin/service account delegated access to a
PM's mailbox as one of the offboarding steps), rather than in this workflow.

---

## 6. Step: Locate the Project's Email Folder

Use the Microsoft Graph API (`GET /users/{mailbox_email}/mailFolders`) to:

1. Find the folder named **"Ongoing Projects"** (or your exact folder name — confirm exact
   spelling/casing used in practice).
2. Find the folder named **"Completed Projects"**.
3. Within each, list child folders (`GET /mailFolders/{id}/childFolders`) and match one whose
   `displayName` equals `project_id` exactly.

**Search order optimization:** if the project's `status` from §4 is known, check that
matching folder first (ongoing → check Ongoing Projects first; completed → check Completed
first) and only fall back to the other if not found — saves an API call in the common case.

**If no matching folder is found in either location:** stop and send an error callback:
```json
{
  "status": "error",
  "job_id": "...",
  "project_id": "PRJ-1042",
  "error": "PROJECT_FOLDER_NOT_FOUND",
  "message": "No folder named 'PRJ-1042' was found in Ongoing or Completed Projects."
}
```

**Open item to confirm:** Is the folder naming *exactly* the project_id (e.g. `PRJ-1042`), or
some variant (e.g. `PRJ-1042 - Sunset Villas`)? If it's not an exact match, folder lookup needs
to do a "starts with" or "contains" match instead of equality — please confirm the real-world
naming convention so the LLM building this doesn't guess wrong.

---

## 7. Step: Extract All Emails in the Folder

Once the folder ID is known:

1. `GET /mailFolders/{folderId}/messages` with pagination (`$top`, `@odata.nextLink`) to
   retrieve **all** messages, not just the first page — project folders could hold hundreds
   of emails per your earlier answer.
2. For each message, retrieve at minimum: `subject`, `from`, `toRecipients`, `ccRecipients`,
   `sentDateTime`, `body` (prefer `body.content` with `contentType=text`, or convert from HTML
   to plain text/Markdown — see §8), and whether it has attachments (`hasAttachments`).
3. Sort all messages chronologically (oldest first) — this matters both for the raw thread
   file's readability and for giving the LLM the conversation in the order it actually happened.

**Attachments:** Per your original brief, attachments weren't mentioned as in-scope. My
recommendation: **don't download/include attachment contents** in this version — just note in
the raw thread file when a message had an attachment (filename only, if available), so a human
knows to go look at it manually later. Downloading and summarizing every attached drawing/PDF
is a meaningfully larger feature; flagging it as a possible v2 rather than building it now.
**Confirm this is acceptable**, or let me know if attachments should be pulled in now.

---

## 8. Step: Build the Raw Thread Markdown File

Generate one Markdown document with a consistent, parseable structure — readable by a human
and easy for an LLM to re-ingest later. Suggested structure:

```markdown
# Email Thread Export — Project PRJ-1042 (Sunset Villas)
Exported: 2026-07-06T14:32:00Z
Total messages: 87
Mailbox: jane.pm@company.com
Folder: Ongoing Projects / PRJ-1042

---

## 1. [2025-11-03 09:14] Subject: Initial brief from client
**From:** client@realestateco.com
**To:** jane.pm@company.com
**Cc:** —

Hi Jane, following up on our call, we'd like the lobby to feel more...

---

## 2. [2025-11-03 15:40] Subject: RE: Initial brief from client
**From:** jane.pm@company.com
**To:** client@realestateco.com
**Cc:** designer@company.com

Thanks, noted. One thing to flag — attachment present (floorplan_v2.pdf, not included in this export)

---
```

Each email becomes a numbered section with: sequence number, timestamp, subject, from/to/cc,
attachment flag, and body text (HTML stripped to clean text/Markdown — use an HTML-to-text or
HTML-to-Markdown conversion step, since Graph API bodies are usually HTML).

**Filename convention:** `PRJ-1042_email_thread_2026-07-06.md`

Why Markdown over plain `.txt` (per your decision): headers give it structure a human can
scan quickly, and the same structure gives a downstream LLM clean delimiters between messages
— it's still plain text underneath, so it loses none of the simplicity of `.txt`.

---

## 9. Step: LLM Summarization

**Node type:** HTTP Request to Anthropic API (`POST https://api.anthropic.com/v1/messages`),
or the n8n Anthropic/Claude node if using one already configured with credentials.

### Prompt design (critical — this is the core value of the whole workflow)

The prompt must explicitly instruct the model to prioritize **non-obvious context** over
restating facts already tracked elsewhere. Suggested system/task instructions:

```
You are analyzing the full email thread for a real estate 3D-rendering project. The obvious
project facts (client name, basic timeline, deliverables) are likely already tracked in the
project management system. Your job is to surface what is NOT obvious or NOT already
documented elsewhere — the kind of context a new Project Manager taking over this project
would desperately need but wouldn't find anywhere else.

Prioritize surfacing:
- Informal decisions or approvals made only "over email" (never formalized in a brief/ticket)
- Client preference changes or reversals, especially subtle or implied ones
- Anything the client expressed dissatisfaction or hesitation about
- Scope creep, informal scope changes, or "just this once" exceptions granted
- Commitments, promises, or deadlines mentioned casually in passing
- Relationship/tone context (e.g. client is slow to respond, prefers calls over email,
  a particular stakeholder is the real decision-maker even if not the main contact)
- Any unresolved questions or open threads left hanging

Still include standard facts for completeness (client, designer assigned, key milestones,
current status) but keep that part brief — the majority of the summary should focus on the
non-obvious context above.

Structure your output as:
1. Quick Facts (2-4 lines max)
2. Key Undocumented Context (the main section — be thorough)
3. Open Questions / Loose Ends
4. Notable Quotes or Moments (paraphrased, not verbatim — do not quote source emails directly)

Email thread follows, in chronological order:
[FULL THREAD TEXT OR MARKDOWN FILE CONTENT HERE]
```

**Important technical constraint:** Section 4 above says "paraphrased, not verbatim" —
this is intentional and should not be changed. Even though this is your own company's private
email data (not public copyrighted material), it's still good practice for the summary to
restate rather than quote at length, so it reads as a synthesis rather than a copy-paste.

**Token limits:** If a project has hundreds of emails, the full thread text may exceed a
single context window. **Decision point for you:** should the workflow (a) send the whole
thing and rely on the model's large context window, (b) chunk the thread and summarize in
batches then do a final "summary of summaries" pass, or (c) cap at the most recent N months
of emails? I'd recommend starting with (a) since modern Claude models handle very long
contexts well, and only add chunking (b) later if you find summaries are ever getting
truncated in practice. Confirm this default is acceptable.

---

## 10. Step: Assemble & Send the Callback

Base64-encode the Markdown file content, then `POST` to the `callback_url` provided in the
original trigger request.

### Success payload

```json
{
  "status": "success",
  "job_id": "<uuid>",
  "project_id": "PRJ-1042",
  "project_name": "Sunset Villas",
  "pm": {
    "mailbox_email": "jane.pm@company.com"
  },
  "summary": {
    "quick_facts": "...",
    "key_undocumented_context": "...",
    "open_questions": "...",
    "notable_moments": "..."
  },
  "raw_thread_file": {
    "filename": "PRJ-1042_email_thread_2026-07-06.md",
    "mime_type": "text/markdown",
    "encoding": "base64",
    "content": "<base64 string>"
  },
  "metadata": {
    "email_count": 87,
    "date_range": {
      "earliest": "2025-11-03T09:14:00Z",
      "latest": "2026-06-30T17:02:00Z"
    },
    "generated_at": "2026-07-06T14:35:12Z"
  }
}
```

**Splitting `summary` into structured fields** (rather than one long string) is a deliberate
suggestion so the frontend developer can render each section separately in the UI. Confirm
this structure works for however the frontend intends to display it, or let me know if you'd
rather receive it as a single Markdown/text blob instead.

### Error payload (any failure stage)

```json
{
  "status": "error",
  "job_id": "<uuid>",
  "project_id": "PRJ-1042",
  "error": "<ERROR_CODE>",
  "message": "<human-readable explanation>"
}
```

Error codes to standardize on: `PROJECT_NOT_FOUND`, `MAILBOX_AUTH_FAILED`,
`PROJECT_FOLDER_NOT_FOUND`, `LLM_SUMMARIZATION_FAILED`, `CALLBACK_DELIVERY_FAILED` (log this
one internally since by definition you can't deliver it to the callback), `UNKNOWN_ERROR`.

**Retry logic:** Recommend the callback POST retries up to 3 times with exponential backoff
if the developer's endpoint doesn't respond with a 2xx. If all retries fail, log the full
result payload somewhere durable (a Supabase table, e.g. `email_summary_job_logs`) so it isn't
silently lost — the frontend team can still retrieve it manually if their callback endpoint
was down.

---

## 11. Suggested Supabase Logging Table (for observability)

Recommended even though not explicitly requested — without this, a failed job is invisible.

### `email_summary_jobs`

| Column | Type | Notes |
|---|---|---|
| `job_id` | uuid, PK | |
| `project_id` | text | |
| `status` | text | `processing` / `success` / `error` |
| `error_code` | text, nullable | |
| `requested_by` | text, nullable | |
| `callback_url` | text | |
| `result_payload` | jsonb, nullable | full payload sent, for replay if callback delivery fails |
| `created_at` | timestamptz | |
| `completed_at` | timestamptz, nullable | |

Write a `processing` row right after job_id generation, and update it to `success`/`error`
at the end. **This write must be an upsert on `job_id`, not a plain insert** — a re-run that
reuses a job_id (n8n test executions with pinned data, a retried trigger, or the dashboard
having already upserted its own row for the same job) must reset the existing row back to
`processing` instead of failing with a `email_summary_jobs_pkey` duplicate-key violation.
Via PostgREST/Supabase HTTP: `POST /rest/v1/email_summary_jobs?on_conflict=job_id` with header
`Prefer: resolution=merge-duplicates`; via a Postgres node:
`INSERT ... ON CONFLICT (job_id) DO UPDATE SET status='processing', error_code=null,
result_payload=null, completed_at=null`. This also gives you a natural audit trail of who requested context on which
project and when — useful in its own right for this company's use case.

---

## 12. Open Decisions Summary (please confirm before build)

1. Reject `http://` (non-HTTPS) callback URLs outright — OK?
2. Confirm exact Supabase table/column names for `projects` and PM/mailbox mapping.
3. Confirm exact folder-naming convention in the mailbox (exact match on `project_id`, or
   does it include extra text like a project name?).
4. Confirm exact display names of the two parent folders ("Ongoing Projects" /
   "Completed Projects" — capitalization/wording as it exists in the real mailbox).
5. Attachments: excluded from this version (filename noted only) — OK for v1?
6. Offboarded/disabled PM accounts: how should mailbox access be preserved? (Recommend
   solving via an IT offboarding step — delegated access for an admin account — rather than
   in-workflow.)
7. Long threads exceeding context limits: default to sending the full thread as-is (no
   chunking) for v1 — OK, or do you want chunking/summary-of-summaries built in now?
8. Summary delivered as structured fields (quick_facts / key_context / open_questions /
   notable_moments) vs one combined text blob — which does the frontend want?
9. Two-workflow split (trigger workflow + processing workflow, chained via Execute Workflow)
   recommended for reliably responding early then continuing async — confirm this is fine
   given your n8n setup/version.

---

## 13. Node-by-Node Build Checklist (for the LLM generating the JSON)

1. **Webhook** (Workflow A) — POST, validates `project_id` + `callback_url`.
2. **Function/Code node** — generate `job_id` (UUID), validate `callback_url` scheme.
3. **IF node** — validation failed → Respond to Webhook (400) and stop.
4. **Respond to Webhook** — success path, immediate `processing` ack.
5. **Execute Workflow node** — fires Workflow B, passing `project_id`, `job_id`,
   `callback_url`, `requested_by`. Do not wait for completion if avoidable, or accept the
   slight delay if the n8n setup requires waiting — either way Workflow A has already
   responded to the original caller.
6. *(Workflow B starts here)* **Supabase/HTTP node** — upsert the `processing` row into
   `email_summary_jobs` (`on_conflict=job_id`, `Prefer: resolution=merge-duplicates` — never a
   plain insert, see §11), then **Supabase node** — fetch project by `project_id`.
7. **IF node** — not found → build error payload → HTTP Request (callback) → stop.
8. **Supabase node** — fetch PM mailbox token row by `project_manager`.
9. **IF/Code node** — check token expiry; **HTTP Request node** — refresh token via Microsoft
   OAuth endpoint if needed; **Supabase node** — update token row.
10. **IF node** — auth failed → error payload → callback → stop.
11. **HTTP Request node(s)** — Microsoft Graph: list mail folders, find "Ongoing
    Projects"/"Completed Projects", find child folder matching `project_id`.
12. **IF node** — folder not found → error payload → callback → stop.
13. **HTTP Request node** (paginated loop) — fetch all messages in the matched folder.
14. **Code node** — sort chronologically, strip HTML to clean text, build the Markdown
    document structure described in §8.
15. **HTTP Request node** — call Anthropic API with the summarization prompt (§9) and the
    assembled thread content.
16. **Code node** — parse LLM response into the structured summary fields; base64-encode the
    Markdown file content.
17. **Supabase node** — update `email_summary_jobs` row to `success` (or `error`) with full
    payload logged.
18. **HTTP Request node** — POST final payload to `callback_url`, with retry logic (3
    attempts, exponential backoff).
19. **IF node** — all retries failed → log durably (Supabase) for manual recovery.
