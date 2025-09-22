// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabaseAdmin.ts'

// Compares wex_transactions vs receipts and flags missing receipts
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST' && req.method !== 'GET') return errorJson('Method not allowed', 405, origin)

  try {
    // Require manager
    const userClient = getUserClient(req)
    const { data: auth } = await userClient.auth.getUser()
    if (!auth?.user) return errorJson('Unauthorized', 401, origin)
    const { data: roleRow, error: rErr } = await userClient.from('users').select('role').eq('id', auth.user.id).single()
    if (rErr || roleRow?.role !== 'manager') return errorJson('Forbidden', 403, origin)

    const admin = getAdminClient()

    const url = new URL(req.url)
    const rangeDays = Number(url.searchParams.get('range_days') || '30')
    const tolerance = Number(url.searchParams.get('amount_tolerance') || '0.02') // $0.02
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().slice(0, 10)

    // Get recent WEX txns that have user_id mapping
    const { data: txns, error: txErr } = await admin
      .from('wex_transactions')
      .select('id, external_id, user_id, amount, transacted_at, merchant')
      .gte('transacted_at', sinceStr)
    if (txErr) return errorJson('Failed to fetch transactions: ' + txErr.message, 400, origin)

    const results: any[] = []

    for (const t of txns || []) {
      if (!t.user_id) continue
      // Does a receipt exist for same date and close amount?
      const { data: existing, error: exErr } = await admin
        .from('receipts')
        .select('id, status')
        .eq('user_id', t.user_id)
        .eq('date', t.transacted_at)
        .gte('total', (Number(t.amount) - tolerance).toFixed(2))
        .lte('total', (Number(t.amount) + tolerance).toFixed(2))
      if (exErr) continue

      if (!existing || existing.length === 0) {
        // Create a missing receipt entry
        const { data: inserted, error: insErr } = await admin
          .from('receipts')
          .insert({ user_id: t.user_id, date: t.transacted_at, total: t.amount, status: 'missing', image_url: null })
          .select('id, user_id, date, total, status')
          .single()
        if (!insErr && inserted) {
          results.push({ missing_for: t.external_id, receipt_id: inserted.id })
          // Optional: email notify officer
          const { data: urow } = await admin.from('users').select('email, name').eq('id', t.user_id).single()
          const token = Deno.env.get('POSTMARK_TOKEN')
          if (token && urow?.email) {
            await fetch('https://api.postmarkapp.com/email', {
              method: 'POST',
              headers: {
                'X-Postmark-Server-Token': token,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                From: 'no-reply@example.com',
                To: urow.email,
                Subject: 'Missing Gas Receipt',
                TextBody: `Hello ${urow.name || ''},\n\nWe detected a fuel transaction on ${t.transacted_at} for $${t.amount} (${t.merchant}) without a matching receipt. Please upload a receipt in GRTS.`,
              }),
            })
          }
        }
      }
    }

    return okJson({ missing_flagged: results.length, results })
  } catch (e: any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
