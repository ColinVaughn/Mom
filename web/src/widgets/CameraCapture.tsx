import React from 'react'

interface GasReceiptData {
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
}

interface Props {
  onCapture: (blob: Blob, data?: GasReceiptData) => void
  onError?: (error: string) => void
}

export default function GasReceiptCapture({ onCapture, onError }: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const overlayRef = React.useRef<HTMLCanvasElement>(null)
  
  const [cameraReady, setCameraReady] = React.useState(false)
  const [error, setError] = React.useState<string>('')
  const [processing, setProcessing] = React.useState(false)
  const [captureMode, setCaptureMode] = React.useState<'auto' | 'manual'>('manual')
  const [previewImage, setPreviewImage] = React.useState<string | null>(null)
  const [extractedData, setExtractedData] = React.useState<GasReceiptData | null>(null)
  
  // Edge detection for auto-capture
  const [isDetectingEdges, setIsDetectingEdges] = React.useState(false)
  const detectionRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    let stream: MediaStream | null = null
    
    const initCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not available in this browser or context')
        }
        
        // Try to get the best camera settings for document capture
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 16/9 }
          }
        }
        
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCameraReady(true)
          
          // Start edge detection if in auto mode
          if (captureMode === 'auto') {
            startEdgeDetection()
          }
        }
      } catch (e: any) {
        const errorMsg = e?.message || 'Cannot access camera'
        setError(errorMsg)
        onError?.(errorMsg)
      }
    }
    
    initCamera()
    
    return () => {
      if (detectionRef.current) {
        cancelAnimationFrame(detectionRef.current)
      }
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [captureMode, onError])

  const startEdgeDetection = () => {
    setIsDetectingEdges(true)
    detectDocument()
  }

  const detectDocument = () => {
    if (!videoRef.current || !overlayRef.current || !isDetectingEdges) return
    
    const video = videoRef.current
    const overlay = overlayRef.current
    const ctx = overlay.getContext('2d')
    
    if (!ctx) return
    
    overlay.width = video.videoWidth
    overlay.height = video.videoHeight
    
    // Simple edge detection visualization
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    
    // Draw guide frame
    const margin = 50
    ctx.strokeStyle = '#00ff00'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 5])
    ctx.strokeRect(margin, margin, overlay.width - margin * 2, overlay.height - margin * 2)
    
    // Continue detection loop
    detectionRef.current = requestAnimationFrame(detectDocument)
  }

  const preprocessImage = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    
    // Apply image enhancement for better OCR
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      
      // Increase contrast
      const contrast = 1.5
      const adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255
      
      // Apply threshold for binarization
      const threshold = 128
      const binary = adjusted > threshold ? 255 : 0
      
      data[i] = binary
      data[i + 1] = binary
      data[i + 2] = binary
    }
    
    ctx.putImageData(imageData, 0, 0)
    return canvas
  }

  const trimAndDeskew = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = src.getContext('2d')!
    const w = src.width
    const h = src.height
    const img = ctx.getImageData(0, 0, w, h).data
    
    // Find document boundaries
    const isBackground = (r: number, g: number, b: number) => {
      const brightness = (r + g + b) / 3
      return brightness > 240 || brightness < 15
    }
    
    let top = 0, bottom = h - 1, left = 0, right = w - 1
    
    // Scan from top
    outer: for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (!isBackground(img[i], img[i + 1], img[i + 2])) {
          top = Math.max(0, y - 10)
          break outer
        }
      }
    }
    
    // Scan from bottom
    outer: for (let y = h - 1; y >= top; y--) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (!isBackground(img[i], img[i + 1], img[i + 2])) {
          bottom = Math.min(h - 1, y + 10)
          break outer
        }
      }
    }
    
    // Scan from left
    outer: for (let x = 0; x < w; x++) {
      for (let y = top; y <= bottom; y++) {
        const i = (y * w + x) * 4
        if (!isBackground(img[i], img[i + 1], img[i + 2])) {
          left = Math.max(0, x - 10)
          break outer
        }
      }
    }
    
    // Scan from right
    outer: for (let x = w - 1; x >= left; x--) {
      for (let y = top; y <= bottom; y++) {
        const i = (y * w + x) * 4
        if (!isBackground(img[i], img[i + 1], img[i + 2])) {
          right = Math.min(w - 1, x + 10)
          break outer
        }
      }
    }
    
    const out = document.createElement('canvas')
    const ow = Math.max(1, right - left + 1)
    const oh = Math.max(1, bottom - top + 1)
    out.width = ow
    out.height = oh
    
    const outCtx = out.getContext('2d')!
    outCtx.fillStyle = 'white'
    outCtx.fillRect(0, 0, ow, oh)
    outCtx.drawImage(src, left, top, ow, oh, 0, 0, ow, oh)
    
    return out
  }

  const extractGasReceiptData = async (canvas: HTMLCanvasElement): Promise<GasReceiptData> => {
    const blob = await canvasToBlob(canvas, 'image/png')
    let ocrText = ''
    let confidence = 0
    
    try {
      // Dynamic import of Tesseract.js for OCR
      const { default: Tesseract } = await import('tesseract.js')
      
      // Use enhanced settings for receipt OCR
      const result = await Tesseract.recognize(blob, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            // Track progress if needed
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
          }
        },
        tessedit_pageseg_mode: '3', // Fully automatic page segmentation
        preserve_interword_spaces: '1',
      })
      
      ocrText = result.data.text
      confidence = result.data.confidence || 0
    } catch (err) {
      console.error('OCR failed:', err)
      // Continue with empty text
    }
    
    // Enhanced pattern matching for gas receipts
    const data: GasReceiptData = { confidence }

    // Extract date (robust): collect candidates, validate, and normalize YYYY-MM-DD
    const candidates: string[] = []
    const pad = (n: number) => String(n).padStart(2, '0')
    const validYMD = (y: number, m: number, d: number) => {
      if (!(y >= 1900 && y <= 2100)) return false
      if (!(m >= 1 && m <= 12)) return false
      if (!(d >= 1 && d <= 31)) return false
      const dt = new Date(y, m - 1, d)
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
    }

    // mm/dd/yyyy or m/d/yy
    for (const m of ocrText.matchAll(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/g)) {
      let mm = parseInt(m[1], 10)
      let dd = parseInt(m[2], 10)
      let yy = parseInt(m[3], 10)
      if (m[3].length === 2) yy = 2000 + yy
      if (validYMD(yy, mm, dd)) candidates.push(`${yy}-${pad(mm)}-${pad(dd)}`)
    }

    // yyyy-mm-dd
    for (const m of ocrText.matchAll(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/g)) {
      const yy = parseInt(m[1], 10)
      const mm = parseInt(m[2], 10)
      const dd = parseInt(m[3], 10)
      if (validYMD(yy, mm, dd)) candidates.push(`${yy}-${pad(mm)}-${pad(dd)}`)
    }

    // Month name formats
    for (const m of ocrText.matchAll(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/gi)) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const mm = monthNames.findIndex(x => x.toLowerCase() === m[1].toLowerCase().slice(0, 3)) + 1
      const dd = parseInt(m[2], 10)
      const yy = parseInt(m[3], 10)
      if (validYMD(yy, mm, dd)) candidates.push(`${yy}-${pad(mm)}-${pad(dd)}`)
    }

    if (candidates.length > 0) {
      data.date = candidates[0]
    }
    
    // Extract time
    const timeMatch = ocrText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)
    if (timeMatch) {
      const [, hours, minutes, , ampm] = timeMatch
      let hour = parseInt(hours)
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0
      }
      data.time = `${String(hour).padStart(2, '0')}:${minutes}`
    }
    
    // Extract total amount (look for largest amount or "TOTAL")
    // Fixed: All patterns now have global flag
    const amountPatterns = [
      /TOTAL[\s:]*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      /AMOUNT[\s:]*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      /\$\s*(\d{1,3}(?:,\d{3})*\.\d{2})/g
    ]
    
    let amounts: number[] = []
    for (const pattern of amountPatterns) {
      const matches = Array.from(ocrText.matchAll(pattern))
      for (const match of matches) {
        const amount = parseFloat(match[1].replace(/,/g, ''))
        if (!isNaN(amount)) amounts.push(amount)
      }
    }
    
    if (amounts.length > 0) {
      // Usually the largest amount is the total
      data.total = Math.max(...amounts).toFixed(2)
    }
    
    // Extract gallons (support label-first or value-first)
    let gallonMatch = ocrText.match(/(?:GALLONS?|GAL)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    if (!gallonMatch) gallonMatch = ocrText.match(/(\d+(?:\.\d+)?)\s*(?:GAL|GALLON|GALLONS)/i)
    if (gallonMatch) {
      data.gallons = gallonMatch[1]
    }
    
    // Extract price per gallon (handle PRICE/G, PRICE/GAL, PER GAL, etc.)
    const ppgMatch = ocrText.match(/(?:PPG|PRICE\/?G(?:AL)?|PRICE\s*PER\s*G(?:AL)?|PER\s*G(?:AL)?)[\s:]*\$?\s*(\d+(?:\.\d{1,3})?)/i)
    if (ppgMatch) {
      data.pricePerGallon = ppgMatch[1]
    } else if (data.total && data.gallons) {
      // Calculate if we have total and gallons
      data.pricePerGallon = (parseFloat(data.total) / parseFloat(data.gallons)).toFixed(3)
    }
    
    // Extract fuel grade (include UNL/UNLD shortcuts)
    const gradeMatch = ocrText.match(/(REGULAR|PLUS|PREMIUM|DIESEL|UNLEADED|UNL|UNLD|SUPER|MID-?GRADE)/i)
    if (gradeMatch) {
      data.fuelGrade = gradeMatch[1].toUpperCase()
    }
    
    // Extract station name (common gas station brands)
    const stationPatterns = [
      /(SHELL|EXXON|MOBIL|CHEVRON|TEXACO|BP|CITGO|SUNOCO|ARCO|VALERO|SPEEDWAY|7-ELEVEN|WAWA|SHEETZ|CASEY'S|MARATHON|PHILLIPS\s*66|CONOCO|SINCLAIR|GULF|76|CIRCLE\s*K|QUIKTRIP|QT|RACETRAC|PILOT|FLYING\s*J|LOVE'S|TA|PETRO|COSTCO|SAM'S\s*CLUB|BJ'S|KROGER|SAFEWAY)/i
    ]
    
    for (const pattern of stationPatterns) {
      const match = ocrText.match(pattern)
      if (match) {
        data.station = match[1].toUpperCase()
        break
      }
    }
    
    // Extract station address (simple street pattern, best-effort)
    if (!data.stationAddress) {
      const lines = ocrText.split(/\r?\n/)
      for (const line of lines) {
        const m = line.match(/\b(\d{1,6})\s+([A-Za-z0-9.'\-\s]+?)\s+(Rd|Road|St|Street|Ave|Avenue|Blvd|Lane|Ln|Dr|Drive|Hwy|Highway|Pkwy|Parkway|Ct|Court)\b.*$/i)
        if (m) { data.stationAddress = line.trim(); break }
      }
    }

    // Extract payment method
    const paymentMatch = ocrText.match(/(CASH|CREDIT|DEBIT|VISA|MASTERCARD|AMEX|DISCOVER|APPLE\s*PAY|GOOGLE\s*PAY)/i)
    if (paymentMatch) {
      data.paymentMethod = paymentMatch[1].toUpperCase()
    }
    
    // Extract last 4 digits of card
    const cardMatch = ocrText.match(/\*{3,}(\d{4})|X{3,}(\d{4})|XXXX(\d{4})/i)
    if (cardMatch) {
      data.lastFourDigits = cardMatch[1] || cardMatch[2] || cardMatch[3]
    }
    
    return data
  }

  const capture = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    
    if (!video || !canvas) {
      setError('Camera not ready')
      return
    }
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setError('Canvas 2D not supported')
      return
    }
    
    setProcessing(true)
    setIsDetectingEdges(false)
    
    // Capture at full resolution
    const w = video.videoWidth
    const h = video.videoHeight
    canvas.width = w
    canvas.height = h
    ctx.drawImage(video, 0, 0, w, h)
    
    // Process the image
    const trimmed = trimAndDeskew(canvas)
    const enhanced = preprocessImage(trimmed)
    
    // Generate preview
    const previewUrl = enhanced.toDataURL('image/jpeg', 0.9)
    setPreviewImage(previewUrl)
    
    // Extract data
    try {
      const receiptData = await extractGasReceiptData(enhanced)
      setExtractedData(receiptData)
      
      // Create final blob for saving
      const blob = await canvasToBlob(enhanced, 'image/jpeg', 0.95)
      
      // Allow user to review before confirming
      setProcessing(false)
    } catch (err) {
      console.error('Processing failed:', err)
      setProcessing(false)
      setError('Failed to process receipt')
    }
  }

  const confirmCapture = async () => {
    if (previewImage && extractedData) {
      const response = await fetch(previewImage)
      const blob = await response.blob()
      onCapture(blob, extractedData)
      
      // Reset for next capture
      setPreviewImage(null)
      setExtractedData(null)
      if (captureMode === 'auto') {
        setIsDetectingEdges(true)
      }
    }
  }

  const retakePhoto = () => {
    setPreviewImage(null)
    setExtractedData(null)
    if (captureMode === 'auto') {
      setIsDetectingEdges(true)
    }
  }

  if (previewImage && extractedData) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <img src={previewImage} alt="Receipt preview" className="w-full rounded border" />
          <div className="absolute top-2 right-2 bg-white px-2 py-1 rounded shadow">
            Confidence: {Math.round(extractedData.confidence || 0)}%
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold mb-2">Extracted Data:</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {extractedData.station && (
              <>
                <span className="text-gray-600">Station:</span>
                <span>{extractedData.station}</span>
              </>
            )}
            {extractedData.date && (
              <>
                <span className="text-gray-600">Date:</span>
                <span>{extractedData.date}</span>
              </>
            )}
            {extractedData.time && (
              <>
                <span className="text-gray-600">Time:</span>
                <span>{extractedData.time}</span>
              </>
            )}
            {extractedData.total && (
              <>
                <span className="text-gray-600">Total:</span>
                <span className="font-semibold">${extractedData.total}</span>
              </>
            )}
            {extractedData.gallons && (
              <>
                <span className="text-gray-600">Gallons:</span>
                <span>{extractedData.gallons}</span>
              </>
            )}
            {extractedData.pricePerGallon && (
              <>
                <span className="text-gray-600">Price/Gal:</span>
                <span>${extractedData.pricePerGallon}</span>
              </>
            )}
            {extractedData.fuelGrade && (
              <>
                <span className="text-gray-600">Grade:</span>
                <span>{extractedData.fuelGrade}</span>
              </>
            )}
            {extractedData.paymentMethod && (
              <>
                <span className="text-gray-600">Payment:</span>
                <span>{extractedData.paymentMethod}</span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={confirmCapture}
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Confirm & Save
          </button>
          <button
            onClick={retakePhoto}
            className="flex-1 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Retake
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded text-sm">
          {error}
        </div>
      )}
      
      <div className="relative">
        <video 
          ref={videoRef} 
          className="w-full rounded border bg-black" 
          playsInline 
          muted 
        />
        
        {captureMode === 'auto' && (
          <canvas 
            ref={overlayRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%' }}
          />
        )}
        
        <canvas ref={canvasRef} className="hidden" />
        
        {cameraReady && (
          <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
            Position receipt within frame
          </div>
        )}
      </div>

    <div className="flex items-center gap-2">
      <button
        onClick={capture}
        className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-medium disabled:bg-gray-400 hover:bg-blue-700"
        disabled={!cameraReady || processing}
        aria-busy={processing}
      >
        {processing && (
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
        )}
        <span>{processing ? 'Processing…' : 'Capture Receipt'}</span>
      </button>

      <button
        onClick={() => setCaptureMode(captureMode === 'auto' ? 'manual' : 'auto')}
        className={`px-4 py-3 rounded-lg border ${captureMode === 'auto' ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-gray-300 bg-white text-gray-800'} hover:bg-gray-50`}
        aria-pressed={captureMode === 'auto'}
        aria-label="Toggle auto capture"
      >
        {captureMode === 'auto' ? 'Auto' : 'Manual'}
      </button>
    </div>

    <div className="text-xs text-gray-600 text-center">
      <p>Hold receipt flat and ensure good lighting</p>
      <p>Receipt will be automatically cropped and enhanced</p>
    </div>
  </div>
)
}

// Helper function to convert canvas to blob with fallback
async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            // Fallback to data URL (toDataURL returns a string)
            try {
              const dataUrl = canvas.toDataURL(type, quality)
              fetch(dataUrl)
                .then(res => res.blob())
                .then(resolve)
                .catch(reject)
            } catch (err) {
              reject(err)
            }
          }
        },
        type,
        quality
      )
    } else {
      // Fallback for browsers without toBlob
      try {
        const dataUrl = canvas.toDataURL(type, quality)
        fetch(dataUrl)
          .then(res => res.blob())
          .then(resolve)
          .catch(reject)
      } catch (err) {
        reject(err)
      }
    }
  })
}