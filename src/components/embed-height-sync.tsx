"use client"

/**
 * EmbedHeightSync — posts the form's height to its parent on every body
 * resize. The parent (SDK / consumer) listens for `form-resize` messages
 * and adjusts the iframe height accordingly.
 *
 * Protocol (parent ← child):
 *   { type: 'form-resize', height: number }
 *
 * Note: we deliberately do not depend on `iframe-resizer` here — the
 * postMessage contract is small enough to own, and avoiding the runtime
 * keeps the embed bundle lean and predictable across bundlers.
 */

import { useEffect } from "react"

export function EmbedHeightSync() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.parent === window) return // not in an iframe

    let lastHeight = 0
    function send(): void {
      const el = document.body
      const height = Math.ceil(el.getBoundingClientRect().height)
      if (height === lastHeight) return
      lastHeight = height
      window.parent.postMessage({ type: "form-resize", height }, "*")
    }

    send()
    const ro = new ResizeObserver(() => send())
    ro.observe(document.body)
    window.addEventListener("load", send)
    return () => {
      ro.disconnect()
      window.removeEventListener("load", send)
    }
  }, [])

  return null
}
