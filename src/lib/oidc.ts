/**
 * Server-side OIDC PKCE helpers for form-web.
 *
 * Mirrors form-admin/src/lib/oidc.ts but uses form_web_* cookie names
 * and NEXT_PUBLIC_FORM_WEB_ORIGIN. Implements PKCE via Web Crypto (no
 * openid-client dep — form-web does not have it installed).
 *
 * startLogin(returnTo)  →  authUrl to redirect browser to
 * handleCallback(code, state, storedState, codeVerifier)  →  CallbackSession
 */

import { cookies } from 'next/headers'

const FORM_API_URL = process.env['NEXT_PUBLIC_FORM_API_URL'] ?? 'http://localhost:4200'
const FORM_WEB_ORIGIN = process.env['NEXT_PUBLIC_FORM_WEB_ORIGIN'] ?? 'http://localhost:4202'

const OIDC_ISSUER = process.env['OIDC_ISSUER']!
const OIDC_CLIENT_ID = process.env['OIDC_CLIENT_ID']!
// form-web is a public PKCE client; client_secret is optional
const OIDC_CLIENT_SECRET = process.env['OIDC_CLIENT_SECRET'] ?? ''

const REDIRECT_URI = `${FORM_WEB_ORIGIN}/auth/callback`

// Cookie names — form-web-scoped to avoid clash with form-admin cookies
export const COOKIE_CODE_VERIFIER = 'form_web_cv'
export const COOKIE_STATE = 'form_web_state'
export const COOKIE_RETURN_TO = 'form_web_return_to'

// ---------------------------------------------------------------------------
// PKCE helpers (Web Crypto — works in Next.js edge and Node 20+)
// ---------------------------------------------------------------------------

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function randomBytes(length: number): string {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  return base64urlEncode(buf.buffer as ArrayBuffer)
}

async function pkceChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return base64urlEncode(digest)
}

// ---------------------------------------------------------------------------
// OIDC discovery (lazy-cached per process)
// ---------------------------------------------------------------------------

interface OidcMeta {
  authorization_endpoint: string
  token_endpoint: string
}

let _meta: OidcMeta | null = null

async function getOidcMeta(): Promise<OidcMeta> {
  if (_meta) return _meta
  const res = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`, {
    cache: 'force-cache',
  })
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`)
  _meta = (await res.json()) as OidcMeta
  return _meta
}

// ---------------------------------------------------------------------------
// startLogin
// ---------------------------------------------------------------------------

export interface StartLoginResult {
  authUrl: string
}

export async function startLogin(returnTo: string): Promise<StartLoginResult> {
  const meta = await getOidcMeta()

  const codeVerifier = randomBytes(32)
  const codeChallenge = await pkceChallenge(codeVerifier)
  const state = randomBytes(16)

  const url = new URL(meta.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', OIDC_CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)

  const cookieStore = await cookies()
  const cookieOpts = {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  }

  cookieStore.set(COOKIE_CODE_VERIFIER, codeVerifier, cookieOpts)
  cookieStore.set(COOKIE_STATE, state, cookieOpts)
  cookieStore.set(COOKIE_RETURN_TO, returnTo, cookieOpts)

  return { authUrl: url.toString() }
}

// ---------------------------------------------------------------------------
// handleCallback
// ---------------------------------------------------------------------------

export interface CallbackSession {
  sessionToken: string
  expiresAt: string
  account: {
    sub: string
    email: string
    name: string
    picture: string | null
    abilities: string[]
  }
}

export async function handleCallback(
  code: string,
  state: string,
  storedState: string,
  codeVerifier: string,
): Promise<CallbackSession> {
  if (state !== storedState) {
    throw new Error('OIDC state mismatch — possible CSRF attack')
  }

  // Delegate code → token exchange + id_token verification to form-api. The
  // endpoint exchanges with auth-server itself (server-to-server, including
  // its own client_secret) and mints the form-api user-session JWT we'll
  // forward on subsequent submits via /api/proxy.
  void OIDC_CLIENT_SECRET // unused: form-api uses its own secret server-side
  const res = await fetch(`${FORM_API_URL}/public/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`form-api callback failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as {
    session_token: string
    expires_at: string
    account: {
      sub: string
      email: string
      name: string
      picture: string | null
      abilities: string[]
    }
  }

  return {
    sessionToken: data.session_token,
    expiresAt: data.expires_at,
    account: data.account,
  }
}
