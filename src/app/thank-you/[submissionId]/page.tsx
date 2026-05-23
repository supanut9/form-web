/**
 * /thank-you/[submissionId] — post-submit confirmation page (server component).
 *
 * Reads ?form_slug= to fetch the form's thank_you block.
 * Renders title + body paragraphs (plain-text split on \n\n — TODO: replace
 * with a proper markdown renderer in a future wave).
 *
 * If thank_you.redirect_url_template is set, interpolates %SUBMISSION_ID%
 * and renders a meta-refresh redirect after 3 seconds.
 */

import { notFound } from 'next/navigation'
import { formClient } from '@/lib/form-client'
import type { FormSpec } from 'form-renderer'

interface FormResponse {
  id: string
  slug: string
  title: string
  type: 'main' | 'dynamic'
  current_version: number
  spec_json: FormSpec
}

interface PageProps {
  params: Promise<{ submissionId: string }>
  searchParams: Promise<{ form_slug?: string; return_url?: string }>
}

export default async function ThankYouPage({ params, searchParams }: PageProps) {
  const { submissionId } = await params
  const { form_slug, return_url } = await searchParams

  if (!form_slug) {
    // No slug means we can't look up the thank-you config — show generic message
    return <GenericThankYou returnUrl={return_url} />
  }

  let form: FormResponse
  try {
    form = await formClient.get<FormResponse>(`/public/forms/${form_slug}`, {
      cache: 'no-store',
    } as RequestInit)
  } catch {
    notFound()
  }

  const thankYou = form.spec_json.thank_you

  if (!thankYou) {
    return <GenericThankYou returnUrl={return_url} />
  }

  // Interpolate {submission_id}, {return_url}, {event_key} placeholders.
  // Falls back to the caller-supplied return_url when no template is configured.
  const interpolate = (tmpl: string) =>
    tmpl
      .replace(/\{submission_id\}/g, submissionId)
      .replace(/\{return_url\}/g, return_url ?? '')
      .replace(/\{event_key\}/g, '')

  const redirectUrl = thankYou.redirect_url_template
    ? interpolate(thankYou.redirect_url_template)
    : null

  // Split body_md on double-newlines for minimal paragraph rendering
  // TODO(future wave): replace with a real markdown renderer (e.g. remark/rehype)
  const paragraphs = thankYou.body_md
    ? thankYou.body_md.split(/\n\n+/).filter(Boolean)
    : []

  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      {redirectUrl && (
        // eslint-disable-next-line @next/next/no-head-element
        <meta httpEquiv="refresh" content={`3;url=${redirectUrl}`} />
      )}

      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1rem' }}>
        {thankYou.title ?? 'Thank you!'}
      </h1>

      {paragraphs.map((p, i) => (
        <p key={i} style={{ marginBottom: '0.75rem', lineHeight: 1.6 }}>
          {p}
        </p>
      ))}

      {redirectUrl && (
        <p style={{ marginTop: '1.5rem', color: '#666', fontSize: '0.9rem' }}>
          You&apos;re being redirected…{' '}
          <a href={redirectUrl} style={{ color: 'inherit' }}>
            Click here if nothing happens.
          </a>
        </p>
      )}

      {!redirectUrl && return_url && (
        <a
          href={return_url}
          style={{
            display: 'inline-block',
            marginTop: '1.5rem',
            padding: '0.5rem 1.25rem',
            background: 'var(--form-primary, #228be6)',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          Go back
        </a>
      )}
    </main>
  )
}

function GenericThankYou({ returnUrl }: { returnUrl?: string }) {
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1rem' }}>Thank you!</h1>
      <p>Your response has been recorded.</p>
      {returnUrl && (
        <a
          href={returnUrl}
          style={{
            display: 'inline-block',
            marginTop: '1.5rem',
            padding: '0.5rem 1.25rem',
            background: '#228be6',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          Go back
        </a>
      )}
    </main>
  )
}
