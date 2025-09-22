export function corsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  } as Record<string, string>
}

export function okJson(data: unknown, origin?: string, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
      ...(init?.headers || {}),
    },
  })
}

export function errorJson(message: string, status = 400, origin?: string, extra?: Record<string, unknown>) {
  return okJson({ error: message, ...(extra || {}) }, origin, { status })
}
