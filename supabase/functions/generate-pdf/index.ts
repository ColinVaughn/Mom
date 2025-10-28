// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorJson } from '../_shared/cors.ts'
import { getAdminClient, getUserClient } from '../_shared/supabaseAdmin.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '*'
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return errorJson('Method not allowed', 405, origin)

  try {
    const userClient = getUserClient(req)
    const admin = getAdminClient()

    const { data: authData } = await userClient.auth.getUser()
    if (!authData?.user) return errorJson('Unauthorized', 401, origin)
    const uid = authData.user.id

    const { data: roleRow } = await userClient.from('users').select('role').eq('id', uid).maybeSingle()
    const isManager = roleRow?.role === 'manager'

    const body = await req.json()
    const { mode = 'single', receipt_ids, filters, use_thumbs } = body || {}

    // Build query
    let query = admin.from('receipts_with_user').select('*').order('date', { ascending: true })
    if (receipt_ids && Array.isArray(receipt_ids) && receipt_ids.length) {
      query = query.in('id', receipt_ids)
    } else if (filters) {
      const { user_id, status, date_from, date_to } = filters
      if (isManager) {
        if (user_id) query = query.eq('user_id', user_id)
      } else {
        query = query.eq('user_id', uid)
      }
      if (status) query = query.eq('status', status)
      if (date_from) query = query.gte('date', date_from)
      if (date_to) query = query.lte('date', date_to)
    } else {
      if (!isManager) query = query.eq('user_id', uid)
    }

    const { data: rows, error } = await query
    if (error) return errorJson('Query failed: ' + error.message, 400, origin)

    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    const receipts = (rows || []) as any[]

    // Strategy:
    // 1) Decide which path to use per receipt: thumbnail for grid (when available) or full image
    // 2) Batch-sign all paths to minimize RPCs
    // 3) Fetch and embed images with limited concurrency

    const pathFor = (r: any) => {
      if (mode === 'grid' && (use_thumbs ?? true)) return r.thumbnail_url || r.image_url
      return r.image_url
    }
    const paths: string[] = []
    const byIdxPath: (string | null)[] = receipts.map((r) => {
      const p = pathFor(r)
      if (p) { paths.push(p); return p } else { return null }
    })

    // Batch sign in chunks to avoid payload limits
    const chunk = <T,>(arr: T[], n = 100): T[][] => {
      const out: T[][] = []
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
      return out
    }

    const signedMap = new Map<string, string>()
    for (const group of chunk(paths, 100)) {
      const { data: signedBatch } = await admin.storage.from('receipts').createSignedUrls(group, 600)
      for (const s of signedBatch || []) {
        if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl)
      }
    }

    // Limit concurrent fetches/embeds to reduce memory spikes
    async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
      const ret: R[] = new Array(items.length) as any
      let next = 0
      const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
          const i = next++
          if (i >= items.length) break
          ret[i] = await fn(items[i], i)
        }
      })
      await Promise.all(workers)
      return ret
    }

    const embedded = await mapLimit(receipts, 6, async (r) => {
      const p = pathFor(r)
      if (!p) return { r, img: null }
      const url = signedMap.get(p)
      if (!url) return { r, img: null }
      const resp = await fetch(url)
      if (!resp.ok) return { r, img: null }
      const buf = new Uint8Array(await resp.arrayBuffer())
      let img: any = null
      try {
        img = await pdfDoc.embedJpg(buf)
      } catch {
        try { img = await pdfDoc.embedPng(buf) } catch { img = null }
      }
      return { r, img }
    })

    if (mode === 'grid') {
      const cols = 2
      const rowsPerPage = 2
      const cellW = 300
      const cellH = 350
      const margin = 40
      let page: any = null
      let x = margin
      let y = 792 - margin - cellH
      let col = 0
      let row = 0

      for (const { r, img } of embedded) {
        if (!page) page = pdfDoc.addPage([612, 792])
        // Draw header in cell
        page.drawText(`${r.user_name || ''}  ${r.date}  $${Number(r.total).toFixed(2)}`, {
          x: x + 8,
          y: y + cellH - 18,
          size: 10,
          font,
          color: rgb(0,0,0),
        })

        if (img) {
          const dims = img.scaleToFit(cellW - 16, cellH - 40)
          page.drawImage(img, { x: x + 8, y: y + 8, width: dims.width, height: dims.height })
        }

        // advance grid position
        col++
        x += cellW + margin
        if (col >= cols) {
          col = 0
          x = margin
          row++
          y -= cellH + margin
          if (row >= rowsPerPage) {
            page = null
            x = margin
            y = 792 - margin - cellH
            row = 0
          }
        }
      }
    } else { // single per page
      for (const { r, img } of embedded) {
        const page = pdfDoc.addPage([612, 792])
        page.drawText(`${r.user_name || ''}`, { x: 40, y: 760, size: 12, font })
        page.drawText(`${r.date}`, { x: 40, y: 742, size: 12, font })
        page.drawText(`$${Number(r.total).toFixed(2)}`, { x: 40, y: 724, size: 12, font })

        if (img) {
          const dims = img.scaleToFit(532, 640)
          page.drawImage(img, { x: 40, y: 60, width: dims.width, height: dims.height })
        }
      }
    }

    const pdfBytes = await pdfDoc.save()
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="receipts.pdf"',
        ...corsHeaders(origin),
      },
    })
  } catch (e: any) {
    return errorJson('Unhandled error: ' + (e?.message || String(e)), 500, origin)
  }
})
