'use client'

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp'
import { cn } from '@/lib/utils'

/**
 * Six-box one-time-code input. Built on `input-otp`, so paste, SMS/email
 * autofill (autocomplete="one-time-code") and the mobile numeric keypad all work.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  length = 6,
  id,
  autoFocus,
  'aria-describedby': describedBy,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  length?: number
  id?: string
  autoFocus?: boolean
  'aria-describedby'?: string
}) {
  return (
    <OTPInput
      id={id}
      maxLength={length}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      aria-label={`${length}-digit code`}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      containerClassName={cn('flex items-center justify-center gap-2 has-[:disabled]:opacity-60')}
      render={({ slots }) => (
        <div className="flex gap-1.5 sm:gap-2">
          {slots.map((slot, i) => (
            <Slot key={i} {...slot} invalid={invalid} />
          ))}
        </div>
      )}
    />
  )
}

function Slot({ char, hasFakeCaret, isActive, invalid }: SlotProps & { invalid?: boolean }) {
  return (
    <div
      className={cn(
        'relative flex h-12 w-10 items-center justify-center rounded-md border bg-background text-xl font-semibold tabular-nums transition sm:h-14 sm:w-12',
        isActive ? 'border-primary ring-2 ring-primary/30' : 'border-input',
        invalid && 'border-destructive',
      )}
    >
      {char}
      {hasFakeCaret && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="h-6 w-px animate-pulse bg-foreground" />
        </span>
      )}
    </div>
  )
}
