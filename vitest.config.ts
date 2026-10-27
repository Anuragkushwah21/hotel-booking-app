import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { DATABASE_URL: 'postgresql://test:test@localhost:5432/test', SESSION_SECRET: 'x'.repeat(40) },
  },
})
