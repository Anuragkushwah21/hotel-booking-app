import { beforeEach, describe, expect, it, vi } from 'vitest'
import { issueOtp, OTP_MAX_ATTEMPTS, verifyOtp } from '@/lib/otp'

// In-memory stand-in for the OTPCode table — enough to exercise the rules.
type Row = { id: string; purpose: string; subject: string; destination: string; codeHash: string; expiresAt: Date; verifiedAt: Date | null; attempts: number; createdAt: Date }
// vi.mock factories are hoisted above imports, so shared state must be too.
const { rows } = vi.hoisted(() => ({ rows: [] as Row[] }))
const match = (r: Row, w: any) =>
  (!w.id || r.id === w.id) &&
  (!w.purpose || r.purpose === w.purpose) &&
  (!w.subject || r.subject === w.subject) &&
  (w.verifiedAt !== null || r.verifiedAt === null) &&
  (!w.attempts?.lt || r.attempts < w.attempts.lt) &&
  (!w.createdAt?.gt || r.createdAt > w.createdAt.gt) &&
  (!w.expiresAt?.gt || r.expiresAt > w.expiresAt.gt)

vi.mock('@/lib/prisma', () => {
  const oTPCode = {
    findMany: async ({ where }: any) => rows.filter((r) => match(r, where)).sort((a, b) => +b.createdAt - +a.createdAt),
    findFirst: async ({ where }: any) => rows.filter((r) => match(r, where)).sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null,
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => match(r, where))
      for (const r of hit) {
        if (data.attempts?.increment) r.attempts += data.attempts.increment
        if (data.verifiedAt) r.verifiedAt = data.verifiedAt
        if (data.expiresAt) r.expiresAt = data.expiresAt
      }
      return { count: hit.length }
    },
    create: async ({ data }: any) => {
      const row = { id: String(rows.length + 1), verifiedAt: null, attempts: 0, createdAt: new Date(), ...data }
      rows.push(row)
      return row
    },
  }
  return { prisma: { oTPCode, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) } }
})


const subject = 'ref:HB-7K4M2Q'
const purpose = 'BOOKING_LOOKUP' as const

describe('OTP', () => {
  beforeEach(() => {
    rows.length = 0
  })

  it('stores only a hash and accepts the right code exactly once', async () => {
    const issued = await issueOtp({ purpose, subject, destination: 'g@x.in' })
    if (!issued.ok) throw new Error('expected a code')
    expect(rows[0].codeHash).not.toContain(issued.code)
    expect(await verifyOtp({ purpose, subject, code: issued.code })).toEqual({ ok: true })
    expect((await verifyOtp({ purpose, subject, code: issued.code })).ok).toBe(false)
  })

  it('locks the code after the maximum number of wrong guesses', async () => {
    const issued = await issueOtp({ purpose, subject, destination: 'g@x.in' })
    if (!issued.ok) throw new Error('expected a code')
    const wrong = issued.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await verifyOtp({ purpose, subject, code: wrong })
    const after = await verifyOtp({ purpose, subject, code: issued.code })
    expect(after).toMatchObject({ ok: false, reason: 'LOCKED' })
  })

  it('enforces a resend cooldown', async () => {
    await issueOtp({ purpose, subject, destination: 'g@x.in' })
    const again = await issueOtp({ purpose, subject, destination: 'g@x.in' })
    expect(again).toMatchObject({ ok: false, reason: 'COOLDOWN' })
  })

  it('a code for one booking does not open another', async () => {
    const issued = await issueOtp({ purpose, subject, destination: 'g@x.in' })
    if (!issued.ok) throw new Error('expected a code')
    const other = await verifyOtp({ purpose, subject: 'ref:HB-ZZZZZZ', code: issued.code })
    expect(other.ok).toBe(false)
  })
})
