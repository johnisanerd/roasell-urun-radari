// Apify çalıştırmalarını başlatan, kuyruğa alan, izleyen ve sonuçları veritabanına işleyen iş katmanı.
//
// Önemli: Trendyol aktörlerinde ürün limiti TÜM sorguların toplamıdır ve aktör önce ilk sorguyu doldurur.
// Bu yüzden her sorgu ayrı bir Apify çalıştırması olarak başlatılır (çalıştırma başına ~0,005 $),
// aynı anda en fazla MAX_CONCURRENT çalıştırma açılır (Free plan limiti 5).
import crypto from 'node:crypto'
import { db, save } from './db.js'
import { env, GENERAL_QUERIES } from './config.js'
import * as apify from './apify.js'
import { normalizeProduct, normalizeItems, mergeDefined, normalizeLensItem, summarizeMeta, adLibraryUrl } from './normalize.js'
import { similarity, tokens, normalizeText } from './text.js'
import { recomputeCrowd } from './crowd.js'

const MAX_CONCURRENT = 4
const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID().slice(0, 8)
const httpError = (message, status = 400) => Object.assign(new Error(message), { status })
const isMemo = () => /memo23/i.test(env.trendyolActor)

export const listJobs = () => Object.values(db.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

function pruneJobs() {
  for (const j of listJobs().slice(200)) if (j.status !== 'running') delete db.jobs[j.id]
}

const activeRunCount = () =>
  Object.values(db.jobs)
    .filter((j) => j.status === 'running')
    .reduce((n, j) => n + j.runs.filter((r) => !apify.TERMINAL.has(r.status)).length, 0)

/** Kuyruktaki çalıştırmaları eşzamanlılık limiti dahilinde başlatır. */
async function pump(job) {
  while (job.queue?.length && activeRunCount() < MAX_CONCURRENT) {
    const spec = job.queue.shift()
    try {
      const r = await apify.startRun(spec.actor, spec.input)
      job.runs.push({ role: spec.role, actor: spec.actor, ...r })
    } catch (err) {
      job.runs.push({ role: spec.role, actor: spec.actor, status: 'FAILED', statusMessage: err.message })
      // Token / kredi / izin hatasında kalan sorguları denemenin anlamı yok
      if ([401, 402, 403].includes(err.status)) {
        job.queue = []
        Object.assign(job, { status: 'failed', error: err.message, finishedAt: now() })
      }
    }
  }
}

async function createJob({ type, label, productId = null, meta = {}, runs }) {
  const job = { id: newId(), type, label, productId, status: 'running', createdAt: now(), finishedAt: null, error: null, resultCount: 0, meta, runs: [], queue: runs, totalRuns: runs.length }
  db.jobs[job.id] = job
  await pump(job)
  if (job.status === 'running' && !job.queue.length && job.runs.every((r) => r.status === 'FAILED')) {
    Object.assign(job, { status: 'failed', error: job.runs[0]?.statusMessage || 'Apify çalıştırması başlatılamadı', finishedAt: now() })
  }
  pruneJobs()
  save()
  return job
}

// ---------- Aktör girdileri ----------

/**
 * memo23/trendyol-scraper: arama yalnızca `keyword` ile çalışıyor; ürün URL'leri `startUrls` içinde
 * düz metin olarak verilmeli ({url} nesnesi 0 sonuç döndürüyor). Listeleme 0,0005 $, detay 0,002 $.
 * automation-lab: satıcı detayı kapalı (Trendyol satıcı API'si 418 döndürüp çalıştırmayı düşürüyor).
 */
function trendyolInput({ keyword, productUrls, maxItems, details = false, emails = false, monitoring = false }) {
  const extra = env.trendyolInputExtra
  if (isMemo()) {
    if (productUrls?.length) return { startUrls: productUrls, scrapeProductDetails: true, scrapeReviews: false, enrichEmails: emails, maxItems: productUrls.length, ...extra }
    // monitoringMode: aktör size daha önce teslim ettiği ürün ID'lerini ücretsiz atlar → her taramada yeni ürünler gelir
    return { keyword, scrapeProductDetails: details, scrapeReviews: false, enrichEmails: false, monitoringMode: monitoring, maxItems, ...extra }
  }
  if (/fatihtahta/i.test(env.trendyolActor)) return { queries: keyword ? [keyword] : [], startUrls: (productUrls || []).map((url) => ({ url })), limit: maxItems, ...extra }
  return {
    searchQueries: keyword ? [keyword] : [],
    startUrls: (productUrls || []).map((url) => ({ url })),
    maxItems,
    includeSeller: false,
    includeReviews: false,
    includeQuestions: false,
    useResidentialProxy: true,
    proxyCountryCode: 'TR',
    ...extra,
  }
}

// ---------- İş başlatıcılar ----------

export const MAX_QUERIES = 40
export const URL_ROLE = '#urun-linki'
const URL_RE = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:trendyol\.com|ty\.gl)\/\S+/gi

/**
 * Opsiyonel "ürün linki veya adı" alanı: Trendyol linkleri doğrudan (detaylı) çekilir, kalan metin ürün adı
 * olarak aranır. Başka sitelerin linkleri reddedilir.
 */
export function parseTarget(raw) {
  const text = String(raw || '').trim()
  if (!text) return { urls: [], name: null }
  const urls = [...new Set((text.match(URL_RE) || []).map((u) => (/^https?:/i.test(u) ? u : `https://${u}`).split('?')[0].replace(/[),.;]+$/, '')))]
  const rest = text.replace(URL_RE, ' ').replace(/[,\s]+/g, ' ').trim()
  if (/https?:\/\/|www\./i.test(rest)) throw httpError('Yalnızca Trendyol ürün linki girilebilir (trendyol.com veya ty.gl).')
  return { urls, name: rest || null }
}

export function startSearch({ mode = 'keywords', keywords = [], categories = [], target = '', linkOnly = false, perQuery = 20, minPrice, maxPrice, band = 'ideal', excludeBranded = true, autoEnrich = true, skipSeen = true }) {
  const s = db.settings
  const clean = (list) => [...new Set((list || []).map((k) => String(k).trim()).filter(Boolean))]
  const parsed = parseTarget(target)
  const { urls } = parsed
  // "Sadece linki tara": yalnızca linkteki ürün(ler) çekilir, anahtar kelime/kategori sorgusu çalıştırılmaz
  linkOnly = !!linkOnly && urls.length > 0
  const name = linkOnly ? null : parsed.name
  let queries = linkOnly ? [] : mode === 'general' ? clean(categories) : clean(keywords)
  if (mode === 'general' && !queries.length && !urls.length && !name) queries = GENERAL_QUERIES.slice(0, MAX_QUERIES)
  if (name && !queries.some((q) => normalizeText(q) === normalizeText(name))) queries.push(name)
  if (!queries.length && !urls.length) throw httpError('En az bir anahtar kelime, ürün linki veya ürün adı girin.')
  if (queries.length > MAX_QUERIES) throw httpError(`Tek taramada en fazla ${MAX_QUERIES} sorgu çalıştırılabilir.`)
  if (urls.length > 50) throw httpError('Tek seferde en fazla 50 ürün linki girilebilir.')
  perQuery = Math.min(Math.max(Number(perQuery) || 20, 1), 100)
  maxPrice = maxPrice === '' || maxPrice == null ? s.maxSalePrice : Number(maxPrice)
  minPrice = minPrice === '' || minPrice == null ? null : Number(minPrice)
  skipSeen = skipSeen !== false

  const parts = [
    urls.length ? `${urls.length} ürün linki` : null,
    mode === 'general' && queries.length ? `Genel tarama · ${queries.length} kategori` : queries.length ? queries.join(', ') : null,
  ]
  const runs = queries.map((q) => ({ role: q, actor: env.trendyolActor, input: trendyolInput({ keyword: q, maxItems: perQuery, monitoring: skipSeen && q !== name }) }))
  if (urls.length) runs.unshift({ role: URL_ROLE, actor: env.trendyolActor, input: trendyolInput({ productUrls: urls }) })
  return createJob({
    type: 'search',
    label: parts.filter(Boolean).join(' · '),
    meta: { mode, queries, targetName: name, targetUrls: urls, perQuery, minPrice, maxPrice, band, excludeBranded, skipSeen, autoEnrich: autoEnrich && isMemo() },
    runs,
  })
}

/** Kaydedilen ürünler için satıcı adı, ticari ünvan, favori sayısı (ve istenirse e-posta) çeker. */
export function startEnrich(productIds, { emails = false, parentJobId = null } = {}) {
  if (!isMemo()) throw httpError('Satıcı bilgisi yalnızca memo23/trendyol-scraper aktörüyle çekilebilir.')
  const list = productIds.map((id) => db.products[id]).filter((p) => p?.url)
  if (!list.length) throw httpError('Ürün bulunamadı', 404)
  const urls = list.map((p) => p.url.split('?')[0])
  const chunks = []
  for (let i = 0; i < urls.length; i += 50) chunks.push(urls.slice(i, i + 50))
  return createJob({
    type: 'enrich',
    label: list.length === 1 ? `${emails ? 'Satıcı + e-posta' : 'Satıcı bilgisi'} · ${list[0].title.slice(0, 44)}` : `Satıcı bilgisi · ${list.length} ürün`,
    productId: list.length === 1 ? list[0].id : null,
    meta: { productIds: list.map((p) => p.id), emails, parentJobId },
    runs: chunks.map((c, i) => ({ role: `enrich-${i}`, actor: env.trendyolActor, input: trendyolInput({ productUrls: c, emails }) })),
  })
}

const productOr404 = (id) => {
  const p = db.products[id]
  if (!p) throw httpError('Ürün bulunamadı', 404)
  return p
}

export function defaultCompetitorQuery(p) {
  const brand = new Set(tokens(p.brand))
  return tokens(p.title).filter((t) => !brand.has(t) && !/^\d+$/.test(t)).slice(0, 5).join(' ')
}

export function startTrendyolCompetitors(productId, { query, maxItems = 30 } = {}) {
  const p = productOr404(productId)
  query = (query || defaultCompetitorQuery(p)).trim()
  return createJob({
    type: 'trendyol-competitors',
    label: `Trendyol rakipleri · ${query}`,
    productId,
    meta: { query },
    runs: [{ role: 'main', actor: env.trendyolActor, input: trendyolInput({ keyword: query, maxItems: Math.min(Number(maxItems) || 30, 100) }) }],
  })
}

function lensInput(imageUrl, country, language) {
  if (/johnvc\/google-lens-api/i.test(env.lensActor)) return { image_url: imageUrl, search_type: 'visual_matches', country, language }
  return { imageUrl, image_url: imageUrl, country, language }
}

export function startLens(productId) {
  const p = productOr404(productId)
  if (!p.image) throw httpError('Ürün görseli yok; Google Lens taraması yapılamaz.')
  const s = db.settings
  return createJob({
    type: 'lens',
    label: `Google Lens · ${p.title.slice(0, 48)}`,
    productId,
    runs: [
      { role: 'tr', actor: env.lensActor, input: lensInput(p.image, s.lensCountryTr, 'tr') },
      { role: 'global', actor: env.lensActor, input: lensInput(p.image, s.lensCountryGlobal, 'en') },
    ],
  })
}

export function startMeta({ query, productId = null, country = 'ALL', limit }) {
  query = String(query || '').trim()
  if (!query) throw httpError('Aranacak marka/mağaza adını girin.')
  if (productId) productOr404(productId)
  limit = Math.min(Math.max(Number(limit) || 60, 10), 300)
  return createJob({
    type: 'meta',
    label: `Meta Ads · ${query}`,
    productId,
    meta: { query, country, limit },
    runs: [{ role: 'main', actor: env.metaActor, input: { startUrls: [{ url: adLibraryUrl(query, country) }], resultsLimit: limit } }],
  })
}

export async function abortJob(id) {
  const job = db.jobs[id]
  if (!job) throw httpError('İş bulunamadı', 404)
  if (job.status === 'running') {
    job.queue = []
    await Promise.allSettled(job.runs.filter((r) => r.runId && !apify.TERMINAL.has(r.status)).map((r) => apify.abortRun(r.runId)))
    Object.assign(job, { status: 'failed', error: 'Kullanıcı tarafından iptal edildi', finishedAt: now() })
    save()
  }
  return job
}

// ---------- Sonuç işleyiciler ----------

export function upsertProduct(p, { jobId = null, query = null, isDemo = false } = {}) {
  const snap = { at: now(), price: p.price, ratingCount: p.ratingCount, favoriteCount: p.favoriteCount }
  const existing = db.products[p.id]
  const queries = [...new Set([...(existing?.queries || []), query || p.searchQuery].filter(Boolean))]
  if (existing) {
    // Listeleme satırındaki boş alanlar, daha önce çekilmiş detay bilgisini (satıcı adı, favori…) silmesin
    mergeDefined(existing, p)
    Object.assign(existing, { queries, isDemo, lastSeenAt: now(), history: [...(existing.history || []), snap].slice(-30) })
    if (jobId) existing.jobIds = [...new Set([...(existing.jobIds || []), jobId])].slice(-20)
    return 'updated'
  }
  db.products[p.id] = { ...p, queries, isDemo, status: 'new', manual: {}, competitors: {}, metaChecks: [], firstSeenAt: now(), lastSeenAt: now(), history: [snap], jobIds: jobId ? [jobId] : [] }
  return 'added'
}

/**
 * Taramada ürünün kaydedilip kaydedilmeyeceği (doküman kriterleri):
 *  - fiyat aralığı
 *  - yorum bandı: "ideal" = 20–500 (önerilen), "wide" = 3.000'e kadar
 *  - resmi satıcı rozetli (markalı) ürünler hariç
 */
function rejectReason(p, meta) {
  const s = db.settings
  if (p.price != null && meta.maxPrice != null && p.price > meta.maxPrice) return 'price'
  if (p.price != null && meta.minPrice != null && p.price < meta.minPrice) return 'price'
  const rc = p.ratingCount
  if (meta.band === 'wide') {
    if (rc != null && rc > s.reviewSaturated) return 'reviews'
  } else if (rc == null || rc < s.reviewLow || rc > s.reviewIdeal) return 'reviews'
  if (meta.excludeBranded && p.officialSeller) return 'branded'
  return null
}

export const HANDLERS = {
  search(job, results) {
    const { targetName, skipSeen = false } = job.meta
    const counts = { added: 0, updated: 0, filtered: 0, fetched: 0, skipped: 0, duplicates: 0 }
    const reasons = { price: 0, reviews: 0, branded: 0 }
    const perQuery = {}
    const productIds = []

    // "Aynı ürün": aynı ürün ID'si, aynı ürün grubu (renk/beden varyantı) veya birebir aynı başlık
    const keysOf = (p) => [`id:${p.id}`, p.groupId && `g:${p.groupId}`, `t:${normalizeText(p.title)}`].filter(Boolean)
    const known = new Set(Object.values(db.products).filter((p) => !p.isDemo).flatMap(keysOf))
    const taken = new Set()

    // Doğrudan girilen ürün linkleri önce işlenir, kriter/tekrar filtresine takılmaz
    const entries = Object.entries(results).sort(([a], [b]) => (b === URL_ROLE) - (a === URL_ROLE))
    for (const [query, items] of entries) {
      const explicitUrls = query === URL_ROLE
      perQuery[query] = 0
      const list = normalizeItems(items)
      // Ürün adıyla aramada adla en çok eşleşen ürün(ler) kriterlerden bağımsız kaydedilir
      const explicitIds = new Set()
      if (targetName && query === targetName) {
        const ranked = list.map((p) => ({ p, sim: similarity(targetName, p.title, { brandB: p.brand }) })).sort((a, b) => b.sim - a.sim)
        for (const { p, sim } of ranked.slice(0, 3)) if (sim >= 0.5 || p === ranked[0].p) explicitIds.add(p.id)
      }
      for (const p of list) {
        counts.fetched++
        const explicit = explicitUrls || explicitIds.has(p.id)
        const keys = keysOf(p)
        if (keys.some((k) => taken.has(k))) {
          counts.duplicates++ // aynı taramada başka sorgudan / başka varyantıyla zaten geldi
          continue
        }
        if (!explicit) {
          const reason = rejectReason(p, job.meta)
          if (reason) {
            counts.filtered++
            reasons[reason]++
            continue
          }
          if (skipSeen && keys.some((k) => known.has(k))) {
            counts.skipped++
            // Aynı ID ise fiyat/yorum geçmişini sessizce güncelle; bu taramanın sonuçlarında gösterme
            if (db.products[p.id]) upsertProduct(p, { query })
            keys.forEach((k) => taken.add(k))
            continue
          }
        }
        keys.forEach((k) => taken.add(k))
        counts[upsertProduct(p, { jobId: job.id, query: explicitUrls ? null : query })]++
        perQuery[query]++
        productIds.push(p.id)
      }
    }

    for (const q of job.meta.queries || []) {
      const key = normalizeText(q)
      const cur = db.queryLog[key] || { query: q, runs: 0 }
      db.queryLog[key] = { ...cur, query: q, runs: cur.runs + 1, lastAt: now(), saved: perQuery[q] ?? 0 }
    }
    recomputeCrowd()
    Object.assign(job.meta, counts, { reasons, perQueryResults: perQuery, productIds: [...new Set(productIds)] })
    return counts.added + counts.updated
  },

  enrich(job, results) {
    let n = 0
    for (const p of normalizeItems(Object.values(results).flat())) {
      const existing = db.products[p.id]
      if (!existing) continue
      const { searchQuery, ...rest } = p
      mergeDefined(existing, rest)
      existing.enrichedAt = now()
      n++
    }
    recomputeCrowd()
    return n
  },

  'trendyol-competitors'(job, { main = [] }) {
    const base = db.products[job.productId]
    if (!base) return 0
    const list = normalizeItems(main)
      .filter((x) => x.id !== base.id)
      .map((x) => ({
        id: x.id, title: x.title, url: x.url, image: x.image, price: x.price, rating: x.rating, ratingCount: x.ratingCount,
        favoriteCount: x.favoriteCount, brand: x.brand, merchantId: x.merchantId, merchantName: x.merchantName, storeUrl: x.storeUrl,
        sameMerchant: !!x.merchantId && x.merchantId === base.merchantId,
        similarity: Math.round(similarity(base.title, x.title, { brandA: base.brand, brandB: x.brand }) * 100) / 100,
      }))
      .sort((a, b) => b.similarity - a.similarity || (b.ratingCount || 0) - (a.ratingCount || 0))
      .slice(0, 50)
    base.competitors = { ...base.competitors, trendyol: { updatedAt: now(), query: job.meta.query, items: list } }
    return list.length
  },

  lens(job, results) {
    const base = db.products[job.productId]
    if (!base) return 0
    let total = 0
    for (const [role, key] of [['tr', 'lensTr'], ['global', 'lensGlobal']]) {
      const seen = new Set()
      const items = (results[role] || []).map(normalizeLensItem).filter((i) => i && !seen.has(i.link) && seen.add(i.link))
      base.competitors = { ...base.competitors, [key]: { updatedAt: now(), items } }
      total += items.length
    }
    return total
  },

  meta(job, { main = [] }) {
    const summary = summarizeMeta(main, job.meta.limit)
    job.meta.result = summary
    const base = job.productId && db.products[job.productId]
    if (base) base.metaChecks = [{ query: job.meta.query, at: now(), ...summary }, ...(base.metaChecks || [])].slice(0, 10)
    return summary.fetched
  },
}

// ---------- İzleme döngüsü ----------

async function pollJob(job) {
  for (const r of job.runs) {
    if (!r.runId || apify.TERMINAL.has(r.status)) continue
    try {
      const run = await apify.getRun(r.runId)
      r.status = run.status
      r.statusMessage = run.statusMessage || null
      r.costUsd = run.usageTotalUsd ?? r.costUsd ?? null
      if (run.status !== 'SUCCEEDED' && apify.TERMINAL.has(run.status) && !r.statusMessage) r.statusMessage = await apify.getLogError(r.runId)
    } catch (err) {
      r.pollErrors = (r.pollErrors || 0) + 1
      if (r.pollErrors > 10) Object.assign(r, { status: 'FAILED', statusMessage: err.message })
    }
  }
  await pump(job)
  job.costUsd = job.runs.reduce((a, r) => a + (r.costUsd || 0), 0) || null
  if (job.status !== 'running' || job.queue?.length || !job.runs.every((r) => apify.TERMINAL.has(r.status))) return

  try {
    const results = {}
    for (const r of job.runs) results[r.role] = r.datasetId ? await apify.getItems(r.datasetId) : []
    const anyData = Object.values(results).some((x) => x.length)
    const failed = job.runs.filter((r) => r.status !== 'SUCCEEDED')
    if (!anyData && failed.length === job.runs.length) {
      throw new Error(`Apify çalıştırması başarısız: ${[...new Set(failed.map((r) => r.statusMessage || r.status))].join(' · ')}`)
    }
    job.resultCount = HANDLERS[job.type](job, results)
    if (failed.length) job.meta.failedRuns = failed.map((r) => ({ role: r.role, message: r.statusMessage || r.status }))
    job.status = 'succeeded'
  } catch (err) {
    job.status = 'failed'
    job.error = err.message
  }
  job.finishedAt = now()
  job.costPending = true

  // Kaydedilen adaylar için satıcı bilgisini otomatik çek
  // (Satıcı bilgisi daha önce çekilmiş / linkten detaylı gelmiş ürünler için tekrar ücret ödenmez)
  const toEnrich = (job.meta.productIds || []).filter((id) => db.products[id] && !db.products[id].enrichedAt && !db.products[id].detailed)
  if (job.type === 'search' && job.status === 'succeeded' && job.meta.autoEnrich && toEnrich.length) {
    try {
      const child = await startEnrich(toEnrich, { parentJobId: job.id })
      job.meta.enrichJobId = child.id
    } catch (err) {
      job.meta.enrichError = err.message
    }
  }
}

// Apify, ürün başına ücretleri çalıştırma bittikten birkaç saniye sonra işliyor. Bitişten sonraki
// 2 dakika boyunca maliyeti tekrar okuyup "gerçek maliyet"i günceller.
async function finalizeCost(job) {
  if (Date.now() - new Date(job.finishedAt).getTime() > 120e3) {
    job.costPending = false
    return
  }
  for (const r of job.runs) {
    if (!r.runId) continue
    try {
      const run = await apify.getRun(r.runId)
      r.costUsd = run.usageTotalUsd ?? r.costUsd
    } catch {}
  }
  job.costUsd = job.runs.reduce((a, r) => a + (r.costUsd || 0), 0) || null
}

let busy = false
async function tick() {
  if (busy) return
  busy = true
  try {
    const running = Object.values(db.jobs).filter((j) => j.status === 'running')
    for (const job of running) await pollJob(job)
    const finishing = Object.values(db.jobs).filter((j) => j.status !== 'running' && j.costPending)
    for (const job of finishing) await finalizeCost(job)
    if (running.length || finishing.length) save()
  } catch (err) {
    console.error('[jobs] izleme hatası:', err)
  } finally {
    busy = false
  }
}

export function startPoller() {
  setInterval(tick, 4000)
  tick()
}
