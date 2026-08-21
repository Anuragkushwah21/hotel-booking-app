'use client'

import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, MailWarning, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const RESEND_COOLDOWN_SECONDS = 30

function VerifyEmailPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [verified, setVerified] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fromQuery = searchParams.get('email')
    if (fromQuery) {
      setEmail(fromQuery)
    } else {
      // Landing here directly (bookmark, refresh without the query string)
      // used to leave `email` permanently empty with no way to supply it —
      // every verify attempt then failed with "Email and code are required".
      setEditingEmail(true)
    }
  }, [searchParams])

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!email.trim()) {
      setError('Enter the email address you signed up with.')
      setEditingEmail(true)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Invalid or expired code')
      }

      // Confirm before navigating — the old version pushed straight to /login,
      // so a successful verification looked identical to being bounced.
      setVerified(true)
      setTimeout(() => router.push('/login'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify code')
      setCode('')
      codeRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = useCallback(async () => {
    setError('')
    setInfo('')

    if (!email.trim()) {
      // Previously `if (!email) return` — the button looked functional but
      // silently did nothing.
      setError('Enter your email address first.')
      setEditingEmail(true)
      return
    }

    setResendLoading(true)
    try {
      const response = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code')
      }

      // The API answers 200 with { success: false } when the address is
      // already verified. Checking only `response.ok` rendered that as a
      // green success message and stranded the user on this page.
      if (data.success === false) {
        setInfo('')
        setError(data.message || 'Could not resend the code.')
        if (/already verified/i.test(data.message ?? '')) {
          setTimeout(() => router.push('/login'), 1500)
        }
        return
      }

      setInfo(data.message || 'Verification code has been resent to your email.')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code')
    } finally {
      setResendLoading(false)
    }
  }, [email, router])

  if (verified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <h1 className="mb-2 text-2xl font-bold text-foreground">Email verified</h1>
          <p className="text-sm text-foreground/70">
            Your account is active. Taking you to the login page…
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/login">Continue to login</Link>
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-2xl font-bold text-foreground">Verify your email</h1>
          <p className="text-sm text-foreground/70">
            {email && !editingEmail ? (
              <>
                We&apos;ve sent a 6-digit code to{' '}
                <span className="font-semibold text-foreground">{email}</span>. Enter it
                below to activate your account.
              </>
            ) : (
              <>Enter the email you signed up with and the 6-digit code we sent you.</>
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="mb-4 rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-700">
            {info}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-5">
          {editingEmail ? (
            <div>
              <Label htmlFor="email" className="mb-2 block text-sm font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                placeholder="you@example.com"
                className="h-11"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingEmail(true)}
              className="flex items-center gap-1.5 text-xs text-foreground/60 hover:text-primary"
            >
              <Pencil className="h-3 w-3" />
              Wrong email? Change it
            </button>
          )}

          <div>
            <Label htmlFor="code" className="mb-2 block text-sm font-medium">
              Verification code
            </Label>
            <Input
              id="code"
              ref={codeRef}
              type="text"
              // Numeric keypad on mobile, and lets the OS offer the code from
              // the email/SMS instead of forcing a manual retype.
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                if (error) setError('')
              }}
              placeholder="123456"
              required
              className="h-12 text-center text-lg tracking-[0.5em]"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || code.length !== 6}
            className="h-12 w-full"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-foreground/70">
          <p>
            Didn&apos;t receive the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading || cooldown > 0}
              className="font-semibold text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resendLoading
                ? 'Resending…'
                : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : 'Resend code'}
            </button>
          </p>
          <p className="mt-3 text-xs text-foreground/50">
            The code expires 10 minutes after it is sent.
          </p>
        </div>
      </Card>
    </div>
  )
}

/**
 * useSearchParams() forces client-side bailout, which Next requires to sit
 * behind a Suspense boundary or the page fails to prerender at build time.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          Loading…
        </div>
      }
    >
      <VerifyEmailPageContent />
    </Suspense>
  )
}
