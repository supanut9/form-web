/**
 * GET /auth/logout
 *
 *  1. Reads session token from form_web_session cookie.
 *  2. Best-effort POST /v1/auth/logout to form-api.
 *  3. Clears the session cookie.
 *  4. 302-redirects to /auth/login.
 *
 * Note: use prefetch={false} or plain <a> for any logout link to avoid
 * Next.js Link prefetch silently triggering this route (see project memory).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, clearSessionCookie } from '@/lib/session'

const FORM_API_URL = process.env['NEXT_PUBLIC_FORM_API_URL'] ?? 'http://localhost:4200'
const FORM_WEB_ORIGIN = process.env['NEXT_PUBLIC_FORM_WEB_ORIGIN'] ?? 'http://localhost:4202'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (token) {
    try {
      await fetch(`${FORM_API_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
    } catch {
      // Ignore network failures — local cookie is cleared regardless
    }
  }

  await clearSessionCookie()

  return NextResponse.redirect(new URL('/auth/login', FORM_WEB_ORIGIN))
}
