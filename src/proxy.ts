/**
 * Next.js 16 middleware (exported as `proxy`).
 *
 * Handles two concerns for form-web:
 *
 * /embed/:formId*
 *   Reaffirm the permissive framing headers that next.config.ts sets. Also
 *   strip X-Frame-Options (Next.js sets SAMEORIGIN by default; the config
 *   value may not override on all deployment targets).
 *
 * /f/:slug* and /e/:eventKey*
 *   NOTE: Access-mode gating (private_oidc) is intentionally deferred to the
 *   page server component. The middleware cannot cheaply fetch the form spec
 *   on the edge to know the access mode. The page component reads the form
 *   spec and performs the auth bounce if needed.
 *
 * Wave 4 / Lane L11 will add per-form auth gating here once the event/form
 * resolver routes are wired.
 */
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/embed/')) {
    const response = NextResponse.next();
    // Ensure no X-Frame-Options is sent
    response.headers.set('X-Frame-Options', '');
    // Allow embedding from any origin
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    return response;
  }

  // /f/* and /e/* — pass through; page components handle auth gating
  return NextResponse.next();
}

export const config = {
  matcher: ['/f/:path*', '/e/:path*', '/embed/:path*'],
};
