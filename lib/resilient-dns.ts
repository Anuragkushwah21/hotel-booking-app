/**
 * Host resolution that survives a flaky resolver.
 *
 * Node connects through getaddrinfo (`dns.lookup`), which on macOS goes to
 * mDNSResponder. On this project's dev machines that resolver intermittently
 * fails in milliseconds with ENOTFOUND while DNS itself is perfectly healthy,
 * and the router has also been seen answering EREFUSED to direct queries.
 * Prisma reports either as `P1001 DatabaseNotReachable`, which reads like the
 * database is down when nothing is wrong with it.
 *
 * So we try, in order:
 *   1. the system resolver          (normal path, no behaviour change)
 *   2. direct DNS via c-ares        (works when only getaddrinfo is wedged)
 *   3. public resolvers 1.1.1.1/8.8.8.8 (works when the local DNS refuses)
 *   4. the last address that worked (keeps the app alive through an outage)
 *
 * Only step 1 runs when everything is healthy.
 */

import dns from 'dns'
import net from 'net'

const publicResolver = new dns.Resolver()
publicResolver.setServers(['1.1.1.1', '8.8.8.8'])

/** Last address that actually connected, per host. Never expires: it is the last resort. */
const lastKnownGood = new Map<string, string>()

/** One line per host per minute, so a wedged resolver can't flood the log. */
const lastWarnedAt = new Map<string, number>()
function warnOncePerMinute(host: string, message: string): void {
  const now = Date.now()
  if (now - (lastWarnedAt.get(host) ?? 0) < 60_000) return
  lastWarnedAt.set(host, now)
  console.warn(`[dns] ${host}: ${message}`)
}

type ResolveCallback = (error: NodeJS.ErrnoException | null, address?: string) => void

export function resolveHost(host: string, callback: ResolveCallback): void {
  dns.lookup(host, (lookupError, address) => {
    if (!lookupError) {
      lastKnownGood.set(host, address)
      return callback(null, address)
    }

    dns.resolve4(host, (caresError, addresses) => {
      if (!caresError && addresses?.length) {
        warnOncePerMinute(host, `system resolver failed (${lookupError.code}); used direct DNS`)
        lastKnownGood.set(host, addresses[0])
        return callback(null, addresses[0])
      }

      publicResolver.resolve4(host, (publicError, publicAddresses) => {
        if (!publicError && publicAddresses?.length) {
          warnOncePerMinute(
            host,
            `local DNS failed (${lookupError.code}/${caresError?.code}); used 1.1.1.1`,
          )
          lastKnownGood.set(host, publicAddresses[0])
          return callback(null, publicAddresses[0])
        }

        const cached = lastKnownGood.get(host)
        if (cached) {
          warnOncePerMinute(host, `every resolver failed; reusing last known address ${cached}`)
          return callback(null, cached)
        }

        // Nothing left to try: report the failure the machine actually has.
        callback(lookupError)
      })
    })
  })
}

/**
 * A socket that resolves through {@link resolveHost}.
 *
 * pg is still handed the hostname, so TLS keeps verifying against the real
 * certificate name — see the `net.isIP(host)` check in pg/lib/connection.js.
 */
export function createResilientSocket(): net.Socket {
  const socket = new net.Socket()
  const connect = socket.connect.bind(socket)

  socket.connect = function (this: net.Socket, ...args: any[]): net.Socket {
    const [port, host] = args

    // Unix sockets and literal IPs need no resolving.
    if (typeof port !== 'number' || typeof host !== 'string' || net.isIP(host) !== 0) {
      return (connect as any)(...args)
    }

    resolveHost(host, (error, address) => {
      if (error || !address) return void socket.destroy(error ?? undefined)
      connect({ port, host: address })
    })

    return socket
  } as typeof socket.connect

  return socket
}
