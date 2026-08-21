import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createResilientSocket } from './resilient-dns';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
  poolVersion: string | undefined;
};

/**
 * Bump this whenever the pool or client construction below changes.
 *
 * The cached pool survives hot reloads by design, which also means an edit to
 * this file would otherwise keep running against the pool built by the previous
 * version — the change looks applied, and isn't. On a mismatch we retire the
 * old pool and build a fresh one.
 */
const POOL_VERSION = 'resilient-dns-2';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

/**
 * The pool is cached on globalThis alongside the client. Without this, every
 * hot reload in dev builds a fresh pg.Pool while the old one keeps its sockets,
 * and the connection count climbs until the database starts refusing us.
 *
 * The timeouts are tuned for a serverless Postgres (Neon): idle computes are
 * suspended and idle connections are dropped server-side, so we retire our own
 * connections first rather than handing a query a socket that is already dead.
 */
const pool =
  globalForPrisma.pool ??
  new pg.Pool({
    connectionString,
    stream: createResilientSocket,
    max: 10,
    // Drop our idle sockets before the server does.
    idleTimeoutMillis: 10_000,
    // A suspended compute needs a moment to wake; don't give up in 2s.
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

// A pool error on an idle client is emitted on the pool itself; unhandled, it
// takes the dev server down with it.
pool.on('error', (error) => {
  console.error('[prisma] idle pool client error:', error.message);
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
  globalForPrisma.poolVersion = POOL_VERSION;
}
