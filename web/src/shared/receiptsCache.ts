// Simple IndexedDB cache for receipts list. Caches first page per filter key.

const DB_NAME = 'receipts-cache'
const STORE = 'lists'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedReceipts(key: string): Promise<{ receipts: any[]; count: number; cachedAt: number } | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const val: any = await new Promise((res, rej) => {
      const r = store.get(key)
      r.onsuccess = () => res(r.result || null)
      r.onerror = () => rej(r.error)
    })
    db.close()
    return val
  } catch {
    return null
  }
}

export async function setCachedReceipts(key: string, receipts: any[], count: number): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const item = { key, receipts, count, cachedAt: Date.now() }
    await new Promise<void>((res, rej) => {
      const r = store.put(item)
      r.onsuccess = () => res()
      r.onerror = () => rej(r.error)
    })
    tx.commit?.()
    db.close()
  } catch {}
}

export function makeReceiptsCacheKey(scope: 'officer'|'manager', filters: any): string {
  // Only include stable filters for key; ignore pagination
  const { user_id, status, date_from, date_to, amount_min, amount_max } = filters || {}
  const keyObj = { scope, user_id, status, date_from, date_to, amount_min, amount_max }
  return 'rk:' + JSON.stringify(keyObj)
}
