import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-foreground text-background mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold">H</span>
              </div>
              <span className="font-semibold text-lg">HotelBook</span>
            </div>
            <p className="text-background/80 text-sm">
              Your trusted platform for discovering and booking hotels worldwide.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Browse</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/hotels" className="text-background/80 hover:text-background transition">
                  Hotels
                </Link>
              </li>
              <li>
                <Link href="/destinations" className="text-background/80 hover:text-background transition">
                  Destinations
                </Link>
              </li>
              <li>
                <Link href="/deals" className="text-background/80 hover:text-background transition">
                  Special Deals
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="font-semibold mb-4">Account</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/login" className="text-background/80 hover:text-background transition">
                  Login
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-background/80 hover:text-background transition">
                  Sign Up
                </Link>
              </li>
              <li>
                <Link href="/bookings" className="text-background/80 hover:text-background transition">
                  My Bookings
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-4">Support</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/help" className="text-background/80 hover:text-background transition">
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-background/80 hover:text-background transition">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-background/80 hover:text-background transition">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-background/20 mt-8 pt-8 flex justify-between items-center">
          <p className="text-background/60 text-sm">&copy; 2026 HotelBook. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="text-background/60 hover:text-background transition">
              Twitter
            </a>
            <a href="#" className="text-background/60 hover:text-background transition">
              Facebook
            </a>
            <a href="#" className="text-background/60 hover:text-background transition">
              Instagram
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
