/**
 * WhatsApp delivery, behind a provider interface so the booking code never
 * changes when a provider is connected.
 *
 * Today: if WHATSAPP_PROVIDER is unset, `getWhatsAppProvider()` returns null
 * and the notification service leaves the message PENDING in NotificationLog,
 * ready to be sent once a provider is configured.
 *
 * To go live with Meta's WhatsApp Cloud API set:
 *   WHATSAPP_PROVIDER=meta
 *   WHATSAPP_TOKEN=<permanent access token>
 *   WHATSAPP_PHONE_NUMBER_ID=<sender phone number id>
 * Note: Meta only allows free-form text inside a 24h customer-service window;
 * outside it you must send an approved template — implement `sendTemplate`
 * here when your templates are approved.
 */

export type WhatsAppResult = { ok: true; id?: string } | { ok: false; error: string }

export interface WhatsAppProvider {
  readonly name: string
  sendText(to: string, body: string): Promise<WhatsAppResult>
}

/** E.164 without the plus, defaulting bare 10-digit numbers to India (+91). */
export function normalizeWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length >= 11 && digits.length <= 15) return digits
  return null
}

class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta'
  constructor(private token: string, private phoneNumberId: string) {}

  async sendText(to: string, body: string): Promise<WhatsAppResult> {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: (data as any)?.error?.message || `HTTP ${res.status}` }
      }
      return { ok: true, id: (data as any)?.messages?.[0]?.id }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Network error' }
    }
  }
}

export function getWhatsAppProvider(): WhatsAppProvider | null {
  if (process.env.WHATSAPP_PROVIDER === 'meta') {
    const token = process.env.WHATSAPP_TOKEN
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (token && phoneId) return new MetaCloudProvider(token, phoneId)
    console.warn('[whatsapp] WHATSAPP_PROVIDER=meta but token / phone number id missing')
  }
  return null
}
