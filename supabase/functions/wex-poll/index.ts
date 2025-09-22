// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST' && req.method !== 'GET') return errorJson('Method not allowed', 405, origin)

  try {
    // Require server-side invocation: either service-role bearer token or a shared secret header
    const authz = req.headers.get('authorization') || ''
    const headerSecret = req.headers.get('x-cron-secret') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const cronSecret = Deno.env.get('CRON_SECRET') || ''
    const allowed = (serviceKey && authz === `Bearer ${serviceKey}`) || (cronSecret && headerSecret === cronSecret)
    if (!allowed) return errorJson('Forbidden', 403, origin)

    const base = Deno.env.get('WEX_API_BASE')
    const key = Deno.env.get('WEX_API_KEY')
    if (!base || !key) return errorJson('WEX polling not configured', 500, origin)

    const days = Number(new URL(req.url).searchParams.get('days') || '1')
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0,10)

    const url = `${base.replace(/\/$/, '')}/transactions?since=${since}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) return errorJson(`WEX API error: ${res.status}`, 502, origin)
    const items = await res.json() as any[]

    const admin = getAdminClient()
    for (const it of items) {
      const id = String(it.id)
      const amount = Number(it.amount)
      const date = String(it.date).slice(0,10)
      const card_last4 = (it.card_last4 || '').toString()
      const merchant = (it.merchant || '').toString()
      await admin.rpc('upsert_wex_transaction', {
        p_external_id: id,
        p_amount: amount,
        p_transacted_at: date,
        p_card_last4: card_last4,
        p_merchant: merchant,
        p_raw: it,
      })
    }

    // Trigger missing receipts reconciliation
    const mf = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/missing-receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    })
    if (!mf.ok) {
      // non-fatal
    }

    return okJson({ imported: items.length })
  } catch (e:any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
