# form-web

Next.js 16 App Router public form renderer.

## Purpose

Lightweight, CDN-deployable public surface for dynamic forms. Handles:
- Public link forms at `/f/:slug`
- Event-keyed entry at `/e/:eventKey` (with `?return_url=` redirect flow)
- Iframe-embed mode at `/embed/:formId` with iframe-resizer height sync
- Thank-you pages at `/thank-you/:submissionId`

Authentication for private forms is gated in middleware (Wave 4 / L11).

## Port

`4202` — run locally with `pnpm dev`.

## Plan

See [/form-plan.md](../form-plan.md) for the full architecture and phased rollout.
