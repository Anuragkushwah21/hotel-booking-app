// lib/email.ts — transactional account / OTP emails.
// Booking notifications live in lib/notifications.ts; both send through the
// single SMTP transport in lib/mailer.ts.

import { getMailer, mailFrom } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'
import { issueOtp, verifyOtp, OTP_TTL_MINUTES, type IssueResult, type VerifyResult } from '@/lib/otp'
import { escapeHtml } from '@/lib/security'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'HotelBook'

function layout(title: string, body: string): string {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 16px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 24px; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 24px; font-weight: bold; color: #D97706;">${escapeHtml(APP_NAME)}</div>
            <h1 style="font-size: 20px;">${escapeHtml(title)}</h1>
          </div>
          ${body}
          <p style="text-align: center; color: #999; font-size: 12px; margin-top: 32px;">
            &copy; ${new Date().getFullYear()} ${escapeHtml(APP_NAME)}
          </p>
        </div>
      </body>
    </html>`
}

function codeBlock(code: string): string {
  return `
    <div style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; padding: 15px; background-color: #f5f5f5; border-radius: 6px; margin: 20px 0;">
      ${code}
    </div>
    <p style="background-color: #fff3cd; padding: 10px; border-radius: 4px;">
      This code expires in ${OTP_TTL_MINUTES} minutes. Never share it with anyone — hotel staff will never ask for it.
    </p>`
}

// -------------------------
// Email verification (signup)
// -------------------------

export async function createAndSendEmailOtp(
  email: string,
  name?: string | null,
): Promise<{ success: true } | { success: false; reason: 'COOLDOWN' | 'TOO_MANY' | 'SEND_FAILED'; retryAfterSeconds?: number }> {
  const normalized = email.trim().toLowerCase()
  const issued = await issueOtp({ purpose: 'EMAIL_VERIFY', subject: normalized, destination: normalized })
  if (!issued.ok) return { success: false, reason: issued.reason, retryAfterSeconds: issued.retryAfterSeconds }

  try {
    await getMailer().sendMail({
      from: mailFrom(),
      to: normalized,
      subject: `${APP_NAME} - Your verification code`,
      html: layout(
        'Email verification code',
        `<p>Hi ${escapeHtml(name)},</p>
         <p>Use the code below to verify your email address.</p>
         ${codeBlock(issued.code)}
         <p>If you didn't create this account, you can safely ignore this email.</p>`,
      ),
    })
    return { success: true }
  } catch (error) {
    console.error('[email] verification code send failed:', (error as Error).message)
    return { success: false, reason: 'SEND_FAILED' }
  }
}

/** Verify a signup code and mark the account verified. */
export async function verifyEmailOtp(email: string, code: string): Promise<VerifyResult> {
  const normalized = email.trim().toLowerCase()
  const result = await verifyOtp({ purpose: 'EMAIL_VERIFY', subject: normalized, code })
  if (result.ok) {
    await prisma.user.updateMany({ where: { email: normalized }, data: { emailVerified: true } })
  }
  return result
}

// -------------------------
// Guest booking lookup
// -------------------------

/**
 * Send one lookup code to every email address on the matched bookings (a phone
 * number can match bookings made under different emails). Returns the issue
 * result so the caller can report cooldowns.
 */
export async function sendBookingLookupOtp(subject: string, destinations: string[]): Promise<IssueResult> {
  const issued = await issueOtp({ purpose: 'BOOKING_LOOKUP', subject, destination: destinations.join(',') })
  if (!issued.ok) return issued

  await Promise.all(
    destinations.map((to) =>
      getMailer()
        .sendMail({
          from: mailFrom(),
          to,
          subject: `${APP_NAME} - Your booking access code`,
          html: layout(
            'Booking access code',
            `<p>Someone asked to view the bookings linked to this email address.</p>
             ${codeBlock(issued.code)}
             <p>If this wasn't you, ignore this email — nobody can see your booking without this code.</p>`,
          ),
        })
        .catch((error) => console.error('[email] lookup code send failed:', (error as Error).message)),
    ),
  )
  return issued
}

// -------------------------
// Password reset / staff invite (link based)
// -------------------------

export async function sendPasswordResetEmail(
  email: string,
  name: string | null,
  resetToken: string,
  kind: 'RESET' | 'INVITE' = 'RESET',
): Promise<boolean> {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${encodeURIComponent(resetToken)}`
  const invite = kind === 'INVITE'
  try {
    await getMailer().sendMail({
      from: mailFrom(),
      to: email,
      subject: invite ? `${APP_NAME} - You've been invited to the staff dashboard` : `${APP_NAME} - Reset your password`,
      html: layout(
        invite ? 'Set up your staff account' : 'Password reset request',
        `<p>Hi ${escapeHtml(name)},</p>
         <p>${
           invite
             ? `You've been added as a member of staff at ${escapeHtml(APP_NAME)}. Choose a password to activate your account.`
             : 'We received a request to reset your password. Click the button below to choose a new one.'
         }</p>
         <p style="text-align: center;">
           <a href="${link}" style="display: inline-block; background-color: #D97706; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none;">
             ${invite ? 'Set your password' : 'Reset password'}
           </a>
         </p>
         <p>Or paste this link into your browser:</p>
         <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">${link}</p>
         <p style="background-color: #fff3cd; padding: 10px; border-radius: 4px;">
           This link expires in ${invite ? '72 hours' : '1 hour'} and can be used once.
           ${invite ? '' : "If you didn't ask for a reset, ignore this email — your password won't change."}
         </p>`,
      ),
    })
    return true
  } catch (error) {
    console.error('[email] password link send failed:', (error as Error).message)
    return false
  }
}
