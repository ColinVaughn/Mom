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
    // Optional OCR metadata
    const time_text = (form.get('time_text') as string) || undefined
    const gallonsStr = (form.get('gallons') as string) || undefined
    const pricePerGallonStr = (form.get('price_per_gallon') as string) || undefined
    const fuel_grade = (form.get('fuel_grade') as string) || undefined
    const station = (form.get('station') as string) || undefined
    const station_address = (form.get('station_address') as string) || undefined
    const payment_method = (form.get('payment_method') as string) || undefined
    const card_last4 = (form.get('card_last4') as string) || undefined
    const ocrConfidenceStr = (form.get('ocr_confidence') as string) || undefined
    const ocrRaw = (form.get('ocr') as string) || undefined

    if (!file) return errorJson('file is required', 400, origin)
    if (!date) return errorJson('date is required (YYYY-MM-DD)', 400, origin)
    // Validate ISO date yyyy-mm-dd
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return errorJson('invalid date format (YYYY-MM-DD)', 400, origin)
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    const dt = new Date(y, mo - 1, d)
    const isValid = dt.getFullYear() === y && (dt.getMonth() + 1) === mo && dt.getDate() === d
    if (!isValid) return errorJson('invalid calendar date', 400, origin)
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

    // Build insert payload
    const insertPayload: Record<string, any> = {
      user_id: uid,
      date,
      total,
      image_url,
      status: 'uploaded',
    }
    if (time_text) insertPayload.time_text = time_text
    const gallons = gallonsStr ? Number(gallonsStr) : undefined
    if (gallons != null && Number.isFinite(gallons)) insertPayload.gallons = gallons
    const price_per_gallon = pricePerGallonStr ? Number(pricePerGallonStr) : undefined
    if (price_per_gallon != null && Number.isFinite(price_per_gallon)) insertPayload.price_per_gallon = price_per_gallon
    if (fuel_grade) insertPayload.fuel_grade = fuel_grade
    if (station) insertPayload.station = station
    if (station_address) insertPayload.station_address = station_address
    if (payment_method) insertPayload.payment_method = payment_method
    if (card_last4) insertPayload.card_last4 = card_last4
    const ocr_confidence = ocrConfidenceStr ? Number(ocrConfidenceStr) : undefined
    if (ocr_confidence != null && Number.isFinite(ocr_confidence)) insertPayload.ocr_confidence = ocr_confidence
    if (ocrRaw) {
      try { insertPayload.ocr = JSON.parse(ocrRaw) } catch {}
    }

    // Insert DB row
    const { error: insErr, data: inserted } = await admin
      .from('receipts')
      .insert(insertPayload)
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
