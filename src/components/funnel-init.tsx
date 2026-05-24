'use client'

/**
 * FunnelInit — mounts the funnel batcher for a given form slug.
 *
 * - Calls initFunnel(slug) once on mount.
 * - Fires a 'view' event immediately.
 * - Mounts the delegated field_focus listener on [data-form-root].
 * - Tears down on unmount.
 *
 * Rendered as a zero-UI component inside the server-component page wrappers.
 */

import { useEffect } from 'react'
import { initFunnel, track, mountFieldFocusListener } from '@/lib/funnel'

interface Props {
  slug: string
}

export function FunnelInit({ slug }: Props) {
  useEffect(() => {
    initFunnel(slug)
    track({ name: 'view' })
    const cleanup = mountFieldFocusListener()
    return cleanup
  }, [slug])

  return null
}
