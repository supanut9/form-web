'use client'

/**
 * PublicFormShell — client component wrapping form-renderer's <Form>.
 *
 * Handles:
 *  - Submission via POST /v1/public/forms/:slug/submit
 *  - File field interception: uploads each File via the presign→confirm flow,
 *    replaces File objects with returned file_ids before submit.
 *  - Post-submit navigation to /thank-you/<id> or inline redirect.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Form } from 'form-renderer'
import type { FormSpec, FormSubmissionPayload } from 'form-renderer'
import { formClient, uploadFile } from '@/lib/form-client'

interface SubmitResponse {
  submission_id: string
  thank_you?: {
    title: string
    body_md?: string
    redirect_url_template?: string
  }
  redirect_url?: string
}

interface PrefillData {
  /** Null when the prefill comes from auth claims only (no prior submission). */
  submission_id: string | null
  submitted_at: string | null
  version: number | null
  payload: Record<string, unknown>
  sources?: {
    auth: string[]
    prior_submission: string[]
  }
}

interface Props {
  spec: FormSpec
  formSlug: string
  formId: string
  returnUrl?: string
  eventKey?: string
  prefill?: PrefillData | null
}

export function PublicFormShell({
  spec,
  formSlug,
  formId,
  returnUrl,
  eventKey,
  prefill,
}: Props) {
  const router = useRouter()
  const [useDefaults, setUseDefaults] = useState<PrefillData | null>(prefill ?? null)

  async function handleSubmit(payload: FormSubmissionPayload) {
    // Intercept File objects: upload each and replace with file_id string
    const resolvedPayload = await resolveFileUploads(payload, formSlug)

    const body: Record<string, unknown> = { payload: resolvedPayload }
    if (eventKey) body['event_key'] = eventKey
    if (returnUrl) body['return_url'] = returnUrl

    const result = await formClient.post<SubmitResponse>(
      `/public/forms/${formSlug}/submit`,
      { body, cache: 'no-store' },
    )

    if (result.redirect_url) {
      window.location.href = result.redirect_url
      return
    }

    const thankYouParams = new URLSearchParams()
    thankYouParams.set('form_slug', formSlug)
    if (returnUrl) thankYouParams.set('return_url', returnUrl)

    router.push(`/thank-you/${result.submission_id}?${thankYouParams.toString()}`)
  }

  return (
    <>
      {useDefaults && Object.keys(useDefaults.payload).length > 0 && (
        <PrefillBanner
          prefill={useDefaults}
          onStartFresh={() => setUseDefaults(null)}
        />
      )}
      <Form
        // Re-mount the form when the prefill source changes so defaultValues
        // takes effect — react-hook-form caches defaults at register time.
        key={useDefaults?.submission_id ?? 'fresh'}
        spec={spec}
        defaultValues={useDefaults?.payload ?? undefined}
        onSubmit={handleSubmit}
      />
    </>
  )
}

function PrefillBanner({
  prefill,
  onStartFresh,
}: {
  prefill: PrefillData
  onStartFresh: () => void
}) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 14px',
        borderRadius: 6,
        background: 'var(--mantine-color-indigo-0, #eef2ff)',
        color: 'var(--mantine-color-indigo-7, #4338ca)',
        fontSize: 14,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        border: '1px solid var(--mantine-color-indigo-2, #c7d2fe)',
      }}
    >
      <div>
        {prefill.submitted_at ? (
          <>
            Editing your previous submission from{' '}
            <strong>{new Date(prefill.submitted_at).toLocaleString()}</strong>.
          </>
        ) : (
          <>Some fields are filled in from your account profile.</>
        )}
      </div>
      <button
        onClick={onStartFresh}
        style={{
          background: 'transparent',
          border: '1px solid currentColor',
          color: 'inherit',
          borderRadius: 4,
          padding: '4px 10px',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 12,
        }}
      >
        Start fresh
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveFileUploads(
  payload: FormSubmissionPayload,
  formSlug: string,
): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {}

  for (const [fieldId, value] of Object.entries(payload)) {
    if (value instanceof File) {
      resolved[fieldId] = await uploadFile(value, formSlug, fieldId)
    } else if (Array.isArray(value)) {
      const items = await Promise.all(
        value.map((v) =>
          v instanceof File ? uploadFile(v, formSlug, fieldId) : Promise.resolve(v),
        ),
      )
      resolved[fieldId] = items
    } else {
      resolved[fieldId] = value
    }
  }

  return resolved
}
