// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson, okJson } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabaseAdmin.ts'

async function requireManager(req: Request) {
  const userClient = getUserClient(req)
  const { data: authData, error: authErr } = await userClient.auth.getUser()
  if (authErr || !authData?.user) {
    return { error: 'Unauthorized', status: 401 as const }
  }
  const uid = authData.user.id
  const { data, error } = await userClient
    .from('users')
    .select('role')
    .eq('id', uid)
    .single()
  if (error) {
    // If cannot read own row, forbid
    return { error: 'Forbidden', status: 403 as const }
  }
  if (data?.role !== 'manager') {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { uid }
}

async function handleCreate(body: any) {
  const { email, name, role = 'officer', sendInvite = true, password } = body || {}
  if (!email || !name) return errorJson('email and name are required', 400)
  if (!['officer', 'manager'].includes(role)) return errorJson('invalid role', 400)
  const admin = getAdminClient()

  // Create user in auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: Boolean(password) || false,
    password: password || undefined,
    user_metadata: { name },
  })
  if (createErr || !created?.user) return errorJson(createErr?.message || 'Failed to create user', 400)

  const uid = created.user.id

  // Ensure public.users exists and set role
  const { error: upErr } = await admin
    .from('users')
    .update({ name, email, role })
    .eq('id', uid)
  if (upErr) return errorJson('Failed to set role for new user: ' + upErr.message, 400)

  // If a password was provided, skip magic link invite
  if (!password && sendInvite) {
    // Send magic link invite by generating a link and emailing via Postmark
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkErr || !linkData.properties?.action_link) {
      // not fatal; user exists
      return okJson({ user_id: uid, warning: 'User created but invite link could not be generated' })
    }
    const inviteLink = linkData.properties.action_link
    const token = Deno.env.get('POSTMARK_TOKEN')
    const fromEmail = Deno.env.get('SENDER_EMAIL')
    if (token && fromEmail) {
      await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          From: fromEmail,
          To: email,
          Subject: 'Your GRTS access link',
          TextBody: `Hello ${name},\n\nClick to sign in: ${inviteLink}\n\nRegards,`,
        }),
      })
    }
    return okJson({ user_id: uid, invited: true })
  }

  return okJson({ user_id: uid, password_set: Boolean(password) })
}

async function handleSetRole(body: any) {
  const { user_id, role } = body || {}
  if (!user_id || !['officer', 'manager'].includes(role)) return errorJson('user_id and valid role are required', 400)
  const admin = getAdminClient()
  const { error } = await admin.from('users').update({ role }).eq('id', user_id)
  if (error) return errorJson('Failed to update role: ' + error.message, 400)
  return okJson({ user_id, role })
}

async function handleDelete(body: any) {
  const { user_id } = body || {}
  if (!user_id) return errorJson('user_id is required', 400)
  const admin = getAdminClient()
  const { error: authErr } = await admin.auth.admin.deleteUser(user_id)
  if (authErr) return errorJson('Failed to delete auth user: ' + authErr.message, 400)
  // public.users row will cascade
  return okJson({ deleted: true, user_id })
}

async function handleList() {
  const admin = getAdminClient()
  const { data, error } = await admin.from('users').select('id, name, email, role, created_at').order('created_at', { ascending: false })
  if (error) return errorJson('Failed to list users: ' + error.message, 400)
  return okJson({ users: data })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })

  const mgr = await requireManager(req)
  if ('error' in mgr) return errorJson(mgr.error, mgr.status, origin)

  try {
    if (req.method === 'GET') {
      return await handleList()
    }
    if (req.method === 'POST') {
      const body = await req.json()
      return await handleCreate(body)
    }
    if (req.method === 'PATCH') {
      const body = await req.json()
      return await handleSetRole(body)
    }
    if (req.method === 'DELETE') {
      const body = await req.json()
      return await handleDelete(body)
    }
    return errorJson('Method not allowed', 405, origin)
  } catch (e: any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
