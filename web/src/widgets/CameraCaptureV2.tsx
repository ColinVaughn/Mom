import React from 'react'

// Data returned to parent on capture
export interface GasReceiptData {
  date?: string
  time?: string
  total?: string
  gallons?: string
  pricePerGallon?: string
  fuelGrade?: string
  station?: string
  stationAddress?: string
  paymentMethod?: string
  lastFourDigits?: string
  confidence?: number
  fieldConfidence?: Partial<Record<'date'|'time'|'total'|'gallons'|'pricePerGallon'|'fuelGrade'|'station'|'stationAddress'|'paymentMethod'|'lastFourDigits', number>>
}

interface Props {
  onCapture: (blob: Blob, data?: GasReceiptData) => void
  onError?: (error: string) => void
}

export default function CameraCaptureV2({ onCapture, onError }: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [uploadBlob, setUploadBlob] = React.useState<Blob | null>(null)
  const [extracted, setExtracted] = React.useState<GasReceiptData | null>(null)
  const [ocrProgress, setOcrProgress] = React.useState<number>(0)

  React.useEffect(() => {
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
      } catch (e: any) {
        const msg = e?.message || 'Unable to access camera'
        setError(msg)
        onError?.(msg)
      }
    })()
    return () => {
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onError])

  const captureAndExtract = async () => {
    if (!videoRef.current || !canvasRef.current) return
    setBusy(true)
    setError('') // Clear previous errors
    let work: HTMLCanvasElement | null = null
    try {
      // Draw frame
      const v = videoRef.current
      const c = canvasRef.current
      c.width = v.videoWidth
      c.height = v.videoHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(v, 0, 0, c.width, c.height)

      // Downscale to reasonable working width to speed OCR
      work = scaleCanvas(c, Math.min(1400, c.width))
      // Adaptive thresholding for better OCR
      const bin = adaptiveThreshold(work, 32, 8)

      // OCR via shared worker with timeout
      const ocrBlob = await canvasToBlob(bin, 'image/png')
      console.log('[OCR] Starting recognition...')
      setOcrProgress(0)
      
      const ocrPromise = recognizeWithWorker(ocrBlob, (progress) => {
        setOcrProgress(Math.round(progress * 100))
      })
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR timeout after 30 seconds')), 30000)
      })
      
      const { resultText, overallConfidence, words } = await Promise.race([ocrPromise, timeoutPromise])
      console.log('[OCR] Recognition complete, confidence:', overallConfidence)
      setOcrProgress(100)

      const data = extractFields(resultText, words, overallConfidence)

      // Final image for upload (JPEG, quality 0.95) and preview
      const outBlob = await canvasToBlob(work, 'image/jpeg', 0.95)
      const url = URL.createObjectURL(outBlob)
      setPreviewUrl(url)
      setUploadBlob(outBlob)
      setExtracted(data)
    } catch (e: any) {
      console.error('[OCR] Error:', e)
      const msg = e?.message || 'Failed to capture'
      
      // If OCR failed but we have an image, allow manual entry
      if (work) {
        try {
          const outBlob = await canvasToBlob(work, 'image/jpeg', 0.95)
          const url = URL.createObjectURL(outBlob)
          setPreviewUrl(url)
          setUploadBlob(outBlob)
          setExtracted({ confidence: 0 }) // Empty data for manual entry
          setError(`OCR failed: ${msg}. Please enter details manually.`)
        } catch {
          setError(msg)
          onError?.(msg)
        }
      } else {
        setError(msg)
        onError?.(msg)
      }
    } finally {
      setBusy(false)
      setOcrProgress(0)
    }
  }

  // -------- Preview & Edit UI --------
  if (previewUrl && extracted) {
    const getConf = (k: keyof NonNullable<GasReceiptData['fieldConfidence']>): number | undefined => {
      return extracted.fieldConfidence?.[k] ?? extracted.confidence
    }
    const confClass = (v?: number) => {
      if (v == null) return ''
      if (v < 70) return 'border-red-400 bg-red-50'
      if (v < 85) return 'border-amber-400 bg-amber-50'
      return 'border-gray-300 bg-white'
    }
    const badge = (v?: number) => v != null ? (
      <span title="OCR confidence" className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${v<70?'bg-red-100 text-red-800':v<85?'bg-amber-100 text-amber-800':'bg-gray-100 text-gray-700'}`}>{Math.round(v)}%</span>
    ) : null

    return (
      <div className="space-y-4">
        {error && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{error}</div>}
        
        <div className="relative">
          <img src={previewUrl} alt="Receipt preview" className="w-full rounded border" />
          {extracted.confidence != null && extracted.confidence > 0 && (
            <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded shadow text-xs">
              Overall: {Math.round(extracted.confidence)}%
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-3 rounded border">
          <h3 className="font-semibold mb-2">{extracted.confidence === 0 ? 'Enter receipt details' : 'Review extracted data'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <label className="block">
              <span className="block text-gray-600">Date {badge(getConf('date'))}</span>
              <input type="date" value={extracted.date || ''} onChange={e=>setExtracted(d=>({...(d||{}), date: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('date'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Time {badge(getConf('time'))}</span>
              <input type="text" placeholder="HH:MM" value={extracted.time || ''} onChange={e=>setExtracted(d=>({...(d||{}), time: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('time'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Total ($) {badge(getConf('total'))}</span>
              <input type="number" step="0.01" value={extracted.total ?? ''} onChange={e=>setExtracted(d=>({...(d||{}), total: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('total'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Gallons {badge(getConf('gallons'))}</span>
              <input type="number" step="0.001" value={extracted.gallons ?? ''} onChange={e=>setExtracted(d=>({...(d||{}), gallons: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('gallons'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Price/Gal {badge(getConf('pricePerGallon'))}</span>
              <input type="number" step="0.001" value={extracted.pricePerGallon ?? ''} onChange={e=>setExtracted(d=>({...(d||{}), pricePerGallon: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('pricePerGallon'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Fuel Grade {badge(getConf('fuelGrade'))}</span>
              <input type="text" value={extracted.fuelGrade || ''} onChange={e=>setExtracted(d=>({...(d||{}), fuelGrade: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('fuelGrade'))}`} />
            </label>
            <label className="block md:col-span-2">
              <span className="block text-gray-600">Station {badge(getConf('station'))}</span>
              <input type="text" value={extracted.station || ''} onChange={e=>setExtracted(d=>({...(d||{}), station: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('station'))}`} />
            </label>
            <label className="block md:col-span-3">
              <span className="block text-gray-600">Station Address {badge(getConf('stationAddress'))}</span>
              <input type="text" value={extracted.stationAddress || ''} onChange={e=>setExtracted(d=>({...(d||{}), stationAddress: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('stationAddress'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Payment {badge(getConf('paymentMethod'))}</span>
              <input type="text" value={extracted.paymentMethod || ''} onChange={e=>setExtracted(d=>({...(d||{}), paymentMethod: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('paymentMethod'))}`} />
            </label>
            <label className="block">
              <span className="block text-gray-600">Card Last4 {badge(getConf('lastFourDigits'))}</span>
              <input type="text" maxLength={4} value={extracted.lastFourDigits || ''} onChange={e=>setExtracted(d=>({...(d||{}), lastFourDigits: e.target.value}))} className={`border rounded-lg w-full p-2 ${confClass(getConf('lastFourDigits'))}`} />
            </label>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            onClick={() => {
              if (uploadBlob && extracted) {
                onCapture(uploadBlob, extracted)
                try { URL.revokeObjectURL(previewUrl) } catch {}
                setPreviewUrl(null)
                setUploadBlob(null)
                setExtracted(null)
              }
            }}
          >Confirm & Save</button>
          <button
            type="button"
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
            onClick={() => {
              try { if (previewUrl) URL.revokeObjectURL(previewUrl) } catch {}
              setPreviewUrl(null)
              setUploadBlob(null)
              setExtracted(null)
            }}
          >Retake</button>
        </div>
      </div>
    )
  }

  // -------- Live Camera UI --------
  return (
    <div className="space-y-2">
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
      <video ref={videoRef} className="w-full rounded border bg-black object-contain h-[60svh] sm:h-[70vh]" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={captureAndExtract}
          disabled={!ready || busy}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-gray-400 hover:bg-blue-700"
        >
          {busy ? (ocrProgress > 0 ? `Processing OCR: ${ocrProgress}%` : 'Processing…') : 'Capture & Extract'}
        </button>
      </div>
      <div className="text-xs text-gray-600 text-center">Good lighting helps OCR. Hold receipt flat.</div>
    </div>
  )
}

// ---------- OCR Pipeline ----------

async function recognizeWithWorker(img: Blob, onProgress?: (progress: number) => void): Promise<{ resultText: string; overallConfidence: number; words: Array<{ text: string; confidence: number }>}> {
  try {
    console.log('[OCR] Importing tesseract.js...')
    const { createWorker } = await import('tesseract.js')
    
    // Reuse a singleton worker stored on window to avoid reloading between captures
    const g: any = globalThis as any
    if (!g.__grts_ocr_worker__) {
      console.log('[OCR] Creating new worker...')
      const worker = await createWorker({ 
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`)
            onProgress?.(m.progress)
          } else {
            console.log('[OCR]', m.status)
          }
        }
      })
      console.log('[OCR] Loading language...')
      await worker.loadLanguage('eng')
      console.log('[OCR] Initializing...')
      await worker.initialize('eng')
      console.log('[OCR] Setting parameters...')
      await worker.setParameters({
        tessedit_pageseg_mode: '6', // Assume a uniform block of text
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,/:$-*#()' ",
      })
      console.log('[OCR] Worker ready')
      g.__grts_ocr_worker__ = worker
    } else {
      console.log('[OCR] Reusing existing worker')
    }
    
    const worker = g.__grts_ocr_worker__
    console.log('[OCR] Starting recognition on image blob, size:', img.size)
    const { data } = await worker.recognize(img)
    const words = (data?.words || []).map((w: any) => ({ text: String(w.text || ''), confidence: Number(w.confidence || 0) }))
    return { resultText: String(data?.text || ''), overallConfidence: Number(data?.confidence || 0), words }
  } catch (err) {
    console.error('[OCR] Worker error:', err)
    throw new Error(`OCR failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

function scaleCanvas(src: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  if (src.width <= maxWidth) return src
  const ratio = maxWidth / src.width
  const dst = document.createElement('canvas')
  dst.width = Math.round(src.width * ratio)
  dst.height = Math.round(src.height * ratio)
  const dctx = dst.getContext('2d')!
  dctx.drawImage(src, 0, 0, dst.width, dst.height)
  return dst
}

// Block-adaptive thresholding: split into tiles and threshold per-tile using local mean - C
function adaptiveThreshold(src: HTMLCanvasElement, tile = 32, C = 8): HTMLCanvasElement {
  const w = src.width, h = src.height
  const ctx = src.getContext('2d')!
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data

  // Precompute grayscale
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2])
  }

  const out = new Uint8ClampedArray(w * h)
  const tilesX = Math.max(1, Math.floor(w / tile))
  const tilesY = Math.max(1, Math.floor(h / tile))

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tile
      const y0 = ty * tile
      const x1 = Math.min(w, x0 + tile)
      const y1 = Math.min(h, y0 + tile)
      // mean
      let sum = 0, count = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) { sum += gray[y * w + x]; count++ }
      }
      const mean = sum / Math.max(1, count)
      const thresh = mean - C
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          out[y * w + x] = gray[y * w + x] < thresh ? 0 : 255
        }
      }
    }
  }

  // Write back as binary image
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = out[p]
    data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return src
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), type, quality)
    } else {
      try {
        const dataUrl = canvas.toDataURL(type, quality)
        fetch(dataUrl).then(r => r.blob()).then(resolve).catch(reject)
      } catch (e) {
        reject(e)
      }
    }
  })
}

// ---------- Field extraction ----------

function extractFields(ocrText: string, words: Array<{ text: string; confidence: number }>, overall: number): GasReceiptData {
  const data: GasReceiptData = { confidence: Math.round(overall) }
  const fc: NonNullable<GasReceiptData['fieldConfidence']> = {}

  const now = new Date()
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  const pad = (n: number) => String(n).padStart(2, '0')
  const validYMD = (y: number, m: number, d: number) => {
    if (!(y >= 1900 && y <= 2100)) return false
    if (!(m >= 1 && m <= 12)) return false
    if (!(d >= 1 && d <= 31)) return false
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d
  }

  // Normalize text once
  const text = ocrText

  // Dates
  const candidates: string[] = []
  for (const m of text.matchAll(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/g)) {
    let mm = parseInt(m[1], 10), dd = parseInt(m[2], 10), yy = parseInt(m[3], 10)
    if (m[3].length === 2) yy = 2000 + yy
    if (validYMD(yy, mm, dd)) candidates.push(`${yy}-${pad(mm)}-${pad(dd)}`)
  }
  for (const m of text.matchAll(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/g)) {
    const yy = parseInt(m[1], 10), mm = parseInt(m[2], 10), dd = parseInt(m[3], 10)
    if (validYMD(yy, mm, dd)) candidates.push(`${yy}-${pad(mm)}-${pad(dd)}`)
  }
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  for (const m of text.matchAll(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/gi)) {
    const mm = monthNames.findIndex(x => x.toLowerCase() === m[1].toLowerCase().slice(0,3)) + 1
    const dd = parseInt(m[2], 10)
    const yy = parseInt(m[3], 10)
    if (validYMD(yy, mm, dd)) candidates.push(`${yy}-${pad(mm)}-${pad(dd)}`)
  }
  const filtered = candidates.filter(d => {
    const dt = new Date(d)
    return dt >= oneYearAgo && dt <= now
  })
  if (filtered.length) {
    data.date = filtered[0]
    fc.date = estimateConfidenceForTokens([''+filtered[0]], words) || overall
  }

  // Time
  const t = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (t) {
    const [, hh, mm, , ap] = t
    let h = parseInt(hh, 10)
    if (ap) {
      if (ap.toUpperCase() === 'PM' && h < 12) h += 12
      if (ap.toUpperCase() === 'AM' && h === 12) h = 0
    }
    data.time = `${String(h).padStart(2,'0')}:${mm}`
    fc.time = estimateConfidenceForTokens([hh, mm, ap || ''], words) || overall
  }

  // Totals: choose largest dollar amount
  const amountPatterns = [
    /TOTAL[\s:]*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
    /AMOUNT[\s:]*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
    /\$\s*(\d{1,3}(?:,\d{3})*\.\d{2})/g,
  ]
  let amounts: number[] = []
  for (const p of amountPatterns) {
    for (const m of text.matchAll(p)) {
      const n = parseFloat(m[1].replace(/,/g, ''))
      if (!isNaN(n)) amounts.push(n)
    }
  }
  if (amounts.length) {
    const max = Math.max(...amounts)
    data.total = max.toFixed(2)
    fc.total = estimateConfidenceForTokens([String(max.toFixed(2))], words) || overall
  }

  // Gallons
  let gal = text.match(/(?:GALLONS?|GAL)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
  if (!gal) gal = text.match(/(\d+(?:\.\d+)?)\s*(?:GAL|GALLON|GALLONS)/i)
  if (gal) { data.gallons = gal[1]; fc.gallons = estimateConfidenceForTokens([gal[1]], words) || overall }

  // Price per gallon
  const ppg = text.match(/(?:PPG|PRICE\/?G(?:AL)?|PRICE\s*PER\s*G(?:AL)?|PER\s*G(?:AL)?)[\s:]*\$?\s*(\d+(?:\.\d{1,3})?)/i)
  if (ppg) { data.pricePerGallon = ppg[1]; fc.pricePerGallon = estimateConfidenceForTokens([ppg[1]], words) || overall }
  else if (data.total && data.gallons) {
    const val = (parseFloat(data.total) / parseFloat(data.gallons)).toFixed(3)
    data.pricePerGallon = val
    fc.pricePerGallon = overall
  }

  // Grade
  const grade = text.match(/(REGULAR|PLUS|PREMIUM|DIESEL|UNLEADED|UNL|UNLD|SUPER|MID-?GRADE)/i)
  if (grade) { data.fuelGrade = grade[1].toUpperCase(); fc.fuelGrade = estimateConfidenceForTokens([grade[1]], words) || overall }

  // Station brand
  const stationPatterns = /(SHELL|EXXON|MOBIL|CHEVRON|TEXACO|BP|CITGO|SUNOCO|ARCO|VALERO|SPEEDWAY|7-ELEVEN|WAWA|SHEETZ|CASEY'S|MARATHON|PHILLIPS\s*66|CONOCO|SINCLAIR|GULF|76|CIRCLE\s*K|QUIKTRIP|QT|RACETRAC|PILOT|FLYING\s*J|LOVE'S|TA|PETRO|COSTCO|SAM'S\s*CLUB|BJ'S|KROGER|SAFEWAY)/i
  const st = text.match(stationPatterns)
  if (st) { data.station = st[1].toUpperCase(); fc.station = estimateConfidenceForTokens([st[1]], words) || overall }

  // Address (best-effort)
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/\b(\d{1,6})\s+([A-Za-z0-9.'\-\s]+?)\s+(Rd|Road|St|Street|Ave|Avenue|Blvd|Lane|Ln|Dr|Drive|Hwy|Highway|Pkwy|Parkway|Ct|Court)\b.*$/i)
    if (m) { data.stationAddress = line.trim(); fc.stationAddress = estimateConfidenceForTokens(line.split(/\s+/), words) || overall; break }
  }

  // Payment method
  const pay = text.match(/(CASH|CREDIT|DEBIT|VISA|MASTERCARD|AMEX|DISCOVER|APPLE\s*PAY|GOOGLE\s*PAY)/i)
  if (pay) { data.paymentMethod = pay[1].toUpperCase(); fc.paymentMethod = estimateConfidenceForTokens([pay[1]], words) || overall }

  // Last 4
  const card = text.match(/\*{3,}(\d{4})|X{3,}(\d{4})|XXXX(\d{4})/i)
  if (card) { data.lastFourDigits = card[1] || card[2] || card[3]; fc.lastFourDigits = estimateConfidenceForTokens([data.lastFourDigits!], words) || overall }

  data.fieldConfidence = fc
  return data
}

function estimateConfidenceForTokens(tokens: string[], words: Array<{ text: string; confidence: number }>): number | undefined {
  const clean = (s: string) => s.replace(/[^0-9A-Za-z.]/g, '').toLowerCase()
  const tset = tokens.map(clean).filter(Boolean)
  if (!tset.length) return undefined
  let sum = 0, cnt = 0
  for (const w of words) {
    const wt = clean(w.text)
    if (!wt) continue
    if (tset.some(t => wt.includes(t) || t.includes(wt))) { sum += w.confidence; cnt++ }
  }
  if (!cnt) return undefined
  return Math.round(sum / cnt)
}
