/**
 * Browser-safe SHA-256 helper using Web Crypto API.
 * Returns null when running in Node (SSR) — callers must handle that case.
 */

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Hash a File object and return hex digest. SSR-safe: returns null in Node.
 */
export async function sha256File(file: File): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const buf = await file.arrayBuffer()
  return sha256Hex(buf)
}
