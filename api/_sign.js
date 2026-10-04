import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.GUARD_SECRET || 'ganti-ini-di-env-vercel'
export const sign = u => createHmac('sha256', SECRET).update(String(u)).digest('hex').slice(0, 32)
export const verify = (u, s) => {
  const a = Buffer.from(sign(u)), b = Buffer.from(String(s || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}
