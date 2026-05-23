/**
 * GET /auth/login
 *
 * Initiates OIDC PKCE flow for form-web.
 *  1. Validates ?return_to via safeReturnTo against FORM_WEB_ORIGIN.
 *  2. Calls startLogin(returnTo) to build auth URL + set PKCE cookies.
 *  3. 302-redirects browser to auth-server authorization endpoint.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { startLogin } from '@/lib/oidc'
import { safeReturnTo } from '@/lib/safe-return-to'

const FORM_WEB_ORIGIN = process.env['NEXT_PUBLIC_FORM_WEB_ORIGIN'] ?? 'http://localhost:4202'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rawReturnTo = request.nextUrl.searchParams.get('return_to')
  const returnTo = safeReturnTo(rawReturnTo, [FORM_WEB_ORIGIN]) ?? '/'

  const { authUrl } = await startLogin(returnTo)

  return NextResponse.redirect(authUrl)
}
