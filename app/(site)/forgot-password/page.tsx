'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** POST /api/auth/forgot-password { email } — always 200 so it never reveals which emails have accounts. */
function ForgotPasswordContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentMessage, setSentMessage] = useState('')

  useEffect(() => {
    const fromQuery = searchParams.get('email')
    if (fromQuery) setEmail(fromQuery)
  }, [searchParams])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const value = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        setError(data.error || 'Too many requests. Please wait a few minutes and try again.')
        return
      }
      if (!res.ok) {
        setError(data.error || 'Could not send the reset link. Please try again.')
        return
      }
      setSentMessage(
        data.message ||
          'If an account exists for that email, we’ve sent a link to reset your password.',
      )
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md p-8">
        {sentMessage ? (
          <div className="text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <MailCheck className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mb-2 text-2xl font-bold">Check your email</h1>
            <p className="text-muted-foreground" role="status">{sentMessage}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              The link expires soon, so use it shortly. Didn&apos;t get it? Check your spam folder or{' '}
              <button
                type="button"
                className="font-semibold text-primary hover:text-primary/80"
                onClick={() => setSentMessage('')}
              >
                try again
              </button>
              .
            </p>
            <Button className="mt-6 w-full" asChild>
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <h1 className="mb-2 text-3xl font-bold">Forgot password?</h1>
              <p className="text-muted-foreground">
                Enter the email you use to sign in and we&apos;ll send you a link to set a new password.
              </p>
            </div>

            <form onSubmit={submit} noValidate className="space-y-6">
              <div>
                <Label htmlFor="email" className="mb-2 block">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError('')
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  aria-invalid={!!error}
                  className="h-12"
                />
                {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
              </div>

              <Button type="submit" disabled={loading} className="h-12 w-full">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Sending…</> : 'Send reset link'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  )
}
