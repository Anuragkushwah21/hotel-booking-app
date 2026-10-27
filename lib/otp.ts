/**
 * One-time codes for email verification and guest booking lookup.
 *
 *   - Codes come from crypto.randomInt, not Math.random.
 *   - Only an HMAC of (purpose, subject, code) is stored, so a database leak
 *     doesn't hand out live codes.
 *   - Every wrong guess increments `attempts`; after OTP_MAX_ATTEMPTS the code
 *     is dead and a new one has to be requested.
 *   - Sending is throttled: a cooldown between codes and an hourly cap per
 *     subject, so the endpoint can't be used to flood someone's inbox.
 *   - A code is single-use: verifying marks it, and a second verify fails.
 */

import type { OtpPurpose } from '@prisma/client'
import { prisma } from './prisma'
import { hmac, randomDigits, safeEqual } from './security'

export const OTP_TTL_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 5
export const OTP_RESEND_COOLDOWN_SECONDS = 60
export const OTP_MAX_SENDS_PER_HOUR = 5

function hashCode(purpose: OtpPurpose, subject: string, code: string): string {
  return hmac(`otp:v1:${purpose}:${subject}:${code}`)
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: 'COOLDOWN' | 'TOO_MANY'; retryAfterSeconds: number }

export async function issueOtp(input: {
  purpose: OtpPurpose
  subject: string
  destination: string
}): Promise<IssueResult> {
  const now = Date.now()
  const recent = await prisma.oTPCode.findMany({
    where: { purpose: input.purpose, subject: input.subject, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  const last = recent[0]?.createdAt.getTime()
  if (last && now - last < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    return { ok: false, reason: 'COOLDOWN', retryAfterSeconds: Math.ceil((last + OTP_RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000) }
  }
  if (recent.length >= OTP_MAX_SENDS_PER_HOUR) {
    const oldest = recent[recent.length - 1].createdAt.getTime()
    return { ok: false, reason: 'TOO_MANY', retryAfterSeconds: Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000) }
  }

  const code = randomDigits(6)
  const expiresAt = new Date(now + OTP_TTL_MINUTES * 60 * 1000)

  // Only the newest code is ever valid. Old rows are kept (expired) so the
  // hourly cap above still counts them.
  await prisma.$transaction([
    prisma.oTPCode.updateMany({
      where: { purpose: input.purpose, subject: input.subject, verifiedAt: null, expiresAt: { gt: new Date(now) } },
      data: { expiresAt: new Date(now) },
    }),
    prisma.oTPCode.create({
      data: {
        purpose: input.purpose,
        subject: input.subject,
        destination: input.destination,
        codeHash: hashCode(input.purpose, input.subject, code),
        expiresAt,
      },
    }),
  ])

  return { ok: true, code, expiresAt }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'LOCKED'; attemptsLeft: number }

export async function verifyOtp(input: { purpose: OtpPurpose; subject: string; code: string }): Promise<VerifyResult> {
  const code = input.code.replace(/\D/g, '')
  const otp = await prisma.oTPCode.findFirst({
    where: { purpose: input.purpose, subject: input.subject, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp || otp.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'EXPIRED', attemptsLeft: 0 }
  }

  // Spend an attempt *before* comparing, conditionally, so parallel guesses
  // can't exceed the limit.
  const spent = await prisma.oTPCode.updateMany({
    where: { id: otp.id, verifiedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (spent.count === 0) return { ok: false, reason: 'LOCKED', attemptsLeft: 0 }

  const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - (otp.attempts + 1))
  if (code.length !== 6 || !safeEqual(hashCode(input.purpose, input.subject, code), otp.codeHash)) {
    return { ok: false, reason: attemptsLeft === 0 ? 'LOCKED' : 'INVALID', attemptsLeft }
  }

  const used = await prisma.oTPCode.updateMany({
    where: { id: otp.id, verifiedAt: null },
    data: { verifiedAt: new Date() },
  })
  if (used.count === 0) return { ok: false, reason: 'EXPIRED', attemptsLeft: 0 }
  return { ok: true }
}

export function otpErrorMessage(r: Exclude<VerifyResult, { ok: true }>): string {
  switch (r.reason) {
    case 'EXPIRED':
      return 'This code has expired. Please request a new one.'
    case 'LOCKED':
      return 'Too many wrong attempts. Please request a new code.'
    default:
      return `That code is incorrect. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left.`
  }
}

/** Old rows are only needed for the hourly send cap. */
export async function purgeOldOtps(): Promise<number> {
  const { count } = await prisma.oTPCode.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  return count
}
