/**
 * /e/[eventKey] — event form resolver (server component).
 *
 * Calls GET /v1/public/events/:eventKey/resolve (Lane 12 endpoint).
 * Expected shape: { form_slug, current_version, optional, access_mode }
 *
 * 302-redirects to /f/<form_slug> preserving return_url + event_key params.
 * return_url is validated through safeReturnTo before forwarding.
 */

import { redirect, notFound } from 'next/navigation'
import { formClient } from '@/lib/form-client'
import { safeReturnTo } from '@/lib/safe-return-to'

interface EventResolveResponse {
  form_slug: string
  current_version: number
  optional: boolean
  access_mode: string
}

const FORM_WEB_ORIGIN = process.env['NEXT_PUBLIC_FORM_WEB_ORIGIN'] ?? 'http://localhost:4202'

interface PageProps {
  params: Promise<{ eventKey: string }>
  searchParams: Promise<{ return_url?: string; [key: string]: string | undefined }>
}

export default async function EventFormPage({ params, searchParams }: PageProps) {
  const { eventKey } = await params
  const allSearchParams = await searchParams
  const { return_url, ...rest } = allSearchParams

  let resolved: EventResolveResponse
  try {
    resolved = await formClient.get<EventResolveResponse>(
      `/v1/public/events/${eventKey}/resolve`,
      { cache: 'no-store' } as RequestInit,
    )
  } catch {
    notFound()
  }

  // Validate return_url to prevent open redirect
  const safeReturn = return_url
    ? (safeReturnTo(return_url, [FORM_WEB_ORIGIN]) ?? undefined)
    : undefined

  // Build destination: /f/<slug>?return_url=<...>&event_key=<key>&<rest>
  const dest = new URLSearchParams()
  if (safeReturn) dest.set('return_url', safeReturn)
  dest.set('event_key', eventKey)

  // Forward any other innocuous query params (e.g. UTM params)
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && k !== 'return_url') dest.set(k, v)
  }

  const queryString = dest.toString()
  redirect(`/f/${resolved.form_slug}${queryString ? `?${queryString}` : ''}`)
}
