// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getUserClient, getAdminClient } from '../_shared/supabaseAdmin.ts'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorJson('Method not allowed', 405, origin)

  try {
    const userClient = getUserClient(req)
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData?.user) return errorJson('Unauthorized', 401, origin)
    const uid = authData.user.id

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) return errorJson('Expected multipart/form-data', 400, origin)

    const form = await req.formData()
    const file = form.get('file') as File | null
    const date = form.get('date') as string
    const totalStr = form.get('total') as string

    if (!file) return errorJson('file is required', 400, origin)
    if (!date) return errorJson('date is required (YYYY-MM-DD)', 400, origin)
    if (!totalStr) return errorJson('total is required', 400, origin)

    const total = Number(totalStr)
    if (!Number.isFinite(total) || total < 0) return errorJson('invalid total', 400, origin)

    if (file.size > MAX_SIZE) return errorJson('file too large (max 10MB)', 400, origin)
    if (!ALLOWED_TYPES.has(file.type)) return errorJson('unsupported file type', 400, origin)

    // Save to Storage
    const admin = getAdminClient()
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const key = crypto.randomUUID()
    const path = `${uid}/${key}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await admin.storage.from('receipts').upload(path, new Uint8Array(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    })
    if (upErr) return errorJson('upload failed: ' + upErr.message, 400, origin)

    // Store the object path in DB; create a signed URL for immediate client preview
    const { data: sig, error: sigErr } = await admin.storage.from('receipts').createSignedUrl(path, 3600)
    const image_url = path

    // Insert DB row
    const { error: insErr, data: inserted } = await admin
      .from('receipts')
      .insert({ user_id: uid, date, total, image_url, status: 'uploaded' })
      .select('*')
      .single()
    if (insErr) return errorJson('db insert failed: ' + insErr.message, 400, origin)

    // Send upload confirmation (non-fatal if fails)
    try {
      const token = Deno.env.get('POSTMARK_TOKEN')
      const fromEmail = Deno.env.get('SENDER_EMAIL')
      if (token && fromEmail) {
        const { data: userRow } = await admin.from('users').select('email, name').eq('id', uid).single()
        if (userRow?.email) {
          await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              'X-Postmark-Server-Token': token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              From: fromEmail,
              To: userRow.email,
              Subject: 'Receipt Uploaded',
              TextBody: `Hello ${userRow.name || ''},\n\nYour receipt for ${date} totaling $${total.toFixed(2)} was uploaded successfully.`,
            }),
          })
        }
      }
    } catch {}

    return okJson({ receipt: inserted, storage_path: path, signed_url: sigErr ? null : sig.signedUrl })
  } catch (e: any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
