// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseAdmin.ts'

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i=0;i<a.length;i++) out |= a[i] ^ b[i]
  return out === 0
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorJson('Method not allowed', 405, origin)

  const secret = Deno.env.get('WEX_WEBHOOK_SECRET')
  if (!secret) return errorJson('Webhook not configured', 500, origin)

  const raw = await req.text()
  const sig = req.headers.get('x-wex-signature') || ''
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const provided = Uint8Array.from(atob(sig), c => c.charCodeAt(0))
  if (!timingSafeEqual(mac, provided)) return errorJson('Invalid signature', 401, origin)

  const payload = JSON.parse(raw)
  const admin = getAdminClient()

  // Expect payload like: { id, amount, date, card_last4, merchant, ... }
  const id = String(payload.id)
  const amount = Number(payload.amount)
  const transacted_at = String(payload.date).slice(0,10)
  const card_last4 = (payload.card_last4 || '').toString()
  const merchant = (payload.merchant || '').toString()

  const { data, error } = await admin.rpc('upsert_wex_transaction', {
    p_external_id: id,
    p_amount: amount,
    p_transacted_at: transacted_at,
    p_card_last4: card_last4,
    p_merchant: merchant,
    p_raw: payload,
  })
  if (error) return errorJson('Upsert failed: ' + error.message, 400, origin)

  return okJson({ ok: true, id: data })
})
