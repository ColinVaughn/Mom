// Simple IndexedDB-based offline queue for receipt uploads
// Stores FormData fields and file blob, and can flush when online.

const DB_NAME = 'receipt-queue'
const STORE = 'uploads'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueUpload(form: FormData) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    let fileBlob: Blob | null = null
    let fileName = 'receipt.jpg'
    let fileType = 'image/jpeg'
    const fields: Record<string, string> = {}
    for (const [k, v] of form.entries()) {
      if (k === 'file' && v instanceof File) {
        fileBlob = v
        fileName = v.name
        fileType = v.type || 'image/jpeg'
      } else if (typeof v === 'string') {
        fields[k] = v
      }
    }
    if (!fileBlob) throw new Error('missing file')
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    await new Promise((res, rej) => {
      const putReq = store.put({ id, createdAt: Date.now(), fileBlob, fileName, fileType, fields })
      putReq.onsuccess = () => res(null)
      putReq.onerror = () => rej(putReq.error)
    })
    tx.commit?.()
    db.close()
    return { id }
  } catch (e) {
    console.warn('enqueueUpload failed', e)
    return null
  }
}

export async function listQueued(): Promise<any[]> {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  const items: any[] = []
  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        items.push(cursor.value)
        cursor.continue()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error)
  })
  db.close()
  return items
}

export async function removeQueued(id: string) {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  tx.commit?.()
  db.close()
}

export async function flushPending(getToken: () => Promise<string | undefined>) {
  const items = await listQueued()
  if (!items.length) return { flushed: 0 }
  let flushed = 0
  for (const it of items) {
    const fd = new FormData()
    // Rebuild file
    const file = new File([it.fileBlob], it.fileName || 'receipt.jpg', { type: it.fileType || 'image/jpeg' })
    fd.append('file', file)
    for (const [k, v] of Object.entries(it.fields || {}) as Array<[string, string]>) {
      fd.append(k, v)
    }
    const token = await getToken()
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-receipt`
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      if (res.ok) {
        await removeQueued(it.id)
        flushed++
      } else {
        // If server rejected (4xx/5xx), stop; user may need to fix
        break
      }
    } catch (e) {
      // Network still offline: stop processing
      break
    }
  }
  return { flushed }
}

export function attachOnlineFlush(getToken: () => Promise<string | undefined>) {
  const handler = () => { flushPending(getToken) }
  window.addEventListener('online', handler)
  // Return a detach function
  return () => window.removeEventListener('online', handler)
}
