# MFD monitoring

Status: Grafana Cloud stack `zealousprairie1239` is connected. The `mfd-sync` hosted
scrape runs every 60 seconds. The dashboard is populated, the seven Grafana-managed
rules are installed in folder `fdwrsn`, group `mfd-sync`, and `app=mfd` routes to
contact point `MFD Email`. Grafana confirmed a successful test-notification send;
inbox delivery has not been independently confirmed. The monitoring token lives
only in Supabase secrets and the hosted scrape credential. No secrets are stored
in this repository. Exact log-ingest GB/quota is not part of these counters.

## Exact live configuration

`grafana-live-rules.yaml` is Grafana's export of the seven installed, unpaused rules.
`deployment.json` records the live rule IDs and datasource. The dashboard and rule
group were observed receiving real data and all seven rules evaluated Normal.
The following setup notes explain how to recreate the installation.

## AI connector

The AI connector Workers on Cloudflare are monitored separately through Cloudflare's
analytics API; see `connector/README.md` (dashboard "MFD AI Connector Health", rule group
`mfd-connector`, same `app=mfd` email routing).

## Connect

1. Sign in/create the Grafana Cloud Free stack. Supabase's official Grafana Cloud
   integration adds database CPU, IO, storage, WAL and query dashboards. Use its
   supplied integration workflow; keep all Supabase secrets out of browser app code.
2. Generate a separate random monitoring-only token with at least 32 random bytes.
   Set it as `MFD_METRICS_TOKEN` in Supabase Edge Function Secrets. Do not paste it
   into chat or commit it. The endpoint only accepts this token; it does not accept
   the service-role key as a scrape password. Rotation changes this one secret and
   the hosted scrape credential. Service-role credentials remain inside Supabase.
3. Add a 60-second HTTPS Prometheus scrape named `mfd-sync`:
   https://djyozltkmbzhwuvemxuy.supabase.co/functions/v1/mfd-metrics
   HTTP Basic username `metrics`, password the monitoring token. Limit scrape
   timeout to 15s. Scraping adds about 1,440 function invocations/day; check existing
   free allowances. It reads small counters, not historical logs.
4. Import `grafana-dashboard.json`, select the managed Prometheus datasource.
5. For another installation, create a folder and replace the folder/datasource UIDs in
   `grafana-alert-rules.json`. POST each rule object separately to Grafana's
   `/api/v1/provisioning/alert-rules` using an appropriately scoped admin credential,
   or create corresponding rules in the UI. `prometheus-alerts.yml` is an equivalent
   datasource-managed ruleset, not a Grafana dashboard import.
6. Configure an email contact point and notification policy for `app=mfd`.
   Choose/confirm the delivery address. Test the contact point, then temporarily
   lower a test rule threshold to trigger and resolve a test alert. Restore it.
   Do not call monitoring complete until a real notification is received.

## Coverage

Seven rules: conflict bursts, save storms, database rollback storms, slow saves,
connection saturation, missing exporter samples and missing sync series. Database rollback
metrics catch legacy clients and the previous internal retry failure; v2 counters
separate ordinary conflicts from successful writes. Thresholds suit the current
small group and should be revised as traffic grows. Mean duration is database RPC
execution only, not phone/network latency. Offline local changes cannot be seen by
the server; the app retains them and displays sync status.

No workout data, account IDs, query text, access tokens or personal names are metric
labels. Metrics function execution is denied to anon/authenticated users. The
private table has RLS with intentional default-deny (no end-user policies).
The narrowly privileged private counter helper validates auth.uid() and labels;
the workspace save remains SECURITY INVOKER and follows existing owner RLS.

Counter tables contain only two aggregate rows. They are not log storage.
Historical usage cannot be recovered by clearing logs. Existing Supabase logs age
out according to retention; ingestion already recorded stays for the billing cycle.
Exact log-ingest bytes/quota are not exported by this custom endpoint. Check the
Supabase Usage page and its billing notifications; do not confuse transaction
counts with GB or claim a quota alert that has not been connected.

## Incident response

Preserve local edits. Never disable revision checks, overwrite a workspace, clear
phone storage, or silence all error logging to hide an incident. Check the version,
RPC error, competing writers and circuit breaker. Business conflicts must not use
SQLSTATE 40001 on PostgREST 14. Legacy RPC uses PT409; v2 returns a conflict outcome.
The app permits at most two CAS attempts per pass, exponential delays up to 60s,
and pauses automatically after five failed passes until explicit Sync now/relogin.

References:
- https://supabase.com/docs/guides/observability/metrics/grafana-cloud
- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
- https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
