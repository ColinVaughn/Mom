import React from 'react'
import Tesseract from 'tesseract.js'

interface Props {
  onCapture: (blob: Blob, guesses?: { date?: string; total?: string }) => void
}

export default function CameraCapture({ onCapture }: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [processing, setProcessing] = React.useState(false)

  React.useEffect(() => {
    let stream: MediaStream | null = null
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
      } catch (e:any) {
        setError(e?.message || 'Cannot access camera')
      }
    })()
    return () => {
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const capture = async () => {
    const video = videoRef.current!
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const w = video.videoWidth
    const h = video.videoHeight
    canvas.width = w
    canvas.height = h
    ctx.drawImage(video, 0, 0, w, h)

    // Simple border trim by detecting near-white margins
    const trimmed = trimWhiteBorders(canvas)

    setProcessing(true)
    const blob = await new Promise<Blob>(resolve => trimmed.toBlob(b => resolve(b!), 'image/jpeg', 0.92))

    try {
      const guesses = await ocrGuess(trimmed)
      onCapture(blob, guesses)
    } catch {
      onCapture(blob)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div>
      {!ready && error && <div className="text-sm text-red-700">{error}</div>}
      <video ref={videoRef} className="w-full rounded border" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <button onClick={capture} className="mt-2 bg-gray-800 text-white px-4 py-2 rounded" disabled={!ready || processing}>
        {processing ? 'Processing…' : 'Capture'}
      </button>
    </div>
  )
}

function trimWhiteBorders(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext('2d')!
  const w = src.width
  const h = src.height
  const img = ctx.getImageData(0, 0, w, h).data
  const isWhiteish = (r:number,g:number,b:number) => r>230 && g>230 && b>230
  let top=0,bottom=h-1,left=0,right=w-1
  // top
  while (top<h) {
    let found=false
    for (let x=0;x<w;x++) {
      const i=(top*w+x)*4
      if (!isWhiteish(img[i],img[i+1],img[i+2])) { found=true; break }
    }
    if (found) break; top++
  }
  // bottom
  while (bottom>top) {
    let found=false
    for (let x=0;x<w;x++) {
      const i=(bottom*w+x)*4
      if (!isWhiteish(img[i],img[i+1],img[i+2])) { found=true; break }
    }
    if (found) break; bottom--
  }
  // left
  while (left<w) {
    let found=false
    for (let y=top;y<=bottom;y++) {
      const i=(y*w+left)*4
      if (!isWhiteish(img[i],img[i+1],img[i+2])) { found=true; break }
    }
    if (found) break; left++
  }
  // right
  while (right>left) {
    let found=false
    for (let y=top;y<=bottom;y++) {
      const i=(y*w+right)*4
      if (!isWhiteish(img[i],img[i+1],img[i+2])) { found=true; break }
    }
    if (found) break; right--
  }

  const out = document.createElement('canvas')
  const ow = Math.max(1, right-left+1)
  const oh = Math.max(1, bottom-top+1)
  out.width = ow
  out.height = oh
  out.getContext('2d')!.drawImage(src, left, top, ow, oh, 0, 0, ow, oh)
  return out
}

async function ocrGuess(canvas: HTMLCanvasElement): Promise<{ date?: string; total?: string }> {
  const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))
  const { data } = await Tesseract.recognize(blob, 'eng', { logger: () => {} })
  const text = data.text || ''
  // Try to find an amount like 12.34 preceded by $ optionally
  const amountMatch = text.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:[\.,](\d{2}))\b/)
  let total: string | undefined
  if (amountMatch) {
    const int = amountMatch[1].replace(/,/g,'')
    const cents = amountMatch[2]
    total = `${int}.${cents}`
  }
  // Dates like YYYY-MM-DD or MM/DD/YYYY
  let date: string | undefined
  const iso = text.match(/(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])/)
  const us = text.match(/(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})/)
  if (iso) {
    const y=iso[1], m=iso[2].padStart(2,'0'), d=iso[3].padStart(2,'0')
    date = `${y}-${m}-${d}`
  } else if (us) {
    const m=us[1].padStart(2,'0'), d=us[2].padStart(2,'0'), y=us[3]
    date = `${y}-${m}-${d}`
  }
  return { date, total }
}
