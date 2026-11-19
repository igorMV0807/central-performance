# Architecture

## Goal

Centralize operational signals from payment-recovery automations and present them as actionable metrics, journeys, events, and alerts.

## Data flow

1. Payment platforms emit business events.
2. External automation workflows validate and persist normalized records.
3. PostgreSQL stores purchase journeys, recovery messages, events, and conversion evidence.
4. Next.js server-side modules load the records and apply attribution and quality rules.
5. Authenticated dashboard pages render summaries, funnels, tables, and alerts.

## Application layers

- `app/`: routes, authentication screens, and dashboard pages.
- `proxy.ts`: server-side session refresh for protected routes.
- `components/`: reusable navigation, filters, charts, metrics, and tables.
- `lib/data.ts`: server-only queries, pagination, business rules, and metric aggregation.
- `lib/perfectpay-email-analytics.ts`: PerfectPay-specific analytical rules.
- `lib/supabase/`: browser, server-session, and server-only admin clients.
- `types/`: shared domain contracts.

## Security boundary

The browser receives only the public Supabase URL and publishable key. Authentication is verified server-side. The service-role key is loaded only by server-only modules and must never be exposed through client code, logs, screenshots, or public deployment settings.

For a production implementation, database access should follow least privilege. Exposed tables should have Row Level Security enabled, and sensitive calculations should preferably move to restricted views or RPC functions rather than granting broad table access.

## Metric integrity

The application excludes known QA markers from business metrics, paginates database reads, validates recovery-flow values, and uses a bounded attribution window when relating recovery activity to conversions. Exact business rules remain reviewable in the server-side data layer.

## Portfolio boundary

This repository contains application code only. Production credentials, real customer records, media, infrastructure configuration, and operational logs are intentionally excluded.
