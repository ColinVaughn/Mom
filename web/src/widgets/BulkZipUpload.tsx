import React from 'react'
import JSZip from 'jszip'
import { callEdgeFunctionMultipart } from '../shared/api'

export default function BulkZipUpload() {
  const [log, setLog] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  const onFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setLog([])
    try {
      const zip = await JSZip.loadAsync(file)
      const entries = Object.values(zip.files)
      let success = 0, failed = 0
      for (const entry of entries) {
        if (entry.dir) continue
        const name = entry.name
        const ext = name.split('.').pop()?.toLowerCase()
        if (!ext || !['jpg','jpeg','png','webp'].includes(ext)) {
          setLog(l => [...l, `Skip ${name}: not an image`])
          continue
        }
        // Expect name format: YYYY-MM-DD_amount.ext (e.g., 2025-01-15_42.37.jpg)
        const m = name.match(/(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[_-]([0-9]+(?:\.[0-9]{2})?)/)
        if (!m) {
          setLog(l => [...l, `Skip ${name}: filename must contain date and amount, e.g., 2025-01-15_42.37.jpg`])
          failed++
          continue
        }
        const date = `${m[1]}-${m[2]}-${m[3]}`
        const total = m[4]
        try {
          const arrayBuffer = await entry.async('arraybuffer')
          const blob = new Blob([arrayBuffer], { type: ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg') })
          const image = new File([blob], name, { type: blob.type })
          const fd = new FormData()
          fd.append('file', image)
          fd.append('date', date)
          fd.append('total', total)
          await callEdgeFunctionMultipart('upload-receipt', fd)
          success++
          setLog(l => [...l, `OK ${name}`])
        } catch (err:any) {
          failed++
          setLog(l => [...l, `Fail ${name}: ${err.message || err}`])
        }
      }
      setLog(l => [...l, `Done: ${success} uploaded, ${failed} failed.`])
    } catch (err:any) {
      setLog([`Error reading zip: ${err.message || err}`])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-2">Bulk Upload (ZIP)</h3>
      <p className="text-xs text-gray-600 mb-2">Zip images named like <code>YYYY-MM-DD_amount.jpg</code> (e.g., 2025-01-15_42.37.jpg)</p>
      <input type="file" accept="application/zip" onChange={onFile} disabled={busy} />
      <div className="mt-2 text-xs whitespace-pre-wrap bg-gray-50 border rounded p-2 h-32 overflow-auto">
        {log.join('\n') || 'Logs will appear here.'}
      </div>
    </div>
  )
}
