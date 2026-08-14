# Intake dry-run branch

The order preview in the Orders dashboard needs to know which orders intake
*would* create. That decision is made by an LLM reading the client's email
thread — there is no order-generation logic in the app or in Postgres to call.
Reimplementing it in the app would drift from the real run and would break the
"one source of truth" rule.

So the preview runs the **same workflow, same nodes**, and stops before it
writes anything.

## What is shared

`Webhook1` → `Set Inputs` → `Get Access Token` → `Get Emails` → `Code` →
`Strip HTML` → `Build Prompt` → `OpenAI - Clean & Translate Email1` →
`Prompt Builder` → `OpenAI Project Brief Generator` →
`Convert Open AI response to JSON` → `Filter` → `Order id generation`

Every node above runs identically in both modes. The two branches diverge only
at the point where the real run starts writing.

## What is skipped in dry-run mode

`Claim order (idempotent)`, `Create a click up task for each order`,
`Record ClickUp task`, the file upload loop, and `Mark intake complete`.

No order row, no ClickUp task, no `project_intake_runs` row, no change to
`questionnaire_received`.

## Wiring changes

**1. `Set Inputs`** — add three string fields so the dry-run flags survive:

| Name | Value |
|---|---|
| `dry_run` | `={{ $json.body.dry_run || false }}` |
| `job_id` | `={{ $json.body.job_id || "" }}` |
| `callback_url` | `={{ $json.body.callback_url || "" }}` |

**2. `Filter` → `Dry run?`** (new IF, replaces `Filter` → `Loop Over Items`)

- true (output 0) → `Order id generation`
- false (output 1) → `Loop Over Items`

In dry-run mode the batching loop is bypassed entirely, so
`Order id generation` receives every product at once. Its code is already
written as `items.map(...)` over the full array, so this needs no change to the
node.

**3. `Order id generation` → `Dry run? (post-naming)`** (new IF, replaces
`Order id generation` → `Claim order (idempotent)`)

- true (output 0) → `Build dry-run result` → `Post preview callback`
- false (output 1) → `Claim order (idempotent)`

This is the important one: the split happens *after* the orders have been named,
so the preview shows exactly the `product_name` values the real run would pass
to `claim_intake_order`.

## Environment

Point the app at the same webhook the real intake uses — the `dry_run` flag is
what selects the branch:

```
N8N_INTAKE_DRY_RUN_WEBHOOK_URL=https://<your-n8n>/webhook/ae605c37-1ef3-48f7-b20e-18d78025a3c8
N8N_CALLBACK_SECRET=<same secret /api/project-brief/callback uses>
```

## Nodes to import

`intake-dry-run-nodes.json` in this directory contains the three new nodes.
Import them into the existing workflow and connect as described above.

## Note on the webhook response mode

`Webhook1` currently responds immediately (`onReceived`), which is what the
Supabase `pg_net` trigger needs. Keep it that way — the dry run is asynchronous
too, and reports its result through the callback, not the HTTP response.
