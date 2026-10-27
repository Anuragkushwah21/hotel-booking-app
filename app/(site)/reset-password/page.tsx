'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * /reset-password?token=…  →  POST /api/auth/reset-password { token, password }
 *
 * Used both for "forgot password" and by invited staff setting their first
 * password, so the wording stays neutral.
 */

const MIN_LENGTH = 8

function ResetPasswordContent() {
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})
  const [done, setDone] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const next: typeof fieldErrors = {}
    if (password.length < MIN_LENGTH) next.password = `Use at least ${MIN_LENGTH} characters.`
    if (confirm !== password) next.confirm = 'The passwords don’t match.'
    setFieldErrors(next)
    if (next.password || next.confirm) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'This link is invalid or has expired. Please request a new one.')
        return
      }
      setDone(data.message || 'Your password has been set. You can now sign in.')
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold">Link not valid</h1>
          <p className="text-muted-foreground">
            This password link is incomplete. Please open the link from your email again, or request a new one.
          </p>
          <Button className="mt-6 w-full" asChild>
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mb-2 text-2xl font-bold">Password set</h1>
          <p className="text-muted-foreground" role="status">{done}</p>
          <Button className="mt-6 w-full" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mb-2 text-3xl font-bold">Set a new password</h1>
        <p className="text-muted-foreground">Choose a password with at least {MIN_LENGTH} characters.</p>
      </div>

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}{' '}
          <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <Label htmlFor="password" className="mb-2 block">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setFieldErrors((f) => ({ ...f, password: undefined }))
              }}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
              aria-invalid={!!fieldErrors.password}
              className="h-12 pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p>}
        </div>

        <div>
          <Label htmlFor="confirm" className="mb-2 block">Confirm password</Label>
          <Input
            id="confirm"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setFieldErrors((f) => ({ ...f, confirm: undefined }))
            }}
            autoComplete="new-password"
            required
            aria-invalid={!!fieldErrors.confirm}
            className="h-12"
          />
          {fieldErrors.confirm && <p className="mt-1 text-xs text-destructive">{fieldErrors.confirm}</p>}
        </div>

        <Button type="submit" disabled={loading} className="h-12 w-full">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Saving…</> : 'Set password'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-primary">Back to sign in</Link>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md p-8">{children}</Card>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  )
}
