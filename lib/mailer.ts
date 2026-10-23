/**
 * The app's single SMTP transport — OTP mail (lib/email.ts) and booking
 * notifications (lib/notifications.ts) both send through it.
 *
 * Configured from SMTP_HOST / SMTP_PORT / SMTP_SECURE with EMAIL_USER /
 * EMAIL_PASSWORD; defaults to Gmail, which is what the project used before.
 */

import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null

export function mailConfigured(): boolean {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD)
}

export function getMailer(): nodemailer.Transporter {
  if (!transporter) {
    if (!mailConfigured()) {
      console.warn('EMAIL_USER or EMAIL_PASSWORD missing. Emails will fail to send.')
    }
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }
  return transporter
}

export function mailFrom(): string {
  return `"${process.env.NEXT_PUBLIC_APP_NAME || 'HotelBook'}" <${
    process.env.SMTP_FROM_EMAIL || process.env.EMAIL_USER
  }>`
}
