const DB_NAME = 'etn-nft-launchpad-drafts'
const DB_VERSION = 1
const FILE_STORE = 'draft-files'

export const DRAFT_FILE_STAGE_THRESHOLD = 50

type DraftFileRecord = {
  key: string
  file: File
  updatedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Could not open draft file store.'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, mode)
        const store = tx.objectStore(FILE_STORE)
        const request = fn(store)
        request.onerror = () => reject(request.error ?? new Error('Draft file store request failed.'))
        request.onsuccess = () => resolve(request.result)
        tx.oncomplete = () => db.close()
        tx.onerror = () => reject(tx.error ?? new Error('Draft file store transaction failed.'))
      }),
  )
}

export function buildSessionStagedFileKey(sessionId: string, tokenId: number): string {
  return `session:${sessionId}:${tokenId}`
}

export function buildCollectionStagedFileKey(collectionId: string, tokenId: number): string {
  return `collection:${collectionId}:${tokenId}`
}

export async function stageDraftFile(key: string, file: File): Promise<void> {
  await runTransaction('readwrite', (store) =>
    store.put({ key, file, updatedAt: Date.now() } satisfies DraftFileRecord),
  )
}

export async function getStagedDraftFile(key: string): Promise<File | null> {
  const record = await runTransaction<DraftFileRecord | undefined>('readonly', (store) => store.get(key))
  return record?.file ?? null
}

export async function deleteStagedDraftFile(key: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(key))
}

export async function rekeyStagedDraftFile(fromKey: string, toKey: string): Promise<void> {
  const file = await getStagedDraftFile(fromKey)
  if (!file) return
  await stageDraftFile(toKey, file)
  await deleteStagedDraftFile(fromKey)
}

export async function migrateSessionStagedFiles(
  sessionId: string,
  collectionId: string,
  tokenIds: number[],
): Promise<void> {
  for (const tokenId of tokenIds) {
    const fromKey = buildSessionStagedFileKey(sessionId, tokenId)
    const toKey = buildCollectionStagedFileKey(collectionId, tokenId)
    await rekeyStagedDraftFile(fromKey, toKey)
  }
}

export async function clearStagedDraftFiles(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteStagedDraftFile(key)))
}
