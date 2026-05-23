/**
 * form-client — typed fetch wrapper for form-api.
 *
 * All calls are directed at NEXT_PUBLIC_FORM_API_URL.
 * Server-side: forwards cookies via `credentials: 'include'` headers;
 * Client-side: relies on browser same-origin cookies + CORS credentials.
 */

import { sha256File } from './sha256'

// Browser-side calls go through the same-origin Next API proxy so the
// httpOnly form_web_session cookie can be read server-side and forwarded
// as Authorization: Bearer. Server-side calls hit form-api directly.
const baseUrl =
  typeof window !== 'undefined'
    ? '/api/proxy'
    : (process.env.NEXT_PUBLIC_FORM_API_URL ?? 'http://localhost:4200')

type RequestOptions = Omit<RequestInit, 'method' | 'body'> & {
  body?: unknown
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, ...rest } = options
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...rest.headers,
    },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`form-api ${method} ${path} → ${res.status}: ${text}`)
  }

  // 204 No Content (e.g. /prefill when there's nothing to prefill) → null
  if (res.status === 204) {
    return null as unknown as T
  }

  return res.json() as Promise<T>
}

export const formClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) =>
    request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) =>
    request<T>('PUT', path, options),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, options),
}

// ---------------------------------------------------------------------------
// File upload helpers (Lane 10 endpoints)
// ---------------------------------------------------------------------------

export interface PresignRequest {
  filename: string
  content_type: string
  size: number
  form_slug?: string
  field_id?: string
}

export interface PresignResponse {
  file_id: string
  storage_key: string
  upload_url: string
  expires_in: number
}

export interface ConfirmRequest {
  file_id: string
  sha256: string
}

export interface ConfirmResponse {
  file_id: string
  storage_key: string
  mime: string
  size: number
  sha256: string
}

/**
 * Upload a single File via the presign → PUT → confirm flow.
 * Returns the confirmed file_id to embed in the submission payload.
 *
 * TODO: add upload progress (currently just a bare PUT).
 */
export async function uploadFile(
  file: File,
  formSlug: string,
  fieldId: string,
): Promise<string> {
  const sha = await sha256File(file)
  if (!sha) throw new Error('sha256File returned null — must run in browser')

  const presignBody: PresignRequest = {
    filename: file.name,
    content_type: file.type || 'application/octet-stream',
    size: file.size,
    form_slug: formSlug,
    field_id: fieldId,
  }

  const { upload_url, file_id } = await formClient.post<PresignResponse>(
    '/public/files/presign',
    { body: presignBody },
  )

  const uploadRes = await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!uploadRes.ok) {
    throw new Error(`File upload failed: ${uploadRes.status}`)
  }

  const confirmed = await formClient.post<ConfirmResponse>(
    '/public/files/confirm',
    { body: { file_id, sha256: sha } satisfies ConfirmRequest },
  )

  return confirmed.file_id
}
