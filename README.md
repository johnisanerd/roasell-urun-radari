# Roasell · Ürün Radarı

Roasell **“Türkiye Pazarı — Trendyol Ürün Bulma ve Doğru Ürün Kriterleri”** dokümanındaki 6 ürün kriteri ve 7 adımlı süreci otomatikleştiren sistem. Trendyol’dan Apify ile ürün çeker, kriterlere göre puanlar, mağaza linklerini ve rakipleri çıkarır, tedarikçi iletişimini kolaylaştırır.

[![CI](https://github.com/Alemgir/roasell-urun-radari/actions/workflows/ci.yml/badge.svg)](https://github.com/Alemgir/roasell-urun-radari/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![Apify](https://img.shields.io/badge/Apify-Scraping-97D700?style=flat-square)

## Ekran görüntüleri

> Görseller, Apify token'ı olmadan yüklenen **demo verisiyle** alınmıştır.

### Panel
![Panel](docs/screenshots/dashboard.png)

### Ürün listesi
![Ürün listesi](docs/screenshots/products.png)

### Ürün keşfi
![Ürün keşfi](docs/screenshots/discover.png)

### Kriterler ve ayarlar
![Kriterler](docs/screenshots/settings.png)

## Özellikler

- Trendyol ürünlerini Apify aktörleriyle çeker, 6 kritere ve 7 adımlı sürece göre otomatik puanlar.
- Yorum sayısı bantları, başa baş hesaplayıcı ve karar etiketleri (Hazır / Güçlü aday / Değerlendir / Zayıf / Geç).
- Google Lens ile rakip ve yurt dışı baz mağaza adayları; Meta Ads Library ile reklam sayısı.
- Tedarikçi adımı: mağaza linki, WhatsApp taslağı ve `wa.me` bağlantısı.
- Tüm eşikler ve sözlükler arayüzden düzenlenebilir; veriler yerel `data/db.json` dosyasında tutulur.

## Teknoloji

React 19 · Vite · Express 5 · Node.js · Apify API · lucide-react

## Kurulum

```bash
npm install
# .env.example dosyasını .env olarak kopyalayıp Apify token'ınızı yazın:
#   APIFY_TOKEN=apify_api_xxxxxxxx
npm run dev
```

- Arayüz: http://localhost:5173
- API: http://localhost:5174

Token'ı değiştirdikten sonra `npm run dev`'i yeniden başlatın. Token olmadan **Ayarlar → Demo verisi yükle** ile arayüzü deneyebilirsiniz.

Testler: `npm test` (Node'un yerleşik test koşucusu; puanlama, metin eşleme ve veri normalizasyonu kapsanır).

Üretim modu: `npm start` (arayüzü derleyip tek port üzerinden sunar).

## Kullanılan Apify aktörleri

`.env` içinden değiştirilebilir. Aktörlerin Apify hesabınızda kullanılabilir olması gerekir.

| Amaç | Aktör | Tahmini maliyet |
|---|---|---|
| Trendyol ürün + mağaza linki + satıcı ünvanı | `memo23/trendyol-scraper` | çalıştırma başına 0,005 $ + listeleme 0,0005 $/ürün, satıcı detayı 0,002 $/ürün, e-posta 0,02 $ (yalnızca bulunursa) |
| Madde 3 & 6 — Google Lens (TR rakip + yurt dışı baz mağaza) | `johnvc/google-lens-api` | ~0,006 $ / görsel (ürün başına 2 tarama) |
| Madde 5 — Meta Ads Library aktif reklam sayısı | `apify/facebook-ads-scraper` | ~3,4–5,8 $ / 1.000 reklam |

Notlar:
- Aktörün ürün limiti tüm sorguların **toplamıdır** ve önce ilk sorgu doldurulur. Bu yüzden her anahtar kelime ayrı bir Apify çalıştırması olarak başlatılır (en fazla 4 paralel).
- memo23'te arama yalnızca `keyword` ile çalışır; ürün URL'leri `startUrls` içinde **düz metin** verilmelidir (`{url}` nesnesi 0 sonuç döndürür). Tarama ucuz listeleme ile yapılır, satıcı adı/ticari ünvan/favori sayısı yalnızca kriterlere uyan adaylar için ayrıca çekilir.
- Trendyol sıralaması kullanılmaz ("en çok satan" doygun ürünleri getirir). Varsayılan olarak yalnızca 20–500 değerlendirmeli, resmi satıcı rozetsiz ürünler kaydedilir.
- Satıcı telefonu Trendyol'da herkese açık değildir (yalnızca giriş yapılmış hesapta Mesafeli Satış Sözleşmesi'nde görünür). Sistem ticari ünvanı çeker ve Google araması için bağlantı verir.
- `automation-lab/trendyol-scraper` kullanılırsa `includeSeller` kapalıdır: açıkken Trendyol satıcı API'si 418 döndürüp çalıştırmayı düşürüyor. Mağaza linki satıcı ID'sinden üretilir.
- Anahtar kelime girmeden **Genel tarama** seçilebilir: dokümandaki sorun çözen kategorilerde en çok satanlar taranır.

`fatihtahta/trendyol-scraper` da desteklenir (`TRENDYOL_ACTOR=fatihtahta/trendyol-scraper`). Normalizasyon katmanı her iki aktörün çıktısını ortak şemaya çevirir.

## Dokümandan sisteme: kriterler

| Doküman kuralı | Sistemdeki karşılığı |
|---|---|
| Satış fiyatı maks. 750 TL, tedarik 20–300 TL | Otomatik fiyat kontrolü + toplu alım indirimiyle tahmini maliyet. Fiyat aralığı dışındaki ve 3.000+ değerlendirmeli ürünler kaydedilmeden elenir (Trendyol'un URL fiyat filtresi aktörde uygulanmıyor). |
| Türkiye’de aktif satış | Değerlendirme, favori ve stok sinyalleri |
| Sorun çözen ürün (pain point) | Türkçe ihtiyaç/keyfi ürün sözlüğü + elle pain point notu |
| Küçük, kargo dostu | Hacimli/kırılgan ürün sözlüğü |
| Tedarik kolay | Stok ve satıcı bilgisi |
| Yorum baremi 0–20 / 20–500 / 500–3.000 / 3.000+ | Renkli bant ve karar (3.000+ → “Geç”) |
| Madde 2 · 1,6–1,8 başa baş | Hesaplayıcı: satış ÷ (satış − tedarik − kargo − diğer) ≤ 1,8 |
| Madde 3 · Yurt dışı baz mağaza | Google Lens (US) → pazaryeri dışı mağaza adayları, tek tıkla seçim |
| Madde 4 · PPSPY + mağaza yapısı | Manuel onay kutuları ve linkler |
| Madde 5 · Meta’da 25+ / 50+ reklam | Apify ile sayım veya manuel giriş |
| Madde 6 · TR’de 2’den fazla markalaşmış rakip | Google Lens (TR) + Trendyol rakip taraması, “markalaşmış” işaretleme |
| Madde 7 · Tedarikçi | Mağaza linki, Mesafeli Satış Sözleşmesi adımları, WhatsApp taslağı ve `wa.me` linki |

Tüm eşikler ve sözlükler **Kriterler & Ayarlar** ekranından değiştirilebilir. Veriler `data/db.json` dosyasında saklanır.
