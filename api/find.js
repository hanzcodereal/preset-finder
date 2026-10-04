import { sign } from './_sign.js'
import { pickVideoUrl } from './_pick.js'
import { getVideoSrcFromDownr } from './_downr.js'
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const AM_HOSTS = ['alight.link', 'alight.to', 'alight.page.link', 'alightcreative.page.link', 'alightmotion.page.link']
const AM_SHARE_RE = /alightcreative\.com\/am\/share\//i
const FILE_HOSTS = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'mediafire.com', 'dropbox.com', 'mega.nz', 'sfile.mobi', 'github.com', 'gitlab.com']
const TREE_HOSTS = ['lynk.id', 'linktr.ee', 'bio.link', 'heylink.me', 'stan.store', 's.id', 'cutt.ly', 'bit.ly', 'tinyurl.com', 'taplink.cc', 'soc12.my.id']
const NOISE_HOSTS = ['tiktok.com', 'tiktokcdn.com', 'ttwstatic.com', 'tiktokv.com', 'snssdk.com', 'bytedance.com', 'byteimg.com', 'googleapis.com', 'gstatic.com', 'apple.com', 'w3.org', 'schema.org', 'cloudflare.com', 'amazonaws.com', 'instagram.com', 'facebook.com', 'youtube.com', 'x.com', 'twitter.com', 't.me', 'wa.me', 'whatsapp.com']
const URL_RE = /https?:\/\/[^\s"'<>()[\]{}\\]+/gi
const cache = new Map()

const sleep = ms => new Promise(r => setTimeout(r, ms))
const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const hostIn = (u, l) => { const h = hostOf(u); return !!h && l.some(x => h === x || h.endsWith('.' + x)) }
const isAm = u => AM_SHARE_RE.test(u) || hostIn(u, AM_HOSTS)
const isFile = u => hostIn(u, FILE_HOSTS) || /\.(xml|zip|ampreset|json)(\?|$)/i.test(u)
const isNoise = u => hostIn(u, NOISE_HOSTS) || /\.(png|jpe?g|webp|gif|svg|ico|woff2?|mp4|mp3|css|js)(\?|$)/i.test(u)
const clean = u => u && u.replace(/[.,;:!?)'"»”]+$/, '').replace(/&amp;/g, '&')

function extractLinks(t) {
  const out = new Set()
  for (const m of String(t || '').matchAll(URL_RE)) { const u = clean(m[0]); if (u) out.add(u) }
  for (const m of String(t || '').matchAll(/(?:^|[\s({[>])((?:www\.)?(?:alight\.(?:link|to)\/[\w-]+|alightcreative\.com\/am\/share\/[^\s"'<>]+))/gi)) out.add(clean('https://' + m[1]))
  return [...out]
}

const http = (url, o = {}) => fetch(url, {
  redirect: o.redirect || 'follow',
  headers: { 'User-Agent': o.ua || UA, Accept: o.accept || 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', Referer: o.referer || 'https://www.tiktok.com/' },
  signal: AbortSignal.timeout(o.timeout || 15000)
})
const text = async (url, o) => { const r = await http(url, o); return { status: r.status, body: await r.text() } }

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

async function resolveChain(url) {
  let cur = url, amUrl = isAm(url) ? url : null
  for (let i = 0; i < 8; i++) {
    let r
    try { r = await http(cur, { redirect: 'manual', timeout: 10000 }) } catch { break }
    if (r.status < 300 || r.status >= 400) break
    let loc = r.headers.get('location'); if (!loc) break
    if (loc.startsWith('intent://')) {
      const m = decodeURIComponent(loc).match(/https?:\/\/alightcreative\.com\/am\/share\/[^\s"'<>;]+/i)
      if (m) amUrl = m[0]
      break
    }
    cur = new URL(loc, cur).href
    if (isAm(cur)) amUrl = cur
    if (AM_SHARE_RE.test(cur)) break
  }
  return { amUrl: amUrl && (AM_SHARE_RE.test(amUrl) ? amUrl : isAm(cur) ? cur : amUrl) }
}

const extractVideoId = s => {
  s = String(s).trim()
  if (/^\d{15,}$/.test(s)) return s
  for (const p of [/\/video\/(\d{15,})/, /\/v\/(\d{15,})/, /[?&](?:item_id|share_item_id|aweme_id)=(\d{15,})/, /\/(\d{15,})(?:\?|$)/]) { const m = s.match(p); if (m) return m[1] }
  return null
}

async function resolveTiktok(input) {
  let cur = /^https?:\/\//i.test(input) ? input : 'https://' + input
  for (let i = 0; i < 6; i++) {
    const id = extractVideoId(cur)
    if (id && /tiktok\.com/i.test(cur)) return { videoId: id, user: cur.match(/\/@([^/?#]+)\//)?.[1] || '' }
    let r
    try { r = await http(cur, { redirect: 'manual', timeout: 12000 }) } catch { break }
    const loc = r.headers.get('location')
    if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).href; continue }
    break
  }
  const id = extractVideoId(cur)
  if (!id) throw new Error('Link TikTok-nya nggak valid atau nggak bisa dibuka')
  return { videoId: id, user: cur.match(/\/@([^/?#]+)\//)?.[1] || '' }
}

async function getVideoInfo(videoId) {
  for (let i = 0; i < 2; i++) {
    if (i) await sleep(700)
    try {
      const { body } = await text(`https://www.tiktok.com/embed/v2/${videoId}`, { timeout: 8000 })
      const m = body.match(/<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/)
      if (!m) continue
      const st = JSON.parse(m[1])
      const key = Object.keys(st.source?.data || {}).find(k => k.includes(videoId))
      const v = key && st.source.data[key]?.videoData
      if (!v) return {}
      return {
        description: v.itemInfos?.text || '', createTime: v.itemInfos?.createTime || null,
        comments: v.itemInfos?.commentCount ?? null, likes: v.itemInfos?.diggCount ?? null,
        views: v.itemInfos?.playCount ?? null, shares: v.itemInfos?.shareCount ?? null,
        cover: v.itemInfos?.coverUrl?.[0] || v.itemInfos?.covers?.[0] || null,
        src: v.itemInfos?.video?.urls?.find(u => /^https:/i.test(u)) || null,
        user: v.authorInfos?.uniqueId || '', nickname: v.authorInfos?.nickName || '',
        avatar: v.authorInfos?.covers?.[0] || null, bio: v.authorInfos?.signature || ''
      }
    } catch {}
  }
  return {}
}

async function getVideoSrcFromPage(user, videoId) {
  if (!user) return null
  try {
    const { body } = await text(`https://www.tiktok.com/@${user}/video/${videoId}`, { timeout: 8000 })
    const m = body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/)
    const vid = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.video
    const cands = [vid?.playAddr, ...(vid?.bitrateInfo || []).flatMap(b => b?.PlayAddr?.UrlList || []), vid?.downloadAddr]
    return cands.find(u => typeof u === 'string' && /^https:/i.test(u)) || null
  } catch { return null }
}

async function getVideoSrcFromSnaptik(url) {
  try {
    const r = await fetch('https://snaptik.fi/api/tiktok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', Referer: 'https://snaptik.fi/' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10000)
    })
    if (!r.ok) return null
    return pickVideoUrl(await r.json())
  } catch { return null }
}

async function getVideoSrcFromTikwm(user, videoId) {
  try {
    const q = new URLSearchParams({ url: `https://www.tiktok.com/@${user || 'tiktok'}/video/${videoId}`, hd: '1' })
    const r = await fetch('https://www.tikwm.com/api/?' + q, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) })
    const d = (await r.json())?.data
    const u = d?.play || d?.hdplay
    if (!u || typeof u !== 'string') return null
    return /^https?:/i.test(u) ? u.replace(/^http:/i, 'https:') : 'https://www.tikwm.com' + (u.startsWith('/') ? '' : '/') + u
  } catch { return null }
}

async function getProfile(user) {
  if (!user) return { links: [] }
  try {
    const { body } = await text(`https://www.tiktok.com/@${user}`)
    const m = body.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/)
    let u = {}
    try { u = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user || {} } catch {}
    const bm = body.match(/"bioLink":\{"link":"([^"]+)"/)
    const bioLink = bm ? bm[1].replace(/\\u002F/g, '/') : null
    const links = extractLinks(body).filter(x => !isNoise(x))
    return { bio: u.signature || '', avatar: u.avatarMedium || null, bioLink, links: [...new Set([...(bioLink ? [bioLink] : []), ...links])] }
  } catch { return { links: [] } }
}

async function getComments(videoId, author) {
  const all = []; let cursor = 0
  for (let p = 0; p < 4; p++) {
    const q = new URLSearchParams({ device_id: '7000000000000000001', aweme_id: videoId, count: '50', cursor: String(cursor), aid: '1233', app_language: 'en', device_platform: 'android', os_version: '29', region: 'ID' })
    try {
      const j = JSON.parse(await (await http(`https://www.tiktok.com/api/comment/list/?${q}`, { accept: 'application/json' })).text())
      const list = j.comments || []
      for (const c of list) { const user = c.user?.unique_id || ''; all.push({ text: c.text || '', user, pinned: c.author_pin === true, digg: c.digg_count || 0, cid: c.cid || '', replyCount: c.reply_comment_total ?? 0, byAuthor: !!author && user === author }) }
      if (!j.has_more || !list.length) break
      cursor = j.cursor ?? cursor + 50
      await sleep(250)
    } catch { break }
  }
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.digg - a.digg)
}

const REPLY_UA = 'com.zhiliaoapp.musically/300000 (Linux; U; Android 13; id_ID; M2101K6G; Build/TKQ1.220829.002; Cronet/TTNetVersion:b4d74d55 2023-02-16 QuicVersion:41928d6a 2023-01-30)'
async function getReplies(videoId, cid) {
  const q = new URLSearchParams({ device_id: '7185643774736387594', iid: '7129847366169418245', version_code: '300000', aid: '1180', device_platform: 'android', channel: 'googleplay', app_name: 'musically', os_api: '33', os_version: '13', os_name: 'Android', device_type: 'Redmi Note 10', resolution: '1080*2400', language: 'en', aweme_id: videoId, comment_id: String(cid), cursor: '0', count: '20' })
  for (let a = 0; a < 3; a++) {
    if (a) await sleep(400)
    try {
      const j = JSON.parse(await (await http(`https://api16.tiktokv.com/aweme/v1/comment/list/reply/?${q}`, { accept: 'application/json', ua: REPLY_UA })).text())
      if (j.comments?.length) return j.comments.map(c => ({ text: c.text || '', user: c.user?.unique_id || '', digg: c.digg_count || 0 }))
    } catch {}
  }
  return []
}

async function getShareInfo(url) {
  try {
    const { body } = await text(url)
    const t = body.match(/<title>([\s\S]*?)<\/title>/i)
    const th = [...new Set([...body.matchAll(/https:\/\/firebasestorage\.googleapis\.com\/[^\s"'<>]+thumb-\w+\.jpg[^\s"'<>]*/gi)].map(x => x[0].replace(/&amp;/g, '&')))]
    th.sort((a, b) => (/thumb-med/i.test(a) ? 0 : 1) - (/thumb-med/i.test(b) ? 0 : 1))
    return { title: t ? t[1].replace(/\s+/g, ' ').trim().replace(/ - Alight Motion Project$/i, '') : null, thumb: th[0] || null }
  } catch { return {} }
}

const humanSize = b => { if (!b) return null; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++ } return i ? `${b.toFixed(1)} ${u[i]}` : `${b} B` }

async function getFileInfo(url) {
  const id = url.match(/\/file\/d\/([\w-]{10,})/)?.[1]
  const out = {}
  if (id) {
    try {
      const r = await http(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, { accept: '*/*', timeout: 20000, referer: 'https://drive.google.com/' })
      if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) {
        const len = Number(r.headers.get('content-length') || 0)
        out.size = humanSize(len)
        if (len <= 8 * 1024 * 1024) {
          const head = Buffer.from(await r.arrayBuffer()).subarray(0, 8192).toString('utf8')
          out.title = head.match(/<scene[^>]*\stitle="([^"]*)"/)?.[1] || null
        } else r.body?.cancel?.()
      }
    } catch {}
  }
  if (!out.title) {
    try {
      const { body } = await text(url, { timeout: 10000 })
      const m = body.match(/<title>([\s\S]*?)<\/title>/i)
      out.title = m ? m[1].replace(/\s+/g, ' ').trim().replace(/\s+-\s+(Google Drive|MediaFire|Dropbox|Mega)\s*$/i, '') : null
    } catch {}
  }
  return out
}

async function harvestTree(url) {
  try {
    const { body } = await text(url)
    const sh = hostOf(url)
    return extractLinks(body).filter(u => u !== url && !isNoise(u) && hostOf(u) && !hostOf(u).endsWith(sh))
  } catch { return [] }
}

async function resolveSrc(canon, user, videoId, embedSrc) {
  let u
  if ((u = await getVideoSrcFromDownr(canon))) return { url: u, from: 'downr' }
  if ((u = await getVideoSrcFromSnaptik(canon))) return { url: u, from: 'snaptik' }
  if ((u = await getVideoSrcFromTikwm(user, videoId))) return { url: u, from: 'tikwm' }
  if (embedSrc) return { url: embedSrc, from: 'embed' }
  if ((u = await getVideoSrcFromPage(user, videoId))) return { url: u, from: 'page' }
  return null
}

const srcFields = v => ({
  src: v?.url || null,
  proxy: v ? `/api/video?u=${encodeURIComponent(v.url)}&s=${sign(v.url)}` : null,
  srcFrom: v?.from || null
})

async function find(input) {
  const { videoId, user: urlUser } = await resolveTiktok(input)
  const info = await getVideoInfo(videoId)
  const user = info.user || urlUser
  const canon = user ? `https://www.tiktok.com/@${user}/video/${videoId}` : input
  const srcP = resolveSrc(canon, user, videoId, info.src)
  const [profile, comments, vsrc] = await Promise.all([getProfile(user), getComments(videoId, user), srcP])

  const found = [], seen = new Set()
  const add = (url, kind, x = {}) => {
    const u = clean(url)
    if (!u || seen.has(u) || isNoise(u) && !isAm(u) && !isFile(u)) return
    seen.add(u)
    found.push({ url: u, kind, detail: x.detail || null, pinned: !!x.pinned, byAuthor: !!x.byAuthor, digg: x.digg || 0 })
  }
  extractLinks(info.description).forEach(u => add(u, 'description'))
  extractLinks(info.bio || profile.bio).forEach(u => add(u, 'bio'))
  ;(profile.links || []).forEach(u => add(u, 'bioLink'))
  for (const c of comments) extractLinks(c.text).forEach(u => add(u, 'comment', { pinned: c.pinned, byAuthor: c.byAuthor, digg: c.digg, detail: '@' + c.user }))

  let replyCount = 0
  if (!found.some(x => isAm(x.url))) {
    const parents = comments.filter(c => c.cid && c.replyCount > 0).sort((a, b) => Number(b.byAuthor) - Number(a.byAuthor) || Number(b.pinned) - Number(a.pinned) || b.digg - a.digg).slice(0, 12)
    for (let i = 0; i < parents.length; i += 3) {
      const chunk = await mapLimit(parents.slice(i, i + 3), 3, p => getReplies(videoId, p.cid))
      for (const c of chunk.flat()) {
        replyCount++
        extractLinks(c.text).forEach(u => add(u, 'comment', { byAuthor: !!user && c.user === user, digg: c.digg, detail: '@' + c.user + ' (balasan)' }))
      }
      if (found.some(x => isAm(x.url)) || found.some(x => isFile(x.url)) && i >= 6) break
    }
  }

  if (!found.some(x => isAm(x.url))) {
    const trees = found.filter(x => hostIn(x.url, TREE_HOSTS)).map(x => x.url)
    if (trees.length) (await mapLimit(trees, 4, harvestTree)).flat().slice(0, 40).forEach(u => add(u, 'bioLink'))
  }

  const targets = found.filter(x => !isAm(x.url) && !isFile(x.url) && !hostIn(x.url, NOISE_HOSTS)).slice(0, 15)
  const res = await mapLimit(targets, 5, async x => ({ x, ...(await resolveChain(x.url)) }))
  for (const r of res) if (r.amUrl && !seen.has(r.amUrl)) { seen.add(r.amUrl); found.push({ ...r.x, url: r.amUrl, origin: r.x.url }) }

  const presets = found.filter(x => isAm(x.url) || isFile(x.url)).map(x => ({ ...x, type: isAm(x.url) ? '5mb' : 'xml' }))
  await mapLimit(presets, 4, async p => {
    if (p.type === '5mb') { const s = await getShareInfo(p.url); p.title = s.title; p.thumb = s.thumb }
    else Object.assign(p, await getFileInfo(p.url))
  })

  const def = t => /^proyek baru\s*\d+$/i.test(String(t || '').trim())
  for (const p of presets) if (def(p.title)) { const q = presets.find(o => o !== p && o.detail && o.detail === p.detail && o.title && !def(o.title)); if (q) p.title = q.title }
  const trust = p => p.kind === 'description' ? 100 : p.byAuthor ? 90 : p.kind === 'bio' ? 85 : p.kind === 'bioLink' ? 80 : p.pinned ? 70 : 20 + Math.min(p.digg, 50) / 5
  presets.sort((a, b) => trust(b) - trust(a) || (a.type === b.type ? 0 : a.type === '5mb' ? -1 : 1))

  return {
    ok: true, videoId,
    video: { id: videoId, url: `https://www.tiktok.com/@${user}/video/${videoId}`, embed: `https://www.tiktok.com/embed/v2/${videoId}`, ...srcFields(vsrc), description: info.description || '', cover: info.cover, createTime: info.createTime, views: info.views, likes: info.likes, comments: info.comments ?? comments.length, shares: info.shares },
    author: { uniqueId: user, nickname: info.nickname, avatar: info.avatar || profile.avatar, bio: info.bio || profile.bio, bioLink: profile.bioLink },
    scanned: { comments: comments.length, replies: replyCount },
    presets: presets.map(p => ({ type: p.type, url: p.url, title: p.title || null, size: p.size || null, thumb: p.thumb || null, source: p.kind, detail: p.detail, byAuthor: p.byAuthor, pinned: p.pinned }))
  }
}

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const input = String(req.query?.url || '').trim()
  if (!input) return res.status(400).json({ ok: false, error: 'Linknya belum diisi nih' })
  if (!/tiktok\.com|^\d{15,}$/i.test(input)) return res.status(400).json({ ok: false, error: 'Itu bukan link TikTok, coba cek lagi ya' })
  const hit = cache.get(input)
  if (hit && Date.now() - hit.t < hit.ttl) {
    res.setHeader('x-cache', 'hit'); res.setHeader('Cache-Control', 'no-store')
    const o = hit.v
    const fresh = await resolveSrc(o.video.url, o.author.uniqueId, o.videoId, null)
    return res.status(200).json({ ...o, video: { ...o.video, ...srcFields(fresh) } })
  }
  try {
    const v = await find(input)
    if (v.presets.length) cache.set(input, { t: Date.now(), ttl: 1200e3, v })
    if (cache.size > 200) cache.delete(cache.keys().next().value)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(v)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'Ada yang error, coba lagi ya' })
  }
}
