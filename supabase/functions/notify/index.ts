// deno-lint-ignore-file no-explicit-any
// Generic email notification function via Postmark
// Body: { to: string, subject: string, text: string }
// Only managers can send notifications
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getUserClient } from '../_shared/supabaseAdmin.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorJson('Method not allowed', 405, origin)

  const userClient = getUserClient(req)
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) return errorJson('Unauthorized', 401, origin)
  const { data: roleRow } = await userClient.from('users').select('role, email').eq('id', auth.user.id).single()
  if (roleRow?.role !== 'manager') return errorJson('Forbidden', 403, origin)

  const body = await req.json()
  const to = String(body.to || '')
  const subject = String(body.subject || '')
  const text = String(body.text || '')
  if (!to || !subject || !text) return errorJson('to, subject, text required', 400, origin)

  const token = Deno.env.get('POSTMARK_TOKEN')
  const fromEmail = Deno.env.get('SENDER_EMAIL')
  if (!token || !fromEmail) return errorJson('Email not configured', 500, origin)

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ From: fromEmail, To: to, Subject: subject, TextBody: text }),
  })
  if (!res.ok) return errorJson('Postmark error', 502, origin)

  return okJson({ ok: true })
})
