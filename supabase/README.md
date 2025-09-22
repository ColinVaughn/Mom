# Supabase Edge Functions

Deploy these with the Supabase CLI. Ensure the following secrets are set:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY (used by Edge Functions to validate user JWTs)
- POSTMARK_TOKEN (for emails)
- SENDER_EMAIL (from-address for emails)
- WEX_API_BASE (optional if using polling)
- WEX_API_KEY (optional if using polling)
- WEX_WEBHOOK_SECRET (if using webhook)

Functions to deploy:
- upload-receipt
- get-receipts
- missing-receipts
- generate-pdf
- user-management
- wex-webhook
- wex-poll
- notify

Scheduling:
- Configure a Scheduled Function or Cron to invoke `wex-poll` daily.
