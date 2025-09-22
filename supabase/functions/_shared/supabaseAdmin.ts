import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export function getAdminClient() {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })
}

export function getUserClient(req: Request) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY')
  }
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false },
  })
}
