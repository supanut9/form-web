/**
 * Server-side session management for form-web.
 *
 * Session cookie name: form_web_session
 * Mirrors form-admin/src/lib/session.ts with form-web-specific names.
 *
 * getSession()      — reads cookie, validates via /v1/auth/me, returns account
 * setSessionCookie  — writes the httpOnly session cookie
 * clearSessionCookie — deletes the session cookie
 */

import { cookies } from 'next/headers'
import { cache } from 'react'

export const SESSION_COOKIE = 'form_web_session'

const FORM_API_URL = process.env['NEXT_PUBLIC_FORM_API_URL'] ?? 'http://localhost:4200'

export interface SessionAccount {
  sub: string
  email: string
  name: string
  abilities: string[]
}

// cache() memoizes per request (React server-side request cache)
export const getSession = cache(async (): Promise<SessionAccount | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  let res: Response
  try {
    res = await fetch(`${FORM_API_URL}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (!res.ok) return null

  const data = (await res.json()) as {
    sub: string
    email: string
    name: string
    abilities: string[]
  }

  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    abilities: data.abilities,
  }
})

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
