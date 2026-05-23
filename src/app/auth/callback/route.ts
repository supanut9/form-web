/**
 * GET /auth/callback
 *
 * OIDC authorization code callback for form-web.
 *  1. Reads ?code= and ?state= from query string.
 *  2. Reads code_verifier, expected state, return_to from httpOnly cookies.
 *  3. Calls handleCallback() → delegates code exchange to form-api.
 *  4. Stores form-api session JWT in form_web_session cookie.
 *  5. Clears PKCE / state cookies.
 *  6. 302-redirects to original return_to.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import {
  handleCallback,
  COOKIE_CODE_VERIFIER,
  COOKIE_STATE,
  COOKIE_RETURN_TO,
} from '@/lib/oidc'
import { setSessionCookie } from '@/lib/session'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_params', request.url))
  }

  const cookieStore = await cookies()
  const storedState = cookieStore.get(COOKIE_STATE)?.value
  const codeVerifier = cookieStore.get(COOKIE_CODE_VERIFIER)?.value
  const returnTo = cookieStore.get(COOKIE_RETURN_TO)?.value ?? '/'

  if (!storedState || !codeVerifier) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_pkce', request.url))
  }

  let session: Awaited<ReturnType<typeof handleCallback>>
  try {
    session = await handleCallback(code, state, storedState, codeVerifier)
  } catch (err) {
    console.error('[auth/callback] handleCallback failed:', err)
    return NextResponse.redirect(new URL('/auth/login?error=callback_failed', request.url))
  }

  await setSessionCookie(session.sessionToken, session.expiresAt)

  // Clear single-use PKCE cookies
  cookieStore.delete(COOKIE_CODE_VERIFIER)
  cookieStore.delete(COOKIE_STATE)
  cookieStore.delete(COOKIE_RETURN_TO)

  const destination = returnTo.startsWith('/')
    ? new URL(returnTo, request.url)
    : new URL(returnTo)

  return NextResponse.redirect(destination)
}
