// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getUserClient, getAdminClient } from '../_shared/supabaseAdmin.ts'

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorJson('Method not allowed', 405, origin)

  try {
    const userClient = getUserClient(req)
    const admin = getAdminClient()
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData?.user) return errorJson('Unauthorized', 401, origin)
    const uid = authData.user.id

    const { filters } = await req.json()
    const { user_id, status, date_from, date_to, amount_min, amount_max, limit = 100, offset = 0 } = filters || {}

    // Determine role
    const { data: roleRow } = await userClient.from('users').select('role').eq('id', uid).maybeSingle()
    const isManager = roleRow?.role === 'manager'

    // Build query base
    let query = admin.from('receipts_with_user').select('*', { count: 'exact' }).order('date', { ascending: false })

    if (isManager) {
      if (user_id) query = query.eq('user_id', user_id)
    } else {
      query = query.eq('user_id', uid)
    }

    if (status) query = query.eq('status', status)
    if (date_from) query = query.gte('date', date_from)
    if (date_to) query = query.lte('date', date_to)
    if (amount_min != null) query = query.gte('total', amount_min)
    if (amount_max != null) query = query.lte('total', amount_max)

    query = query.range(offset, offset + Math.min(1000, limit) - 1)

    const { data, error, count } = await query
    if (error) return errorJson('Query failed: ' + error.message, 400, origin)

    // For each receipt with image path, sign a URL (valid 1h)
    const signed: any[] = []
    for (const r of data || []) {
      let signed_url: string | null = null
      if (r.image_url && r.status !== 'missing') {
        const { data: s, error: sErr } = await admin.storage
          .from('receipts')
          .createSignedUrl(r.image_url, 3600)
        if (!sErr) signed_url = s.signedUrl
      }
      signed.push({ ...r, signed_url })
    }

    return okJson({ receipts: signed, count })
  } catch (e: any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
