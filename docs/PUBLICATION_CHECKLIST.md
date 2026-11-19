# Public release checklist

Run this checklist before every public commit or demo.

## Secrets

- [ ] `.env.local` and every real environment file are absent.
- [ ] No Supabase service-role key, JWT, API token, webhook secret, or password is present.
- [ ] No secret appears in Git history, logs, screenshots, videos, or transcripts.
- [ ] Only placeholder values exist in `.env.example`.

## Data and privacy

- [ ] Names, emails, phone numbers, transaction IDs, and checkout URLs are synthetic.
- [ ] Screenshots and videos use fictional customers and values.
- [ ] Production exports, logs, database dumps, and media are excluded.
- [ ] The public copy is not connected to the production database.

## Supabase

- [ ] The publishable key is the only browser-visible key.
- [ ] The service-role key is used only by server-only code.
- [ ] Row Level Security is enabled on every table exposed through the Data API.
- [ ] Policies are tested with anonymous, authenticated, and unauthorized users.
- [ ] Access follows least privilege; sensitive views/functions are restricted.

## Application

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes with placeholder or isolated test configuration.
- [ ] Authentication and the allowlist deny unauthorized accounts.
- [ ] Error messages do not reveal credentials or customer data.
- [ ] Links and diagrams describe the public copy accurately.

## Final review

- [ ] Scan tracked files for secret-like patterns.
- [ ] Review the complete staged diff.
- [ ] Confirm that production was not changed, restarted, or redeployed.
