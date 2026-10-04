const walk = (o, path, out, depth = 0) => {
  if (depth > 6 || o == null) return
  if (typeof o === 'string') { if (/^https?:\/\//i.test(o)) out.push({ path, url: o }); return }
  if (Array.isArray(o)) return o.slice(0, 30).forEach((x, i) => walk(x, `${path}[${i}]`, out, depth + 1))
  if (typeof o === 'object') {
    const hint = ['type', 'kind', 'mime', 'mimeType', 'format', 'ext', 'extension'].map(k => o[k]).filter(x => typeof x === 'string').join(' ')
    const base = hint ? `${path}<${hint}>` : path
    for (const [k, v] of Object.entries(o)) walk(v, base ? `${base}.${k}` : k, out, depth + 1)
  }
}

const score = ({ path, url }) => {
  let s = 0
  if (/no[_\-. ]?w(ater)?m(ark)?|nowm|without/i.test(path)) s += 10
  else if (/w(ater)?m(ark)?/i.test(path)) s -= 15
  if (/video|play|mp4|download|src|link|url/i.test(path)) s += 5
  if (/<[^>]*(video|mp4)[^>]*>/i.test(path)) s += 4
  if (/\bhd\b|hd_|_hd|hdplay/i.test(path)) s += 1
  if (/music|audio|mp3|cover|thumb|avatar|image|photo|poster|origin_cover|dynamic|profile/i.test(path)) s -= 30
  if (/\.mp4(\?|#|$)/i.test(url)) s += 8
  if (/\.(jpe?g|png|webp|gif|mp3|m4a|heic|avif)(\?|#|$)/i.test(url)) s -= 30
  return s
}

export function pickVideoUrl(data) {
  const out = []
  walk(data, '', out)
  const best = out.map(c => ({ ...c, s: score(c) })).filter(c => c.s > 5).sort((a, b) => b.s - a.s)[0]
  return best ? best.url.replace(/^http:/i, 'https:') : null
}
