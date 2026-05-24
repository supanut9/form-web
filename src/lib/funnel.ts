/**
 * funnel.ts — client-side funnel event batcher for form-web.
 *
 * Usage:
 *   initFunnel(slug)           — call once on mount (e.g. in a useEffect)
 *   track({ name, ... })       — enqueue a funnel event
 *   useFunnelPageHook(pageId)  — React hook for page_enter / page_exit tracking
 *
 * Flush triggers:
 *   1. Timer: every 5 seconds
 *   2. Queue depth: when queue reaches 20 events
 *   3. Unload: beforeunload / pagehide via navigator.sendBeacon
 *
 * SSR guard: module-level mutable state is only initialised when `window` exists.
 */

'use client'

import { useEffect, useRef } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunnelEventName =
  | 'view'
  | 'page_enter'
  | 'page_exit'
  | 'field_focus'

export interface FunnelEvent {
  name: FunnelEventName
  page_id?: string
  field_id?: string
  submission_id?: string
  occurred_at: string
}

interface TrackOptions {
  name: FunnelEventName
  page_id?: string
  field_id?: string
  submission_id?: string
}

// ---------------------------------------------------------------------------
// Module-level state (only alive in the browser)
// ---------------------------------------------------------------------------

const MAX_BATCH = 50
const QUEUE_FLUSH_THRESHOLD = 20
const FLUSH_INTERVAL_MS = 5_000
const FIELD_FOCUS_COALESCE_MS = 500

let _slug: string | null = null
let _queue: FunnelEvent[] = []
let _timer: ReturnType<typeof setInterval> | null = null
let _lastFieldFocusKey: string | null = null
let _lastFieldFocusAt = 0

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise the batcher for a given form slug.
 * Safe to call multiple times (idempotent if slug is unchanged).
 */
export function initFunnel(slug: string): void {
  if (typeof window === 'undefined') return

  _slug = slug

  // Start the periodic flush loop (once only)
  if (_timer === null) {
    _timer = setInterval(() => {
      void flush('timer')
    }, FLUSH_INTERVAL_MS)
  }

  // Unload flush — beacon path
  const handleUnload = () => {
    flushBeacon()
  }

  // Remove previous listeners before adding to avoid duplicates if reinitialised
  window.removeEventListener('beforeunload', handleUnload)
  window.removeEventListener('pagehide', handleUnload)
  window.addEventListener('beforeunload', handleUnload)
  window.addEventListener('pagehide', handleUnload)
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

export function track(opts: TrackOptions): void {
  if (typeof window === 'undefined') return
  if (!_slug) {
    // initFunnel not called yet; silently drop
    return
  }

  // Coalesce field_focus events that fire within 500ms of the same field
  if (opts.name === 'field_focus') {
    const key = `${opts.field_id ?? ''}:${opts.page_id ?? ''}`
    const now = Date.now()
    if (key === _lastFieldFocusKey && now - _lastFieldFocusAt < FIELD_FOCUS_COALESCE_MS) {
      return
    }
    _lastFieldFocusKey = key
    _lastFieldFocusAt = now
  }

  const event: FunnelEvent = {
    name: opts.name,
    occurred_at: new Date().toISOString(),
  }
  if (opts.page_id !== undefined) event.page_id = opts.page_id
  if (opts.field_id !== undefined) event.field_id = opts.field_id
  if (opts.submission_id !== undefined) event.submission_id = opts.submission_id

  _queue.push(event)

  if (_queue.length >= QUEUE_FLUSH_THRESHOLD) {
    void flush('threshold')
  }
}

// ---------------------------------------------------------------------------
// Flush — fetch path (normal, async)
// ---------------------------------------------------------------------------

async function flush(reason: string): Promise<void> {
  if (typeof window === 'undefined') return
  if (!_slug || _queue.length === 0) return

  // Drain up to MAX_BATCH events
  const batch = _queue.splice(0, MAX_BATCH)
  const slug = _slug

  try {
    const res = await fetch(`/api/proxy/v1/public/forms/${slug}/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ events: batch }),
    })
    if (!res.ok) {
      // Re-queue on failure so events aren't silently lost
      _queue = [...batch, ..._queue]
    }
  } catch {
    // Network error — re-queue
    _queue = [...batch, ..._queue]
  }

  void reason // suppress unused warning
}

// ---------------------------------------------------------------------------
// Flush — sendBeacon path (unload)
// ---------------------------------------------------------------------------

function flushBeacon(): void {
  if (typeof navigator === 'undefined') return
  if (!_slug || _queue.length === 0) return

  const slug = _slug
  // Beacon is fire-and-forget. Drain in chunks of MAX_BATCH.
  while (_queue.length > 0) {
    const batch = _queue.splice(0, MAX_BATCH)
    const body = JSON.stringify({ events: batch })
    const url = `/api/proxy/v1/public/forms/${slug}/funnel`
    if (!navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
      // Beacon failed (page is kept alive, or quota exceeded) — put back
      _queue = [...batch, ..._queue]
      break
    }
  }
}

// ---------------------------------------------------------------------------
// useFunnelPageHook — page_enter / page_exit tracking
// ---------------------------------------------------------------------------

/**
 * Call inside the form host component whenever `currentPageId` changes.
 *
 * Fires `page_enter` when `currentPageId` changes (or first mount).
 * Fires `page_exit` for the previous page on change, and on component unmount.
 *
 * Known gap: this hook requires the form host to know `currentPageId`. The
 * form-renderer's <Form> component does not currently expose page-change
 * callbacks, so L12 cannot wire page tracking automatically without modifying
 * form-renderer. The host page (e.g. a custom multi-step wrapper) should call
 * this hook directly if it tracks the current page index.
 */
export function useFunnelPageHook(currentPageId: string | undefined): void {
  const prevPageIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const prev = prevPageIdRef.current

    if (prev !== undefined && prev !== currentPageId) {
      track({ name: 'page_exit', page_id: prev })
    }

    if (currentPageId !== undefined) {
      track({ name: 'page_enter', page_id: currentPageId })
    }

    prevPageIdRef.current = currentPageId

    return () => {
      // Unmount — fire page_exit for whichever page was last active
      const current = prevPageIdRef.current
      if (current !== undefined) {
        track({ name: 'page_exit', page_id: current })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageId])
}

// ---------------------------------------------------------------------------
// Delegated field_focus listener
//
// Mount this once after initFunnel. Listens on the [data-form-root] container
// for `focusin` events from inputs/selects/textareas that carry a
// `data-field-id` attribute.
//
// Assumption: form-renderer's <Form> wraps each field's input element with a
// `data-field-id="<fieldId>"` attribute either on the input itself or a parent.
// If that attribute is absent, field_focus events are still tracked with an
// undefined field_id so funnel page-level metrics remain intact.
// ---------------------------------------------------------------------------

export function mountFieldFocusListener(pageId?: string): () => void {
  if (typeof window === 'undefined') return () => {}

  const root = document.querySelector('[data-form-root]')
  if (!root) return () => {}

  function onFocusIn(e: Event): void {
    const target = e.target as HTMLElement | null
    if (!target) return
    const tag = target.tagName.toLowerCase()
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return

    // Walk up from the target to find data-field-id
    let el: HTMLElement | null = target
    let fieldId: string | undefined
    while (el && el !== root) {
      const fid = el.dataset['fieldId']
      if (fid) {
        fieldId = fid
        break
      }
      el = el.parentElement
    }

    track({ name: 'field_focus', field_id: fieldId, page_id: pageId })
  }

  root.addEventListener('focusin', onFocusIn)
  return () => root.removeEventListener('focusin', onFocusIn)
}
