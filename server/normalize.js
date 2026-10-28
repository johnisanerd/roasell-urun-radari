// Farklı Apify aktörlerinin çıktılarını tek bir ürün şemasına dönüştürür.
// Varsayılan: automation-lab/trendyol-scraper (düz alanlar). fatihtahta/trendyol-scraper (iç içe alanlar)
// ve ham Trendyol JSON'u da desteklenir.
import { slugify } from './text.js'

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

export function pick(obj, paths) {
  for (const p of paths) {
    const v = get(obj, p)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export function num(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object') return num(v.value ?? v.amount ?? v.extracted ?? v.discountedPrice ?? v.sellingPrice ?? v.price ?? v.text)
  let s = String(v).replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) {
    // "1.299,90" (TR) ya da "1,299.90" (EN)
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const str = (v) => {
  if (v == null) return null
  if (typeof v === 'object') return str(v.name ?? v.title ?? v.text ?? v.value)
  const s = String(v).trim()
  return s || null
}

const bool = (v) => (v == null ? null : typeof v === 'boolean' ? v : ['true', '1', 'yes', 'var'].includes(String(v).toLowerCase()))

export function absTrendyolUrl(u) {
  if (!u) return null
  u = String(u)
  if (u.startsWith('//')) return `https:${u}`
  if (u.startsWith('/')) return `https://www.trendyol.com${u}`
  return u
}

function absImage(u) {
  if (!u) return null
  if (typeof u === 'object') u = u.url ?? u.src ?? u.original ?? u.large
  if (!u) return null
  u = String(u)
  if (u.startsWith('//')) return `https:${u}`
  if (u.startsWith('/')) return `https://cdn.dsmcdn.com${u}`
  return u
}

export const trendyolStoreUrl = (merchantId, merchantName) =>
  merchantId ? `https://www.trendyol.com/magaza/${slugify(merchantName) || 'magaza'}-m-${merchantId}` : null

export function trendyolSearchUrl(query, { minPrice, maxPrice, sort } = {}) {
  const q = encodeURIComponent(query)
  const params = [`q=${q}`, `qt=${q}`, `st=${q}`, 'os=1']
  if (minPrice != null || maxPrice != null) params.push(`prc=${minPrice ?? 0}-${maxPrice ?? '*'}`)
  if (sort) params.push(`sst=${sort}`)
  return `https://www.trendyol.com/sr?${params.join('&')}`
}

function normalizeMerchants(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((m) => {
      const id = pick(m, ['merchantId', 'id', 'sellerId', 'merchant.id'])
      const name = str(pick(m, ['merchantName', 'name', 'sellerName', 'merchant.name']))
      if (!id && !name) return null
      return {
        id: id ? String(id) : null,
        name,
        price: num(pick(m, ['price', 'sellingPrice', 'discountedPrice', 'price.sellingPrice'])),
        score: num(pick(m, ['score', 'sellerScore', 'merchantScore'])),
        url: absTrendyolUrl(pick(m, ['url', 'productUrl'])),
        storeUrl: absTrendyolUrl(pick(m, ['storeUrl', 'sellerUrl'])) || trendyolStoreUrl(id, name),
      }
    })
    .filter(Boolean)
}

export function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'object') return null
  // memo23: "listing" (arama satırı) ve "product" (detay satırı); automation-lab: "product"
  if (raw.type && !['product', 'products', 'listing'].includes(String(raw.type).toLowerCase())) return null

  const id = pick(raw, ['productId', 'id', 'contentId', 'product_id', 'productContentId'])
  const title = str(pick(raw, ['name', 'title', 'productName', 'product_name']))
  if (!id || !title) return null

  const merchantId = pick(raw, ['merchantId', 'seller.id', 'seller.primary.id', 'sellerId', 'merchant.id', 'merchantListing.merchant.id'])
  const merchantName =
    str(pick(raw, ['merchantName', 'seller.name', 'seller.primary.name', 'sellerName', 'merchant.name', 'merchantListing.merchant.name'])) ||
    (typeof raw.seller === 'string' ? raw.seller : null)

  const images = pick(raw, ['images', 'media.images', 'imageUrls'])
  const ratingCount = num(pick(raw, ['ratingCount', 'ratingScore.totalCount', 'metrics.rating.rating_count', 'metrics.rating.total_count', 'totalRatingCount']))
  const reviewCount = num(pick(raw, ['reviewCount', 'commentCount', 'ratingScore.commentCount', 'metrics.rating.comment_count', 'totalCommentCount']))

  return {
    id: String(id),
    groupId: str(pick(raw, ['productGroupId', 'groupId', 'product_group_id'])),
    title,
    brand: str(pick(raw, ['brand', 'brandName', 'brand.name'])),
    category: str(pick(raw, ['category', 'categoryName', 'category.name', 'categoryHierarchy'])),
    url: absTrendyolUrl(pick(raw, ['url', 'productUrl', 'link'])),
    image: absImage(pick(raw, ['imageUrl', 'image', 'media.primary_image', 'thumbnail'])) || absImage(Array.isArray(images) ? images[0] : null),
    price: num(pick(raw, ['price', 'pricing.current_price', 'discountedPrice', 'sellingPrice', 'salePrice', 'currentPrice'])),
    originalPrice: num(pick(raw, ['originalPrice', 'pricing.original_price', 'pricing.list_price', 'listPrice'])),
    currency: str(pick(raw, ['currency', 'pricing.currency'])),
    rating: num(pick(raw, ['ratingAverage', 'rating', 'ratingScore.averageRating', 'metrics.rating.average_rating', 'averageRating'])),
    ratingCount: ratingCount ?? reviewCount,
    reviewCount,
    favoriteCount: num(pick(raw, ['favoriteCount', 'favorites', 'metrics.favorite_count', 'favoriteCountValue', 'socialProof.favoriteCount'])),
    inStock: bool(pick(raw, ['inStock', 'availability.in_stock', 'hasStock', 'isInStock'])),
    merchantId: merchantId ? String(merchantId) : null,
    merchantName,
    merchantScore: num(pick(raw, ['seller.score', 'seller.sellerScore', 'sellerScore', 'merchantScore', 'seller.primary.score'])),
    merchantLocation: str(pick(raw, ['seller.location', 'seller.city', 'sellerLocation'])),
    merchantProductCount: num(pick(raw, ['seller.productCount', 'seller.totalProducts'])),
    storeUrl:
      absTrendyolUrl(pick(raw, ['seller.storeUrl', 'seller.url', 'storeUrl', 'sellerUrl', 'merchantUrl', 'seller.primary.url'])) ||
      trendyolStoreUrl(merchantId, merchantName),
    otherMerchants: normalizeMerchants(pick(raw, ['otherMerchants', 'otherSellers', 'seller.others', 'merchants', 'sellers'])),
    promotions: [...(Array.isArray(raw.promotions) ? raw.promotions : []), ...(Array.isArray(raw.badges) ? raw.badges : [])].map(str).filter(Boolean).slice(0, 6),
    officialSeller: bool(pick(raw, ['hasOfficialSellerBadge', 'isOfficialSeller', 'seller.official'])),
    freeCargo: bool(raw.freeCargo),
    officialName: str(pick(raw, ['sellerOfficialName', 'seller.officialName', 'seller.companyName'])),
    contactEmail: str(pick(raw, ['contactEmail', 'emailEnrichment.emails.0'])),
    contactWebsite: str(pick(raw, ['contactWebsite', 'emailEnrichment.website'])),
    detailed: String(raw.type || '').toLowerCase() === 'product' && !!pick(raw, ['sellerName', 'sellerOfficialName', 'favoriteCount']),
    searchQuery: str(pick(raw, ['searchQuery', 'source_context.query', 'query'])),
  }
}

/** Aynı ürünün listeleme + detay satırlarını tek kayıtta birleştirir (boş alanlar dolu olanı ezmez). */
export function normalizeItems(items) {
  const byId = new Map()
  for (const raw of items) {
    const p = normalizeProduct(raw)
    if (!p) continue
    const cur = byId.get(p.id)
    byId.set(p.id, cur ? mergeDefined(cur, p) : p)
  }
  return [...byId.values()]
}

export function mergeDefined(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue
    if (k === 'detailed' && !v) continue
    target[k] = v
  }
  return target
}

// ---------- Google Lens ----------

const MARKETPLACES = [
  'trendyol.com', 'hepsiburada.com', 'n11.com', 'amazon.', 'ciceksepeti.com', 'pazarama.com', 'pttavm.com',
  'akakce.com', 'cimri.com', 'epey.com', 'temu.com', 'aliexpress.', 'alibaba.com', '1688.com', 'ebay.', 'etsy.com',
  'walmart.com', 'shein.', 'dhgate.com', 'wish.com', 'target.com', 'bestbuy.com', 'noon.com', 'idefix.com',
  'koctas.com.tr', 'teknosa.com', 'mediamarkt.com.tr', 'boyner.com.tr', 'morhipo.com', 'modanisa.com', 'lcw.com',
  'decathlon.com.tr', 'watsons.com.tr', 'gratis.com', 'rossmann.com.tr', 'migros.com.tr', 'a101.com.tr',
  'kitapyurdu.com', 'joom.com', 'banggood.com', 'lazada.', 'shopee.', 'tokopedia.com', 'mercadolibre.', 'made-in-china.com',
  'kaufland.', 'otto.de', 'allegro.pl', 'rakuten.', 'flipkart.com', 'costco.com', 'wayfair.com', 'homedepot.com',
]
const SOCIAL = [
  'instagram.com', 'facebook.com', 'pinterest.', 'youtube.com', 'tiktok.com', 'x.com', 'twitter.com', 'reddit.com',
  'sikayetvar.com', 'eksisozluk.com', 'donanimhaber.com', 'wikipedia.org', 'google.', 'gstatic.com', 'quora.com',
  'medium.com', 'linkedin.com', 'threads.net', 'vk.com', 'alamy.com', 'shutterstock.com', 'istockphoto.com',
  'freepik.com', 'dreamstime.com', 'depositphotos.com', 'adobe.com', 'vecteezy.com', 'bing.com', 'yandex.',
]

export const domainOf = (link) => {
  try {
    return new URL(link).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

const matchesList = (domain, list) =>
  list.some((d) => (d.endsWith('.') ? domain.includes(d) : domain === d || domain.endsWith(`.${d}`)))

export function classifyDomain(domain) {
  if (!domain) return 'other'
  if (matchesList(domain, MARKETPLACES)) return 'marketplace'
  if (matchesList(domain, SOCIAL)) return 'social'
  return 'store'
}

export function normalizeLensItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const link = pick(raw, ['link', 'url', 'source_url', 'sourceUrl', 'pageUrl', 'page_url'])
  if (!link || !/^https?:/i.test(link)) return null
  const domain = domainOf(link)
  const priceRaw = raw.price
  const priceText = typeof priceRaw === 'object' && priceRaw ? str(priceRaw.value) : str(priceRaw)
  const currency = str(pick(raw, ['price.currency', 'currency']))
  return {
    link,
    domain,
    title: str(pick(raw, ['title', 'name'])),
    source: str(pick(raw, ['source', 'source_name', 'sourceName'])) || domain,
    thumbnail: str(pick(raw, ['thumbnail', 'image', 'imageUrl', 'thumbnailUrl'])),
    price: num(pick(raw, ['price.extracted', 'extracted_price', 'price.value', 'price'])),
    priceText,
    currency,
    matchType: str(pick(raw, ['type', 'resultType'])) || 'visual_match',
    kind: classifyDomain(domain),
    isTurkish: !!domain && (domain.endsWith('.tr') || /TRY|TL|₺/i.test(`${currency || ''} ${priceText || ''}`)),
  }
}

// ---------- Meta Ads Library ----------

export const adLibraryUrl = (query, country = 'ALL') =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=all`

export function summarizeMeta(items, limit) {
  const first = items[0] || {}
  const total = num(pick(first, ['totalCount', 'total_count', 'totalResults', 'adsCount', 'resultsCount', 'searchResultsCount']))
  const pageCounts = new Map()
  for (const it of items) {
    const name = str(pick(it, ['pageName', 'page_name', 'snapshot.page_name', 'advertiser.name']))
    if (!name) continue
    const cur = pageCounts.get(name) || { name, count: 0, url: str(pick(it, ['snapshot.page_profile_uri', 'pageProfileUri', 'pageUrl'])) }
    cur.count++
    pageCounts.set(name, cur)
  }
  return {
    count: total ?? items.length,
    capped: total == null && items.length >= limit,
    fetched: items.length,
    pages: [...pageCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    sample: items.slice(0, 6).map((it) => ({
      id: str(pick(it, ['adArchiveID', 'adArchiveId', 'ad_archive_id', 'id'])),
      pageName: str(pick(it, ['pageName', 'snapshot.page_name'])),
      text: str(pick(it, ['snapshot.body.text', 'snapshot.body', 'adText', 'body'])),
      image: absImage(pick(it, ['snapshot.images.0.original_image_url', 'snapshot.images.0.resized_image_url', 'snapshot.cards.0.original_image_url', 'snapshot.videos.0.video_preview_image_url'])),
      startDate: str(pick(it, ['startDateFormatted', 'start_date_formatted', 'startDate'])),
    })),
  }
}
