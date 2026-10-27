import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate, studio, db pull) needs a DIRECT connection.
// Neon's "-pooler" endpoint is PgBouncer in transaction mode: the session-level
// advisory lock `migrate deploy` takes can get stranded on a pooled server
// connection, and the next deploy then times out with P1002. The running app
// keeps using the pooled DATABASE_URL (lib/prisma.ts).
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL?.replace("-pooler.", ".");

if (!url) throw new Error("Set DATABASE_URL (and preferably DIRECT_URL) before running Prisma");

export default defineConfig({
  datasource: { url },
});
