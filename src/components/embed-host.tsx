"use client"

/**
 * EmbedHost — like PublicFormShell but for iframe embed mode.
 *
 * Differences:
 *  - No navigation after submit; postMessages to parent instead.
 *  - Suppresses the thank-you redirect — the parent decides the next view.
 *  - Sends `form-ready` once mounted so the parent can hide its loading spinner.
 *  - Accepts an `event_key`/`return_url` query param for parity with /f/:slug.
 */

import { useEffect } from "react"
import { Form } from "form-renderer"
import type { FormSpec, FormSubmissionPayload } from "form-renderer"
import { formClient, uploadFile } from "@/lib/form-client"

interface SubmitResponse {
  submission_id: string
  redirect_url?: string | null
  thank_you?: unknown
}

interface Props {
  spec: FormSpec
  formSlug: string
  formId: string
  eventKey?: string
  returnUrl?: string
}

export function EmbedHost({
  spec,
  formSlug,
  formId,
  eventKey,
  returnUrl,
}: Props) {
  // Tell the parent we're mounted (used by iframe-resizer's parent hook + SDK).
  useEffect(() => {
    safePostToParent({ type: "form-ready", formId })
  }, [formId])

  async function handleSubmit(payload: FormSubmissionPayload) {
    try {
      const resolved = await resolveFileUploads(payload, formSlug)

      const body: Record<string, unknown> = { payload: resolved }
      if (eventKey) body.event_key = eventKey
      if (returnUrl) body.return_url = returnUrl

      const result = await formClient.post<SubmitResponse>(
        `/public/forms/${formSlug}/submit`,
        { body, cache: "no-store" } as RequestInit & { body: unknown },
      )

      safePostToParent({
        type: "form-submit",
        formId,
        submissionId: result.submission_id,
        redirectUrl: result.redirect_url ?? null,
        eventKey: eventKey ?? null,
      })
    } catch (err) {
      safePostToParent({
        type: "form-error",
        formId,
        message: err instanceof Error ? err.message : "Submit failed",
      })
    }
  }

  return <Form spec={spec} onSubmit={handleSubmit} />
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safePostToParent(msg: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  // Parent's origin is whatever embedded us; we don't know it ahead of time
  // (it can be any consumer), so we wildcard. The parent re-validates origin
  // against the iframe URL it created.
  window.parent.postMessage(msg, "*")
}

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
          v instanceof File
            ? uploadFile(v, formSlug, fieldId)
            : Promise.resolve(v),
        ),
      )
      resolved[fieldId] = items
    } else {
      resolved[fieldId] = value
    }
  }
  return resolved
}
