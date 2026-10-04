import { Readable } from 'node:stream'
import { verify } from './_sign.js'

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

const privateHost = h =>
  h === 'localhost' || /^[\d.]+$/.test(h) || h.includes(':') || /\.(local|internal|localhost)$/.test(h)

export default async function handler(req, res) {
  const raw = String(req.query?.u || '')
  if (!verify(raw, req.query?.s)) return res.status(403).end('bad signature')
  let u
  try { u = new URL(raw) } catch { return res.status(400).end('bad url') }
  const host = u.hostname.toLowerCase()
  if (u.protocol !== 'https:' || privateHost(host)) return res.status(403).end('host not allowed')

  const referer = /tiktok|byte|ibyted/.test(host) ? 'https://www.tiktok.com/' : host.endsWith('snaptik.fi') ? 'https://snaptik.fi/' : u.origin + '/'
  const headers = { 'User-Agent': UA, Referer: referer, Accept: '*/*' }
  if (req.headers.range) headers.Range = req.headers.range

  try {
    const r = await fetch(u, { headers, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (!r.ok && r.status !== 206) return res.status(r.status === 403 ? 502 : r.status).end('upstream ' + r.status)
    const ct = r.headers.get('content-type') || 'video/mp4'
    if (!/^(video|application\/octet-stream)/i.test(ct)) return res.status(502).end('not a video')

    res.status(r.status)
    res.setHeader('Content-Type', ct.startsWith('video') ? ct : 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'private, max-age=600')
    for (const k of ['content-length', 'content-range']) { const v = r.headers.get(k); if (v) res.setHeader(k, v) }
    if (!r.body) return res.end()
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res)
  } catch (e) {
    if (!res.headersSent) res.status(502).end('fetch failed')
    else res.destroy()
  }
}

export const config = { maxDuration: 60 }
