import { AuthProvider } from '@/components/auth-provider'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { WhatsAppButton } from '@/components/site/whatsapp-button'

/**
 * Chrome for the public-facing site only.
 *
 * These used to live in the root layout, which meant the admin dashboard was
 * rendered inside the marketing header and footer. The (site) route group
 * scopes them to guest-facing pages without changing any URL.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <WhatsAppButton />
    </AuthProvider>
  )
}
