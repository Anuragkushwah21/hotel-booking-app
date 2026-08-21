// lib/email.ts
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'

// -------------------------
// Transporter setup
// -------------------------

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.warn(
        'EMAIL_USER or EMAIL_PASSWORD missing. Emails will fail to send.',
      )
    }

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }
  return transporter
}

// -------------------------
// OTP helpers (email verification by code)
// -------------------------

function generateOtp(): string {
  // 6-digit
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function createAndSendEmailOtp(
  email: string,
  name?: string | null,
) {
  try {
    const transporter = getTransporter()

    // Purane unverified OTPs cleanup (optional)
    await prisma.oTPCode.deleteMany({
      where: {
        email,
        verifiedAt: null,
      },
    })

    const code = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min

    await prisma.oTPCode.create({
      data: {
        email,
        code,
        expiresAt,
      },
    })

    const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #D97706; }
            .code-box {
              font-size: 32px;
              letter-spacing: 8px;
              font-weight: bold;
              text-align: center;
              padding: 15px;
              background-color: #f5f5f5;
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
            .warning { background-color: #fff3cd; padding: 10px; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">HotelBook</div>
              <h1>Email Verification Code</h1>
            </div>

            <p>Hi ${name || ''},</p>
            <p>Thank you for signing up with HotelBook! Use the code below to verify your email address.</p>

            <div class="code-box">
              ${code}
            </div>

            <div class="warning">
              <strong>Note:</strong> This code will expire in 10 minutes.
            </div>

            <p>If you didn't create this account, you can safely ignore this email.</p>

            <p>Best regards,<br>HotelBook Team</p>

            <div class="footer">
              <p>&copy; 2024 HotelBook. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `

    await transporter.sendMail({
      from: `"HotelBook" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'HotelBook - Your verification code',
      html,
    })

    return { success: true }
  } catch (error) {
    console.error('[v0] Error creating/sending email OTP:', error)
    return { success: false }
  }
}

/**
 * Verify OTP and mark user as verified
 */
export async function verifyEmailOtp(email: string, code: string) {
  try {
    const now = new Date()

    const otpRecord = await prisma.oTPCode.findFirst({
      where: {
        email,
        code,
        expiresAt: { gt: now },
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      return { success: false, reason: 'INVALID_OR_EXPIRED' as const }
    }

    // attempts + verifiedAt update
    await prisma.oTPCode.update({
      where: { id: otpRecord.id },
      data: {
        verifiedAt: now,
        attempts: { increment: 1 },
      },
    })

    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    })

    return { success: true }
  } catch (error) {
    console.error('[v0] Error verifying email OTP:', error)
    return { success: false, reason: 'SERVER_ERROR' as const }
  }
}

// -------------------------
// (Optional) link-based verification helpers –
// Agar tum sirf OTP chahte ho, to neeche ka EmailVerificationToken
// related code ko hata sakte ho / comment kar sakte ho.
// -------------------------

// NOTE: the link-based EmailVerificationToken helpers were removed — the model
// they referenced does not exist in schema.prisma, so every call threw at
// runtime. Verification is OTP-based; see createAndSendEmailOtp/verifyEmailOtp
// above.

export async function markUserAsVerified(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
      },
    })
    return true
  } catch (error) {
    console.error('[v0] Error marking user as verified (Prisma):', error)
    return false
  }
}

// -------------------------
// Password reset email (link based) – as you had
// -------------------------

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetToken: string,
): Promise<boolean> {
  try {
    const transporter = getTransporter()
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'HotelBook - Reset Your Password',
      html: `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
              .header { text-align: center; margin-bottom: 30px; }
              .logo { font-size: 24px; font-weight: bold; color: #D97706; }
              .content { margin: 20px 0; line-height: 1.6; color: #333; }
              .button { 
                display: inline-block; 
                background-color: #D97706; 
                color: white; 
                padding: 12px 30px; 
                border-radius: 6px; 
                text-decoration: none; 
                margin: 20px 0;
              }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
              .warning { background-color: #fff3cd; padding: 10px; border-radius: 4px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">HotelBook</div>
                <h1>Password Reset Request</h1>
              </div>

              <div class="content">
                <p>Hi ${name},</p>
                <p>We received a request to reset your password. Click the button below to set a new password.</p>
                
                <div style="text-align: center;">
                  <a href="${resetLink}" class="button">Reset Password</a>
                </div>

                <p>Or copy and paste this link in your browser:</p>
                <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">
                  ${resetLink}
                </p>

                <div class="warning">
                  <strong>Note:</strong> This reset link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
                </div>

                <p>Best regards,<br>HotelBook Team</p>
              </div>

              <div class="footer">
                <p>&copy; 2024 HotelBook. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    }

    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('[v0] Error sending password reset email:', error)
    return false
  }
}

// -------------------------
// Booking confirmation email – mostly unchanged
// -------------------------

export async function sendBookingConfirmationEmail(
  email: string,
  name: string,
  bookingDetails: {
    hotelName: string
    roomType: string
    checkIn: string
    checkOut: string
    totalPrice: number
    bookingId: string
    guestCount: number
  },
): Promise<boolean> {
  try {
    const transporter = getTransporter()

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `HotelBook - Booking Confirmation #${bookingDetails.bookingId}`,
      html: `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; }
              .header { text-align: center; margin-bottom: 30px; }
              .logo { font-size: 24px; font-weight: bold; color: #D97706; }
              .booking-details { background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0; }
              .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
              .detail-label { font-weight: bold; color: #666; }
              .detail-value { color: #333; }
              .total-row { display: flex; justify-content: space-between; padding: 15px 0; font-size: 18px; font-weight: bold; border-top: 2px solid #D97706; }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">HotelBook</div>
                <h1>Booking Confirmation</h1>
              </div>

              <p>Hi ${name},</p>
              <p>Thank you for booking with HotelBook! Your reservation has been confirmed.</p>

              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Booking ID:</span>
                  <span class="detail-value">#${bookingDetails.bookingId}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Hotel:</span>
                  <span class="detail-value">${bookingDetails.hotelName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Room Type:</span>
                  <span class="detail-value">${bookingDetails.roomType}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Check-in:</span>
                  <span class="detail-value">${new Date(bookingDetails.checkIn).toLocaleDateString()}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Check-out:</span>
                  <span class="detail-value">${new Date(bookingDetails.checkOut).toLocaleDateString()}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Guests:</span>
                  <span class="detail-value">${bookingDetails.guestCount}</span>
                </div>
                <div class="total-row">
                  <span>Total Price:</span>
                  <span class="detail-value">$${bookingDetails.totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <p>You can manage your booking by logging into your account at HotelBook.</p>
              <p>Best regards,<br>HotelBook Team</p>

              <div class="footer">
                <p>&copy; 2024 HotelBook. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    }

    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error('[v0] Error sending booking confirmation email:', error)
    return false
  }
}