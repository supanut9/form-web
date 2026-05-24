/**
 * /embed/[formId] — iframe embed mode (server component shell).
 *
 * Fetches the published spec for `formId` (treated as slug-or-id) and renders
 * the form inside an embed-safe layout. The parent page can listen for these
 * postMessage events:
 *
 *   { type: 'form-ready' }
 *   { type: 'form-resize', height }
 *   { type: 'form-submit', formId, submissionId, redirectUrl?, eventKey? }
 *   { type: 'form-error',  message }
 *
 * Auto-height sync is provided by EmbedHeightSync; iframe-resizer or any
 * compatible parent listens for `form-resize` (or its own protocol).
 *
 * X-Frame-Options + CSP are relaxed for `/embed/*` in next.config.ts.
 */

import { notFound } from 'next/navigation'
import { formClient } from '@/lib/form-client'
import { EmbedHost } from '@/components/embed-host'
import { EmbedHeightSync } from '@/components/embed-height-sync'
import { FormWithPayment } from '@/components/form-with-payment'
import { FunnelInit } from '@/components/funnel-init'
import type { FormSpec } from 'form-renderer'

interface FormResponse {
  id: string
  slug: string
  title: string
  type: 'main' | 'dynamic'
  current_version: number
  spec_json: FormSpec
  schema_hash: string
}

async function fetchFormBySlugOrId(formId: string): Promise<FormResponse | null> {
  // Single endpoint already accepts either slug or UUID id.
  try {
    return await formClient.get<FormResponse>(`/public/forms/${formId}`, {
      cache: 'no-store',
    } as RequestInit)
  } catch {
    return null
  }
}

interface PageProps {
  params: Promise<{ formId: string }>
  searchParams: Promise<{ event_key?: string; return_url?: string }>
}

export default async function EmbedFormPage({ params, searchParams }: PageProps) {
  const { formId } = await params
  const { event_key, return_url } = await searchParams

  const form = await fetchFormBySlugOrId(formId)
  if (!form) notFound()

  return (
    <main
      data-embed-root="true"
      data-form-root
      style={{
        // Compact embed chrome: no margins so the iframe's own height matches
        // the form content perfectly. The parent controls the surrounding UX.
        padding: 16,
        background: 'transparent',
      }}
    >
      <EmbedHeightSync />
      <FunnelInit slug={form.slug} />
      <FormWithPayment>
        <EmbedHost
          spec={form.spec_json}
          formSlug={form.slug}
          formId={form.id}
          eventKey={event_key}
          returnUrl={return_url}
        />
      </FormWithPayment>
    </main>
  )
}
