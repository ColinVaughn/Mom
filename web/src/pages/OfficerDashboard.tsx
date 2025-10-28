import React from 'react'
import CameraCaptureV2 from '../widgets/CameraCaptureV2'
import { callEdgeFunctionMultipart } from '../shared/api'
import { supabase } from '../shared/supabaseClient'
import { useAuth } from '../shared/AuthContext'
import ReceiptList from '../widgets/ReceiptList'
import BulkZipUpload from '../widgets/BulkZipUpload'
import { enqueueUpload } from '../shared/offlineQueue'
import CardManagement from '../widgets/CardManagement'

export default function OfficerDashboard() {
  const [tab, setTab] = React.useState<'upload'|'history'|'settings'>('upload')
  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="inline-flex rounded-lg border bg-white shadow-sm overflow-hidden mb-4">
        <button className={tabBtn(tab==='upload')} onClick={() => setTab('upload')} aria-pressed={tab==='upload'}>Upload</button>
        <button className={tabBtn(tab==='history')} onClick={() => setTab('history')} aria-pressed={tab==='history'}>History</button>
        <button className={tabBtn(tab==='settings')} onClick={() => setTab('settings')} aria-pressed={tab==='settings'}>Settings</button>
      </div>
      {tab === 'upload' && <UploadPanel />}
      {tab === 'history' && <HistoryPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  )
}

function tabBtn(active:boolean) {
  return `px-4 py-2 text-sm md:text-base ${active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} `
}

function UploadPanel() {
  const { user } = useAuth()
  const [file, setFile] = React.useState<File | null>(null)
  const [date, setDate] = React.useState<string>('')
  const [total, setTotal] = React.useState<string>('')
  // Optional OCR-enriched fields
  const [timeText, setTimeText] = React.useState<string>('')
  const [gallons, setGallons] = React.useState<string>('')
  const [pricePerGallon, setPricePerGallon] = React.useState<string>('')
  const [fuelGrade, setFuelGrade] = React.useState<string>('')
  const [station, setStation] = React.useState<string>('')
  const [stationAddress, setStationAddress] = React.useState<string>('')
  const [paymentMethod, setPaymentMethod] = React.useState<string>('')
  const [cardLast4, setCardLast4] = React.useState<string>('')
  const [ocrConfidence, setOcrConfidence] = React.useState<string>('')
  const [ocrRaw, setOcrRaw] = React.useState<any>(null)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string>('')
  const isValidISODate = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return false
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    const dt = new Date(y, mo - 1, d)
    return dt.getFullYear() === y && (dt.getMonth() + 1) === mo && dt.getDate() === d
  }

  // Compress an image to JPEG with max width for faster upload
  const compressImage = React.useCallback(async (input: Blob, maxWidth = 1200, quality = 0.85): Promise<File> => {
    // Create bitmap
    const bitmap = await createImageBitmap(input)
    let width = bitmap.width
    let height = bitmap.height
    if (width > maxWidth) {
      height = Math.round(height * (maxWidth / width))
      width = maxWidth
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b || input), 'image/jpeg', quality)
    })
    const name = (input as File).name || `receipt-${Date.now()}.jpg`
    const outName = /\.jpe?g$/i.test(name) ? name : name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], outName, { type: 'image/jpeg' })
  }, [])

  // Prefill from query params if present (e.g., shared link from Manager calendar)
  React.useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const qDate = p.get('date') || ''
      const qTotal = p.get('total') || ''
      const qTime = p.get('time') || ''
      if (qDate && isValidISODate(qDate)) setDate(qDate)
      if (qTotal && !Number.isNaN(Number(qTotal))) setTotal(String(Number(qTotal)))
      if (qTime) setTimeText(qTime)
    } catch {}
  }, [])

  const onCaptured = async (blob: Blob, data?: any) => {
    // Compress captured image before setting file
    const initial = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const f = await compressImage(initial)
    setFile(f)
    // Prime inputs from extracted data
    if (data?.date && isValidISODate(data.date)) setDate(data.date)
    if (data?.total) setTotal(String(data.total))
    if (data?.time) setTimeText(data.time)
    if (data?.gallons != null) setGallons(String(data.gallons))
    if (data?.pricePerGallon != null) setPricePerGallon(String(data.pricePerGallon))
    if (data?.fuelGrade) setFuelGrade(data.fuelGrade)
    if (data?.station) setStation(data.station)
    if (data?.stationAddress) setStationAddress(data.stationAddress)
    if (data?.paymentMethod) setPaymentMethod(data.paymentMethod)
    if (data?.lastFourDigits) setCardLast4(data.lastFourDigits)
    if (data?.confidence != null) setOcrConfidence(String(Math.round(data.confidence)))
    setOcrRaw(data || null)
  }

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0]
    if (f) {
      // Compress chosen file before upload
      const compressed = await compressImage(f)
      setFile(compressed)
    }
  }

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault()
    if (!file || !date || !total) {
      setMessage('Please provide image, date and total')
      return
    }
    if (!isValidISODate(date)) {
      setMessage('Invalid date. Please choose a valid date (YYYY-MM-DD).')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('date', date)
      fd.append('total', total)
      // Optional OCR metadata
      if (timeText) fd.append('time_text', timeText)
      if (gallons) fd.append('gallons', gallons)
      if (pricePerGallon) fd.append('price_per_gallon', pricePerGallon)
      if (fuelGrade) fd.append('fuel_grade', fuelGrade)
      if (station) fd.append('station', station)
      if (stationAddress) fd.append('station_address', stationAddress)
      if (paymentMethod) fd.append('payment_method', paymentMethod)
      if (cardLast4) fd.append('card_last4', cardLast4)
      if (ocrConfidence) fd.append('ocr_confidence', ocrConfidence)
      if (ocrRaw) fd.append('ocr', JSON.stringify(ocrRaw))
      if (!navigator.onLine) {
        await enqueueUpload(fd)
        setMessage('You are offline. The receipt was saved and will upload automatically when you are online.')
      } else {
        const res = await callEdgeFunctionMultipart('upload-receipt', fd)
        setMessage('Uploaded successfully')
      }
      setFile(null)
      setDate('')
      setTotal('')
      setTimeText(''); setGallons(''); setPricePerGallon(''); setFuelGrade(''); setStation(''); setStationAddress(''); setPaymentMethod(''); setCardLast4(''); setOcrConfidence(''); setOcrRaw(null)
    } catch (err:any) {
      // If network failure, queue offline
      try {
        if (err?.name === 'TypeError' || !navigator.onLine) {
          const fd = new FormData()
          if (file) fd.append('file', file)
          fd.append('date', date)
          fd.append('total', total)
          if (timeText) fd.append('time_text', timeText)
          if (gallons) fd.append('gallons', gallons)
          if (pricePerGallon) fd.append('price_per_gallon', pricePerGallon)
          if (fuelGrade) fd.append('fuel_grade', fuelGrade)
          if (station) fd.append('station', station)
          if (stationAddress) fd.append('station_address', stationAddress)
          if (paymentMethod) fd.append('payment_method', paymentMethod)
          if (cardLast4) fd.append('card_last4', cardLast4)
          if (ocrConfidence) fd.append('ocr_confidence', ocrConfidence)
          if (ocrRaw) fd.append('ocr', JSON.stringify(ocrRaw))
          await enqueueUpload(fd)
          setMessage('Network issue. Saved offline and will upload automatically later.')
        } else {
          setMessage(err.message || 'Upload failed')
        }
      } catch {
        setMessage(err?.message || 'Upload failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border shadow-sm p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-900">Capture Receipt</h2>
        </div>
        <CameraCaptureV2 onCapture={onCaptured} />
      </div>
      <form onSubmit={onSubmit} className="space-y-3 bg-white rounded-xl border shadow-sm p-3 md:p-4">
        <h2 className="font-semibold text-gray-900">Upload Details</h2>
        <input type="file" accept="image/*" onChange={onFileChange} className="block w-full border rounded-lg p-2" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600">Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded-lg w-full p-2" required />
          </div>
          <div>
            <label className="block text-sm text-gray-600">Total ($)</label>
            <input type="number" step="0.01" value={total} onChange={e=>setTotal(e.target.value)} className="border rounded-lg w-full p-2" required />
          </div>
        </div>
        <details className="bg-gray-50 border rounded-lg p-3">
          <summary className="cursor-pointer font-medium">Optional details (from OCR)</summary>
          <div className="grid md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-sm text-gray-600">Time</label>
              <input type="text" value={timeText} onChange={e=>setTimeText(e.target.value)} className="border rounded-lg w-full p-2" placeholder="HH:MM" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Gallons</label>
              <input type="number" step="0.001" value={gallons} onChange={e=>setGallons(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Price/Gal</label>
              <input type="number" step="0.001" value={pricePerGallon} onChange={e=>setPricePerGallon(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Fuel Grade</label>
              <input type="text" value={fuelGrade} onChange={e=>setFuelGrade(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Station</label>
              <input type="text" value={station} onChange={e=>setStation(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Station Address</label>
              <input type="text" value={stationAddress} onChange={e=>setStationAddress(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Payment Method</label>
              <input type="text" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Card Last4</label>
              <input type="text" value={cardLast4} onChange={e=>setCardLast4(e.target.value)} maxLength={4} className="border rounded-lg w-full p-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">OCR Confidence</label>
              <input type="number" step="0.01" value={ocrConfidence} onChange={e=>setOcrConfidence(e.target.value)} className="border rounded-lg w-full p-2" />
            </div>
          </div>
        </details>
        <button disabled={busy} className="w-full md:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-gray-400 hover:bg-blue-700">{busy ? 'Uploading...' : 'Submit'}</button>
        {message && <div className="text-sm text-gray-700">{message}</div>}
        {file && <Preview file={file} />}
      </form>
      <BulkZipUpload />
    </div>
  )
}

function Preview({ file }: { file: File }) {
  const [url, setUrl] = React.useState<string>('')
  React.useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <img src={url} alt="preview" className="mt-2 max-h-64 object-contain border rounded" />
  )
}

function HistoryPanel() {
  return (
    <div>
      <ReceiptList scope="officer" />
    </div>
  )
}

function SettingsPanel() {
  return (
    <div>
      <CardManagement />
    </div>
  )
}
