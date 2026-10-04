const BASE = 'https://downr.org'
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36'

async function session() {
  const r = await fetch(`${BASE}/.netlify/functions/analytics`, {
    headers: { 'User-Agent': UA, Referer: `${BASE}/` },
    signal: AbortSignal.timeout(8000)
  })
  if (!r.ok) throw new Error('session ' + r.status)
  const raw = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean)
  return raw.map(c => c.split(';')[0]).join('; ')
}

const convert = (url, cookie) =>
  fetch(`${BASE}/.netlify/functions/bbc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, Referer: `${BASE}/`, 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(12000)
  })

export async function getVideoSrcFromDownr(url) {
  try {
    let cookie = await session()
    let r = await convert(url, cookie)
    if (r.status === 403 && (await r.text()).trim() === 'user_retry_required') {
      cookie = await session()
      r = await convert(url, cookie)
    }
    if (!r.ok) return null
    const j = await r.json()
    if (j?.error) return null
    const vids = (j?.medias || []).filter(m => m?.type === 'video' && !m.is_audio && typeof m.url === 'string' && /^https?:\/\//i.test(m.url))
    const q = m => String(m.quality || '')
    const pick =
      vids.find(m => /^no_?watermark$/i.test(q(m))) ||
      vids.find(m => /no_?watermark/i.test(q(m))) ||
      vids.find(m => !/watermark|wm/i.test(q(m)))
    return pick ? pick.url.replace(/^http:/i, 'https:') : null
  } catch { return null }
    }
