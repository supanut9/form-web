'use client'

/**
 * PaymentBlock — Stripe Elements wrapper for the form payment page.
 *
 * Injected into the renderer via PaymentBlockHostInjectionContext so that
 * form-renderer itself stays free of any Stripe imports. Only form-web
 * (which can accept Stripe as a direct dep) uses this component.
 *
 * Flow:
 *   1. On mount, POST /v1/public/forms/:slug/payment-intent to get
 *      { client_secret, payment_intent_id, publishable_key, amount_minor, currency }.
 *   2. loadStripe(publishable_key) is memoised.
 *   3. Stripe Elements renders <PaymentElement> + "Pay" button.
 *   4. On confirm: success → calls onPaymentReady(payment_intent_id).
 *                  error   → calls onError(message).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { Alert, Button, Loader, Stack, Text } from '@mantine/core'
import type { PaymentBlockComponentProps } from 'form-renderer'
import { formClient } from '@/lib/form-client'

// ── Types returned by the L8 endpoint ────────────────────────────────────────

interface PaymentIntentResponse {
  client_secret: string
  payment_intent_id: string
  amount_minor: number
  currency: string
  publishable_key: string | null
}

// ── Inner form component (must be inside <Elements>) ─────────────────────────

interface InnerFormProps {
  paymentIntentId: string
  onPaymentReady: (id: string) => void
  onError: (msg: string) => void
}

function StripePaymentForm({ paymentIntentId, onPaymentReady, onError }: InnerFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)

  const handlePay = useCallback(async () => {
    if (!stripe || !elements) return
    setPaying(true)
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.href : '',
        },
        redirect: 'if_required',
      })

      if (error) {
        onError(error.message ?? 'Payment failed')
      } else if (paymentIntent?.status === 'succeeded') {
        onPaymentReady(paymentIntentId)
      } else {
        onError(`Unexpected payment status: ${paymentIntent?.status ?? 'unknown'}`)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }, [stripe, elements, paymentIntentId, onPaymentReady, onError])

  return (
    <Stack gap="md">
      <PaymentElement />
      <Button onClick={handlePay} loading={paying} disabled={!stripe || !elements}>
        Pay
      </Button>
    </Stack>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export function PaymentBlock({
  formSlug,
  onPaymentReady,
  onError,
  apiBaseUrl,
}: PaymentBlockComponentProps) {
  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  // Track whether we've already called the endpoint to avoid double-fire in
  // React Strict Mode double-invoke.
  const fetchedRef = useRef(false)

  // Suppress apiBaseUrl unused warning; currently formClient uses its own
  // base URL from env. A future enhancement could pass it through.
  void apiBaseUrl

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    formClient
      .post<PaymentIntentResponse>(`/public/forms/${formSlug}/payment-intent`, {
        cache: 'no-store',
      })
      .then((data) => {
        setIntent(data)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not initialise payment'
        setInitError(msg)
        onError(msg)
      })
      .finally(() => {
        setLoading(false)
      })
    // Intentionally not re-running on formSlug change — the payment page is
    // mounted once per form session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Memoize the Stripe promise so it isn't re-created on every render.
  const stripePromise = useMemo(() => {
    if (!intent?.publishable_key) return null
    return loadStripe(intent.publishable_key)
  }, [intent?.publishable_key])

  const elementsOptions = useMemo<StripeElementsOptions | undefined>(() => {
    if (!intent?.client_secret) return undefined
    return { clientSecret: intent.client_secret }
  }, [intent?.client_secret])

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="md" />
        <Text size="sm" c="dimmed">
          Preparing payment…
        </Text>
      </Stack>
    )
  }

  if (initError || !intent || !stripePromise || !elementsOptions) {
    return (
      <Alert color="red" title="Payment unavailable">
        {initError ?? 'Payment could not be initialised. Please try again.'}
      </Alert>
    )
  }

  const isTestMode = intent.publishable_key?.startsWith('pk_test_') ?? false

  return (
    <Stack gap="md">
      {isTestMode && (
        <Alert color="yellow" title="Test mode">
          This form is in Stripe test mode. No real charges will be made.
        </Alert>
      )}
      <Elements stripe={stripePromise} options={elementsOptions}>
        <StripePaymentForm
          paymentIntentId={intent.payment_intent_id}
          onPaymentReady={onPaymentReady}
          onError={onError}
        />
      </Elements>
    </Stack>
  )
}
