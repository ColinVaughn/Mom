// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabaseAdmin.ts'

// Reconciliation: compares wex_transactions vs receipts and flags items for review
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
    // Use both absolute and relative tolerance; choose the larger for each txn/receipt
    const tolDollars = Number(url.searchParams.get('amount_tol_dollars') || '1') // $1.00
    const tolPercent = Number(url.searchParams.get('amount_tol_percent') || '5') // 5%
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().slice(0, 10)

    // Get recent WEX txns that have user_id mapping
    const { data: txns, error: txErr } = await admin
      .from('wex_transactions')
      .select('id, external_id, user_id, amount, transacted_at, merchant')
      .gte('transacted_at', sinceStr)
    if (txErr) return errorJson('Failed to fetch transactions: ' + txErr.message, 400, origin)

    const results: any[] = []

    // 1) Forward check: transactions without receipts -> create pending_review placeholder (no image)
    for (const t of txns || []) {
      if (!t.user_id) continue
      const tol = Math.max(tolDollars, Math.abs(Number(t.amount)) * (tolPercent / 100))
      const minAmt = (Number(t.amount) - tol).toFixed(2)
      const maxAmt = (Number(t.amount) + tol).toFixed(2)
      const { data: existing, error: exErr } = await admin
        .from('receipts')
        .select('id, status, wex_id')
        .eq('user_id', t.user_id)
        .eq('date', t.transacted_at)
        .gte('total', minAmt)
        .lte('total', maxAmt)
      if (exErr) continue

      if (!existing || existing.length === 0) {
        // Create a pending_review placeholder; avoid duplicate placeholders
        const { data: existingPending } = await admin
          .from('receipts')
          .select('id')
          .eq('user_id', t.user_id)
          .eq('date', t.transacted_at)
          .eq('wex_id', t.id)
          .eq('status', 'pending_review')
          .limit(1)
        if (!existingPending || existingPending.length === 0) {
          const { data: inserted, error: insErr } = await admin
            .from('receipts')
            .insert({ user_id: t.user_id, date: t.transacted_at, total: t.amount, status: 'pending_review', image_url: null, recon_reason: 'No matching receipt found for WEX transaction', wex_id: t.id })
            .select('id')
            .single()
          if (!insErr && inserted) {
            results.push({ pending_for: t.external_id, receipt_id: inserted.id })
          }
        }
      } else if (existing.length === 1) {
        const match = existing[0]
        if (!match.wex_id) {
          await admin.from('receipts').update({ wex_id: t.id }).eq('id', match.id)
          results.push({ linked: match.id, to_tx: t.external_id })
        }
      }
    }

    // 2) Reverse check: receipts without matching WEX txn -> mark as pending_review
    const { data: recentReceipts, error: recErr } = await admin
      .from('receipts')
      .select('id, user_id, date, total, status, image_url, wex_id')
      .gte('date', sinceStr)
    if (!recErr) {
      for (const r of recentReceipts || []) {
        if (!r.user_id) continue
        if (r.status === 'pending_review' || r.wex_id) continue
        const tol = Math.max(tolDollars, Math.abs(Number(r.total)) * (tolPercent / 100))
        const minAmt = (Number(r.total) - tol).toFixed(2)
        const maxAmt = (Number(r.total) + tol).toFixed(2)
        const { data: matches, error: mErr } = await admin
          .from('wex_transactions')
          .select('id')
          .eq('user_id', r.user_id)
          .eq('transacted_at', r.date)
          .gte('amount', minAmt)
          .lte('amount', maxAmt)
          .limit(1)
        if (mErr) continue
        if (!matches || matches.length === 0) {
          await admin.from('receipts').update({ status: 'pending_review', recon_reason: 'No matching WEX transaction' }).eq('id', r.id)
          results.push({ receipt_pending: r.id })
        }
      }
    }

    return okJson({ pending_flagged: results.length, results })
  } catch (e: any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
