'use client'

/**
 * FormWithPayment — thin wrapper that provides the PaymentBlock component
 * to form-renderer via PaymentBlockHostInjectionContext.
 *
 * Usage (identical for /f/[slug] and /embed/[formId] routes):
 *
 *   <FormWithPayment>
 *     <PublicFormShell ... /> or <EmbedHost ... />
 *   </FormWithPayment>
 *
 * The context provider injects PaymentBlock into any <Form> rendered inside
 * so that form-renderer can mount it on the synthetic payment page without
 * directly importing Stripe.
 */

import React from 'react'
import { PaymentBlockHostInjectionContext } from 'form-renderer'
import { PaymentBlock } from './payment-block'

interface FormWithPaymentProps {
  children: React.ReactNode
}

export function FormWithPayment({ children }: FormWithPaymentProps) {
  return (
    <PaymentBlockHostInjectionContext.Provider value={PaymentBlock}>
      {children}
    </PaymentBlockHostInjectionContext.Provider>
  )
}
