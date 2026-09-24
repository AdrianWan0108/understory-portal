# AI Workspace integration

AI Workspace is an internal task and audit layer for Operations, Content, Research, Creative Designer, and Growth Analyst. The existing `division_tasks` project records and `tasks` social posts remain canonical. AI output stays in service-only tables as a versioned internal draft. A completed AI run does not approve, schedule, publish, or expose a social post to clients.

## Deployment

1. Apply `supabase/migrations/20260916000000_add_ai_workspace.sql` with the repository's normal Supabase migration process. It is additive; it does not rewrite existing content or assistant history.
2. Provision Supabase Auth users for Adrian and Karen and set each corresponding `public.profiles.user_id` to the Auth user UUID. Their profile `role` must be `owner`. Team Hub's existing username cookie is insufficient for AI Workspace authorization. Staff and contractors need their own linked Auth users before they can open an assigned AI task link.
3. Set `N8N_WEBHOOK_BASE_URL` and a random `N8N_PORTAL_SHARED_SECRET` of at least 32 bytes on the portal and in n8n. Set `FRONTEND_URL` to the canonical HTTPS portal origin. Keep model provider keys in n8n. The existing direct assistant chat still uses the portal's provider keys until it is separately migrated.
4. Create n8n handlers at `/ai-task`, `/ai-approval-decision`, and `/ai-health` relative to `N8N_WEBHOOK_BASE_URL`. Configure n8n to use the event and context endpoints below.
5. Set agent routes, allowed tools and actions, provider and agent monthly limits, permitted clients and projects, Slack channels, schedules, and context sources in AI Workspace Settings. High-risk actions are disabled by default and still require an owner approval if enabled. The portal checks limits when work is requested; n8n must check the supplied limits again before **each** provider stage.

No database migration or external workflow has been applied by this repository change. `AI_WORKSPACE_DEMO=1` enables the explicit demo endpoint only while `NODE_ENV=development`.

## Authentication and authorization

AI Workspace routes have their own Supabase Auth gate and do not rely on the Team Hub username cookie. Browser requests send a Supabase Auth access token in `Authorization: Bearer …`. The API verifies it with Supabase Auth, maps `auth.users.id` to `profiles.user_id`, and then uses a server-only service-role client. The AI tables have RLS enabled and no browser policies; grants to `anon` and `authenticated` are revoked. Owner endpoints check `role='owner'` on every request. Staff task reads require requester, assignee, or project/content assignment, watch, or mention membership. Contractors receive only assigned tasks and no provider usage or raw task inputs. Client roles cannot reach AI Workspace APIs.

## Signed n8n contract

Every POST body is UTF-8 JSON. Set `x-ai-timestamp` to Unix seconds and `x-ai-signature` to lowercase hex `HMAC_SHA256(shared_secret, timestamp + "." + raw_body)`. The portal rejects signatures outside a five-minute window. Include stable `task_id`, `run_id`, `correlation_id`, and `idempotency_key` on every workflow execution and callback. Never log the shared secret or full client payload.

When the portal creates a task, it sends `POST {base}/ai-task` with the IDs, agent key, signed context URL, exact portal deep link, and a `slack_notification` object. n8n should publish the notification to the configured channel, retain one channel/message/thread identity, and update that thread as the task progresses. The message already includes client, task title, agent/status, requester, date, short objective, and exact portal task link. Report the Slack IDs and permalink in a task event so the portal stores them.

For a Slack, schedule, webhook, or system trigger that starts in n8n, use signed `POST /api/integrations/n8n/tasks`. Supply `schema_version: 1`, stable `task_id`, `run_id`, `event_id`, `correlation_id`, `trigger_source`, and a `task` object matching `createAiTaskSchema`. Slack requests require `slack_user_id` mapped to an owner profile; other triggers require `requester_profile_id` for an owner. The portal validates the agent, linked client/project/content, assignee, and current usage limits, then returns the durable task and run IDs. n8n must create the task before calling a provider.

To fetch context, n8n calls `GET /api/ai/tasks/{taskId}/context` with `x-ai-run-id`, `x-ai-timestamp`, and `x-ai-signature = HMAC_SHA256(shared_secret, timestamp + "." + "GET:{taskId}:{runId}")`. The run must belong to the task. Context contains only the linked client, project, existing content item, and that agent's configuration. The context endpoint never returns provider keys or other clients' data.

The first read-only tool endpoint is `POST /api/integrations/n8n/tools/tasks`. It uses the same raw-body HMAC authentication as the other n8n POST integrations and reads an explicit operational field set from `public.tasks`; it never writes task data and does not return captions. A tool `project_id` maps to `tasks.division_task_id`. Every request is constrained by the AI task's linked client/project context and the assigned agent's `allowed_tools`, `permitted_client_ids`, and `permitted_project_ids` configuration before filters are applied.

Report stage changes to `POST /api/integrations/n8n/task-events` using the same POST signature. Body schema version is `1`; required fields are `event_id`, `task_id`, `run_id`, `correlation_id`, `idempotency_key`, `trigger_source`, `status`, and `summary`. Give each distinct stage event its own stable idempotency key; reuse both its `event_id` and key when retrying that event. Use `queued`, `running`, `completed`, `failed`, `partial`, `refused`, or `timed_out` for run status. Include `stage`, `workflow_execution_id`, provider/model, decision summary, tool actions, usage and latency when available. A completed event must contain a validated versioned `output` or `approval`. The database applies each event in one transaction and increments output version only once.

Structured output `kind` values are `project_task`, `content_suggestion`, `research_result`, `creative_brief`, `analytics_insight`, `operations_result`, `slack_response`, and `approval_request`, all with `schema_version: 1`. Approval requests include a machine-readable `action_type` and a human-readable requested and downstream action. Use the Zod definitions in `lib/ai-workspace/schemas.ts` as the exact contract. Send concise user-visible decision summaries, citations, and tool actions. Never send or store hidden chain-of-thought. SQL or JavaScript must calculate metrics, dates, totals, percentages, and status transitions; model text may interpret them.

An approval event creates a central request. The portal sends the signed decision to `POST {base}/ai-approval-decision` with the same task/run/correlation IDs and a decision of `approved`, `changes_requested`, or `rejected`. Only an owner can decide. n8n must wait for an approved decision before any high-risk action: client messages, publishing or scheduling, deadlines or scope commitments, ad changes, deletion, financial changes, or final client reports. The portal itself has no code to perform these external actions. n8n must use the approval ID and idempotency key before resuming an external action.

When n8n receives an interactive Slack decision, call signed `POST /api/integrations/n8n/approval-decisions` with `schema_version: 1`, `approval_id`, the verified `slack_user_id`, decision, comment, and stable idempotency key. The portal checks that Slack ID against an owner profile and records the decision atomically. n8n then resumes the matching execution using the returned task/run IDs. Do not accept a Slack display name or message text as proof of identity.

For failed tasks, `POST /api/ai/tasks/{taskId}/retry` creates a new run and sends `retry_from_stage` plus `do_not_repeat_external_actions: true` to n8n. The portal refuses automatic retry if the previous run recorded a successful tool action. n8n must also deduplicate side effects by stable keys. `POST {base}/ai-health` should return 2xx for the Settings connection test.

## Figma and social content

Creative output is stored as an internal draft in `ai_tasks` and the one-to-one `ai_content_designs` record for an existing social post. Only a `worker` provider event marked `worker_delivered` can store generated Figma links. Owners can attach a Figma file manually from the task detail. There is no direct social publishing, Google Ads mutation, client messaging, browser automation, or Figma creation node in the portal.

Content item actions in the existing calendar open a prelinked AI task request. Production due date and publication date remain separate in the output schema and existing post. Human promotion through the current content and client review workflow is still required.
