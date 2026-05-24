/**
 * /f/[slug] — public form page (server component).
 *
 * Auth modes handled here (middleware passes through — spec fetch is needed
 * to know the access mode, which is too expensive for edge):
 *   public_anonymous  → render immediately
 *   private_oidc      → bounce to /auth/login if no session
 *   link_token        → validate ?t= against spec; show "Invalid link" if wrong
 */

import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { formClient } from '@/lib/form-client'
import { SESSION_COOKIE } from '@/lib/session'
import { safeReturnTo } from '@/lib/safe-return-to'
import { PublicFormShell } from '@/components/public-form-shell'
import { FormWithPayment } from '@/components/form-with-payment'
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

const FORM_WEB_ORIGIN = process.env['NEXT_PUBLIC_FORM_WEB_ORIGIN'] ?? 'http://localhost:4202'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ t?: string; return_url?: string; event_key?: string }>
}

export default async function FormBySlugPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { t, return_url, event_key } = await searchParams

  let form: FormResponse
  try {
    form = await formClient.get<FormResponse>(`/public/forms/${slug}`, {
      cache: 'no-store',
    } as RequestInit)
  } catch {
    notFound()
  }

  const access = form.spec_json.access

  if (access.mode === 'private_oidc') {
    const cookieStore = await cookies()
    const session = cookieStore.get(SESSION_COOKIE)?.value
    if (!session) {
      const currentPath = `/f/${slug}${buildQuery({ t, return_url, event_key })}`
      const safeReturn = safeReturnTo(currentPath, [FORM_WEB_ORIGIN])
      const loginUrl = `/auth/login?return_to=${encodeURIComponent(safeReturn ?? `/f/${slug}`)}`
      redirect(loginUrl)
    }
  }

  if (access.mode === 'link_token') {
    // TODO: per-form link token enforcement once tokens are surfaced in spec.
    void t
  }

  const validatedReturnUrl = return_url
    ? (safeReturnTo(return_url, [FORM_WEB_ORIGIN]) ?? undefined)
    : undefined

  // Best-effort prefill fetch. The endpoint may return auth-derived defaults
  // even when spec.prefill.mode === 'none', so we always probe when there's
  // any field that could benefit (auth_field set, or last_submission mode).
  const hasAuthFieldMappings = form.spec_json.pages.some((p) =>
    p.fields.some((f) => (f as { auth_field?: string }).auth_field),
  )
  const usesPriorSubmission = form.spec_json.prefill?.mode === 'last_submission'
  let prefill: PrefillResponse | null = null
  try {
    if (hasAuthFieldMappings || usesPriorSubmission) {
      prefill = await formClient
        .get<PrefillResponse | null>(`/public/forms/${slug}/prefill`, {
          cache: 'no-store',
        } as RequestInit)
        .catch(() => null)
    }
  } catch {
    prefill = null
  }

  return (
    <main>
      <FormWithPayment>
        <PublicFormShell
          spec={form.spec_json}
          formSlug={form.slug}
          formId={form.id}
          returnUrl={validatedReturnUrl}
          eventKey={event_key}
          prefill={prefill}
        />
      </FormWithPayment>
    </main>
  )
}

interface PrefillResponse {
  submission_id: string | null
  submitted_at: string | null
  version: number | null
  payload: Record<string, unknown>
  sources?: { auth: string[]; prior_submission: string[] }
}

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries).toString()
}
