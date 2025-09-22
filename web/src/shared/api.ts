import { supabase } from './supabaseClient'

export async function callEdgeFunctionMultipart(functionName: string, formData: FormData) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const js = await res.json()
      detail = js?.error || JSON.stringify(js)
    } catch {
      detail = await res.text()
    }
    throw new Error(`Function ${functionName} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

export async function callEdgeFunctionJson<TReq extends Record<string, any>, TRes = any>(
  functionName: string,
  json: TReq,
  method: 'POST'|'GET'|'PATCH'|'DELETE' = 'POST',
): Promise<TRes> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(json),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const js = await res.json()
      detail = (js as any)?.error || JSON.stringify(js)
    } catch {
      detail = await res.text()
    }
    throw new Error(`Function ${functionName} failed: ${res.status} ${detail}`)
  }
  return res.json()
}
