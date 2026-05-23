/**
 * Theme loader — converts a FormTheme into Mantine-compatible CSS variable
 * overrides. Re-uses form-renderer's useTheme logic for the variable names so
 * both rendering contexts stay in sync.
 *
 * buildThemeCssVars  — pure function, safe to call server-side
 * injectCustomCss    — client-side only; injects raw custom_css into <head>
 */

import type { FormTheme } from 'form-renderer'

export interface ThemeCssVars {
  '--form-primary': string
  '--form-font-family': string
}

/**
 * Returns CSS variable values derived from a FormTheme.
 * These are applied to the page's root element or a Mantine theme override.
 */
export function buildThemeCssVars(theme: FormTheme): ThemeCssVars {
  return {
    '--form-primary': theme.primary_color ?? '#228be6',
    '--form-font-family': theme.font ?? 'inherit',
  }
}

/**
 * Injects a raw CSS string into the document <head> as a <style> tag.
 * No-ops in SSR. Idempotent via a data-attribute key.
 */
export function injectCustomCss(css: string, formId: string): void {
  if (typeof document === 'undefined') return
  const id = `form-custom-css-${formId}`
  const existing = document.getElementById(id)
  if (existing) {
    existing.textContent = css
    return
  }
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}
