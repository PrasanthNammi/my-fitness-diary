# AI connector monitoring (Cloudflare Workers → Grafana)

Watches the AI connector Workers (`mfd-connect-staging`, and `mfd-connect` once production
exists) in the same Grafana Cloud stack as the sync monitoring (`zealousprairie1239`).
Cloudflare records every request's outcome and CPU time; Grafana reads those numbers from
Cloudflare's free GraphQL Analytics API through the Infinity data source. Nothing runs in
the Worker for this, and a request Cloudflare stops for CPU is still counted. No diary data,
user IDs or tokens are involved: only request counts, outcomes and CPU times per Worker.

Cost: free. Grafana Cloud Free + the Infinity plugin; Cloudflare's analytics API has no
charge. Alert evaluation adds a few API reads per minute, far below Cloudflare's API limits.

## Files

- `grafana-dashboard.json`: "MFD AI Connector Health". Requests per hour by outcome, CPU p50/p99
  against the 10 ms free limit, failed requests by reason, requests vs the free 100,000/day.
- `grafana-alert-rules.json`: four Grafana-managed rules, group `mfd-connector`, folder `fdwrsn`,
  label `app=mfd` (so they reach the existing `MFD Email` contact point):

| Rule | Fires when | Severity |
|---|---|---|
| AI connector stopped for exceeding CPU | any request with outcome `exceededResources` in the last hour | warning |
| AI connector crashed | any `scriptThrewException` or `internalError` in the last hour | warning |
| AI connector above half the free daily requests | more than 50,000 requests in 24 h | info |
| AI connector worst-case CPU above 10 ms for 6 h | p99 CPU above 10,000 µs over 6 h | info, **paused**: cold starts keep p99 near 20 ms; use the CPU panel |

No data means no requests, so the error rules use `noDataState: OK`; a broken data source
still alerts through `execErrState: Alerting`.

Dates in alert queries: Grafana's `${__from:date:iso}` is not filled in when alerts evaluate,
and Infinity fills only the first macro inside the GraphQL variables. The rules therefore put
Infinity's `${__timeFrom:date:iso}` / `${__timeTo:date:iso}` directly in the query text. The
dashboard keeps `${__from:date:iso}`, which the browser fills in.

Live (2026-11-03): data source UID `eg36t5gvapybkf`, rule IDs in `../deployment.json` under
`connector_rules`. On the first day the p99 CPU rule fired (about 19.5 ms over 6 h on staging;
typical requests under 10 ms; no request stopped).

## Setup (about 10 minutes)

1. **Cloudflare token (read-only).** Cloudflare dashboard → My Profile → API Tokens →
   Create Token → Custom token. Permission: *Account → Account Analytics → Read*.
   Account resources: *Include → Shanustylish777@gmail.com's Account*. Create and copy it.
   It can read statistics only; it cannot change Workers or read any data. Don't paste it
   into chats or commit it.
2. **Infinity data source.** Grafana → Connections → Add new connection → Infinity →
   Install (free), then Add new data source. Authentication: *Bearer token*, paste the token.
   Allowed hosts: `https://api.cloudflare.com`. Name it `Cloudflare analytics`. Save & test.
   Note its UID (in the URL of the data source page).
3. **Dashboard.** Dashboards → New → Import → upload `grafana-dashboard.json` → choose the
   `Cloudflare analytics` data source. Check the panels show the last 24 h of staging traffic.
4. **Alert rules.** In `grafana-alert-rules.json`, replace `CLOUDFLARE_INFINITY_UID` with the
   data source UID, then create each rule (POST each object to
   `/api/v1/provisioning/alert-rules`, or recreate in the UI), like the sync rules.
5. **Verify.** In each rule's preview, the query must return rows (or no rows, never an
   error). Temporarily lower the CPU rule to `0` ms to see a test notification arrive, then
   restore `10000`. Record the rule IDs in `../deployment.json` under `connector_rules`.

## Prompt for a chat that has the Grafana connector

> Set up the MFD AI connector monitoring described in
> `my-fitness-diary/monitoring/connector/README.md` in my Grafana Cloud stack
> zealousprairie1239. The Infinity data source "Cloudflare analytics" already exists
> (I added the token myself). Import `grafana-dashboard.json` using that data source,
> create the four rules from `grafana-alert-rules.json` with `CLOUDFLARE_INFINITY_UID`
> replaced by its UID in folder `fdwrsn`, group `mfd-connector`, and confirm each rule's
> query returns data without errors. Check that `${__from:date:iso}` / `${__to:date:iso}`
> are filled in when alerts evaluate; if not, use the Infinity data source's own time
> macros instead. Don't change the existing `mfd-sync` rules or contact point. Report
> the rule IDs.

## When it fires

- *Stopped for exceeding CPU*: AI calls failed (never billed, no data damage: writes are one
  database step, and repeats with the same request id don't duplicate). If it happens
  regularly, slim the connector bundle (most CPU is first-use code loading of the OAuth
  library in fresh Worker copies; the connector's own work is under 1 ms).
- *Crashed*: run `npx wrangler tail <worker> --format json` and reproduce.
- *Request volume*: look for a client looping; the per-user rate limit and the 30 adds/day
  cap still apply.
