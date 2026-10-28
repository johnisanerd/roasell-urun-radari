import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true })

function parseJson(value) {
  if (!value) return {}
  try {
    return JSON.parse(value)
  } catch {
    console.warn('[config] TRENDYOL_INPUT_EXTRA geçerli bir JSON değil, yok sayıldı.')
    return {}
  }
}

export const env = {
  // .env dosyası her istekte yeniden okunmaz; token değişince sunucuyu yeniden başlatın.
  get token() {
    return (process.env.APIFY_TOKEN || '').trim()
  },
  port: Number(process.env.PORT) || 5174,
  trendyolActor: process.env.TRENDYOL_ACTOR || 'memo23/trendyol-scraper',
  lensActor: process.env.LENS_ACTOR || 'johnvc/google-lens-api',
  metaActor: process.env.META_ADS_ACTOR || 'apify/facebook-ads-scraper',
  trendyolInputExtra: parseJson(process.env.TRENDYOL_INPUT_EXTRA),
}

// "Genel tarama" — anahtar kelime girilmediğinde dokümandaki "sorun çözen, kargo dostu" ürün
// kategorilerinde tarama yapılır. Uzun (spesifik) sorgular doygun genel listelemeleri azaltır.
// Dropshipping'de ürün avı için kullanılan kalıplar: "<sorun> + önleyici/giderici/düzeltici",
// "<vücut bölgesi> + destek/korse/bant", "pratik/akıllı/katlanır + <eşya>", "<hedef kitle> + <ihtiyaç>".
export const GENERAL_GROUPS = [
  {
    name: 'Sağlık & ağrı',
    queries: [
      'bacak arası yastık', 'bel destek minderi', 'boyun ağrısı yastığı', 'dik duruş korsesi', 'horlama önleyici', 'burun bandı horlama',
      'burun dilatörü', 'topuk dikeni tabanlık', 'diz ağrısı dizlik', 'idrar kaçırma iç çamaşırı', 'halluks valgus düzeltici',
      'kuyruk sokumu minderi', 'ortopedik koltuk minderi', 'karpal tünel ateli', 'baş parmak ateli', 'tetik parmak ateli',
      'tenisçi dirsekliği', 'omuz destek bandı', 'bel fıtığı korsesi', 'boyun düzeltici', 'sıcak soğuk jel kompres', 'tens cihazı',
      'akupresür mat', 'boyun masaj yastığı', 'göz masaj aleti', 'varis çorabı', 'bilek destek bandı', 'ayak bileği destek',
    ],
  },
  {
    name: 'Uyku & dinlenme',
    queries: [
      'uyku maskesi 3d', 'uyku kulak tıkacı', 'çene bandı horlama', 'reflü yastığı kama', 'diz altı yastık', 'hamile yastığı',
      'seyahat boyun yastığı', 'soğutucu yastık', 'ağız bandı uyku', 'yatak kaydırmaz bant',
    ],
  },
  {
    name: 'Kadın & vücut',
    queries: [
      'toparlayıcı korse', 'bel inceltici kemer', 'vücut şekillendirici body', 'sıkılaştırıcı tayt', 'kalça kaldırıcı', 'göğüs dikleştirici',
      'doğum sonrası korse', 'selülit masaj aleti', 'gıdı toparlayıcı bant', 'yüz germe bandı', 'termal ter kemeri', 'bel eğitmeni korse',
      'görünmez sütyen', 'meme ucu gizleyici', 'dekolte sütyen bandı', 'uyluk sürtünme bandı', 'kalça pedi', 'lohusa külodu',
      'göğüs bandı', 'sırt dekolte sütyen',
    ],
  },
  {
    name: 'Güzellik & kişisel bakım',
    queries: [
      'siyah nokta temizleyici', 'yüz temizleme fırçası', 'tüy alma kristal', 'ağda ısıtıcı', 'ısısız saç maşası', 'saç kıvırma bigudi',
      'topuk çatlak çorabı', 'ayak peeling çorabı', 'elektrikli topuk törpüsü', 'tırnak mantarı', 'batık tırnak düzeltici', 'kaş şablonu',
      'gua sha taşı', 'yüz masaj rulosu', 'buz küresi yüz', 'diş beyazlatma kalemi', 'dil temizleyici', 'burun kılı temizleyici',
      'sırt kaşıyıcı', 'sırt krem sürme aparatı', 'kirpik kıvırıcı ısıtmalı', 'saç dökülme şampuanı',
    ],
  },
  {
    name: 'Ev & temizlik',
    queries: [
      'nem alıcı', 'küf önleyici', 'lavabo açıcı', 'gider koku önleyici', 'tüy toplayıcı rulo', 'tiftik alıcı', 'kireç sökücü',
      'derz dolgu kalemi', 'banyo silikon bant', 'kapı altı rüzgar önleyici', 'toz alma eldiveni', 'duvar lekesi silgisi',
      'halı kaydırmaz bant', 'mobilya ayak keçesi', 'buzdolabı koku giderici', 'çamaşır tüy toplayıcı top', 'lavabo süzgeci',
      'gider tıkanıklığı açma teli',
    ],
  },
  {
    name: 'Mutfak pratik',
    queries: [
      'sebze doğrayıcı', 'sarımsak ezici', 'yağ püskürtücü sprey', 'airfryer pişirme kağıdı', 'airfryer silikon kap', 'silikon streç kapak',
      'vakumlu saklama kabı', 'kavanoz açacağı', 'bıçak bileyici', 'yumurta ayırıcı', 'tencere kapak standı', 'süzgeçli kapak',
      'buzdolabı düzenleyici', 'baharat organizeri', 'mutfak raf düzenleyici', 'poşet klipsi', 'soğan doğrayıcı',
    ],
  },
  {
    name: 'Düzen & organizasyon',
    queries: [
      'kablo düzenleyici', 'çekmece içi düzenleyici', 'vakumlu saklama torbası', 'askı düzenleyici', 'ayakkabı düzenleyici',
      'kapı arkası askı', 'makyaj organizer', 'yatak altı hurç', 'dolap içi düzenleyici', 'yapışkanlı askı',
    ],
  },
  {
    name: 'Evcil hayvan',
    queries: [
      'kedi tüy toplayıcı', 'kedi tüy tarağı', 'köpek tırnak törpüsü', 'kedi tırmalama önleyici', 'kedi su pınarı', 'yalama matı',
      'yavaş yeme mama kabı', 'pire kene tasması', 'köpek diş fırçası', 'kedi kum paspası', 'pati temizleyici', 'köpek emniyet kemeri',
      'köpek havlama önleyici',
    ],
  },
  {
    name: 'Anne & bebek',
    queries: [
      'bebek gaz sancısı', 'emzirme yastığı', 'burun aspiratörü bebek', 'bebek güvenlik kilidi', 'priz koruyucu', 'köşe koruyucu',
      'bebek diş kaşıyıcı', 'meyve emzik', 'bebek tırnak törpüsü', 'bebek banyo filesi', 'alıştırma külodu', 'klozet adaptörü çocuk',
      'araç güneşlik bebek', 'göğüs pompası', 'pişik kremi',
    ],
  },
  {
    name: 'Oto & araç',
    queries: [
      'koltuk arası boşluk doldurucu', 'araç içi düzenleyici', 'araç telefon tutucu', 'araç çöp kutusu', 'kapı koruma bandı',
      'far temizleme kiti', 'çizik giderici', 'araç koku giderici', 'cam buğu önleyici', 'bagaj düzenleyici', 'emniyet kemeri yastığı',
      'koltuk sırtı organizer',
    ],
  },
  {
    name: 'Spor & fitness',
    queries: [
      'direnç bandı', 'kalça direnç bandı', 'ab roller', 'el yayı', 'atlama ipi', 'foam roller', 'mini masaj tabancası', 'koşu bel çantası',
      'sauna kemeri', 'şınav barı', 'bilek ağırlığı',
    ],
  },
  {
    name: 'Telefon & gadget',
    queries: [
      'mıknatıslı şarj kablosu', 'telefon soğutucu', 'laptop standı', 'mavi ışık gözlüğü', 'kamera kapatıcı', 'bilek destekli mouse pad',
      'boyun fanı', 'hareket sensörlü led', 'dolap içi led', 'telefon boyun askısı', 'kablosuz şarj standı',
    ],
  },
  {
    name: 'Haşere & bahçe',
    queries: [
      'haşere kovucu', 'sivrisinek kovucu', 'ultrasonik fare kovucu', 'hamamböceği jeli', 'sinek tuzağı', 'karınca yemi', 'güve kovucu',
      'solar bahçe lambası', 'saksı sulama damlatıcı', 'kedi köpek kovucu',
    ],
  },
  {
    name: 'Ayak & giyim çözümleri',
    queries: [
      'koku giderici ayakkabı', 'silikon topuk koruyucu', 'ayakkabı vurma önleyici', 'ayakkabı genişletici', 'kaymaz babet çorap',
      'ortopedik tabanlık', 'elastik bağcık', 'tüy topu alıcı', 'görünmez çorap', 'kırışık giderici sprey',
    ],
  },
  {
    name: 'Seyahat',
    queries: ['seyahat düzenleyici çanta', 'vakumlu seyahat torbası', 'rfid pasaport kılıfı', 'seyahat şişe seti', 'priz dönüştürücü', 'valiz tartısı'],
  },
]
export const GENERAL_QUERIES = GENERAL_GROUPS.flatMap((g) => g.queries)

// Roasell "Trendyol Ürün Bulma" dokümanındaki kriterler — Ayarlar ekranından değiştirilebilir.
export const DEFAULT_SETTINGS = {
  // Madde 2 — Fiyat
  maxSalePrice: 750,
  costMin: 20,
  costMax: 300,
  bulkDiscountPct: 50, // Trendyol fiyatından toplu alımda beklenen indirim (tahmini maliyet için)
  breakEvenIdeal: 1.6,
  breakEvenMax: 1.8,
  defaultShipping: 60,

  // Yorum (değerlendirme) sayısı baremi
  reviewLow: 20,
  reviewIdeal: 500,
  reviewSaturated: 3000,

  // Madde 5 — Meta Ads Library
  metaAdsTest: 25,
  metaAdsScale: 50,
  metaResultsLimit: 60,

  // Madde 6 — TR rakip
  brandedCompetitorLimit: 2,

  // Apify çekim ayarları
  defaultMaxItems: 60,
  lensCountryTr: 'tr',
  lensCountryGlobal: 'us',

  // Sezgisel sınıflandırma sözlükleri (Madde: sorun çözen / kargo dostu)
  painKeywords: [
    'ağrı', 'ortopedik', 'destek', 'düzeltici', 'dik duruş', 'korse', 'boyunluk', 'dizlik', 'topuk', 'masaj',
    'rahatlat', 'tıkanık', 'burun', 'horlama', 'uyku', 'uykusuzluk', 'yastık', 'nebülizatör', 'inhaler', 'balgam',
    'solunum', 'prostat', 'idrar', 'sızıntı', 'sızdırmaz', 'emici', 'inkontinans', 'mesane', 'nasır', 'mantar',
    'akne', 'sivilce', 'leke', 'çatlak', 'kaşıntı', 'egzama', 'siğil', 'tüy dökücü', 'tüy alma', 'epilasyon',
    'terleme', 'ter önleyici', 'koku giderici', 'nem alıcı', 'küf', 'haşere', 'sinek', 'sivrisinek', 'böcek', 'pire',
    'kene', 'varis', 'basınç çorabı', 'kompresyon', 'terapi', 'fizik tedavi', 'tansiyon', 'ateş ölçer', 'termometre',
    'diş taşı', 'diş beyazlatma', 'saç dökülme', 'kepek', 'selülit', 'şişkinlik', 'kramp', 'romatizma', 'fıtık',
    'skolyoz', 'halluks', 'bunyon', 'plantar', 'eklem', 'kireçlenme', 'göz yorgunluğu', 'mavi ışık', 'önleyici',
    'güvenlik kilidi', 'tıkaç', 'lavabo açıcı', 'düzenleyici', 'organizer', 'kolaylaştırıcı', 'hijyen', 'emzirme',
    'pişik', 'gaz sancısı', 'kolik',
    // Kadın & vücut: toparlayıcı / sıkılaştırıcı ürünler de somut bir sorun çözer
    'toparlayıcı', 'sıkılaştırıcı', 'sıkılaştırma', 'inceltici', 'şekillendirici', 'dikleştirici', 'kaldırıcı',
    'doğum sonrası', 'lohusa', 'sarkma', 'gıdı', 'kırışıklık', 'yüz germe', 'bel eğitmeni', 'göğüs bandı', 'jel pad',
    // Genişletilmiş kategoriler (evcil hayvan, oto, mutfak, temizlik…) için "sorun çözen" kalıplar
    'giderici', 'kovucu', 'açıcı', 'sökücü', 'kaydırmaz', 'atel', 'dirseklik', 'kompres', 'tens', 'akupresür', 'reflü',
    'dilatör', 'aspiratör', 'tırmalama', 'havlama', 'yalama', 'buğu', 'çizik', 'vurma', 'sürtünme', 'batık', 'tiftik',
    'tüy toplayıcı', 'temizleyici', 'koruyucu', 'gizleyici', 'soğutucu', 'doğrayıcı', 'bileyici', 'genişletici', 'tıkanıklık',
  ],
  whimKeywords: [
    'dekor', 'dekoratif', 'süs', 'biblo', 'figür', 'poster', 'tablo', 'kostüm', 'parti', 'balon', 'hediyelik',
    'koleksiyon', 'anahtarlık', 'sticker', 'çıkartma', 'kolye', 'küpe', 'bileklik', 'yüzük',
  ],
  bulkyKeywords: [
    'mobilya', 'koltuk', 'kanepe', 'dolap', 'gardırop', 'masa', 'sandalye', 'sehpa', 'kitaplık', 'baza', 'karyola',
    'buzdolabı', 'çamaşır makinesi', 'bulaşık makinesi', 'televizyon', 'tv', 'klima', 'bisiklet', 'scooter',
    'halı', 'avize', 'akvaryum', 'koşu bandı', 'kondisyon bisikleti', 'beşik', 'bebek arabası', 'puset', 'fırın',
    'mikrodalga', 'kombi', 'jeneratör', 'şezlong', 'hamak', 'çadır', 'mangal', 'ütü masası', 'kedi ağacı',
  ],
  fragileKeywords: ['cam', 'porselen', 'seramik', 'kristal', 'ayna', 'vazo', 'fanus'],

  whatsappTemplate:
    'Merhabalar {satici},\n\nTrendyol üzerinden satışını yapmış olduğunuz "{urun}" ürünü ile ilgileniyoruz ve aktif olarak bu ürünün satışını yapıyoruz.\n\nBu nedenle sizlerden toplu satın alım yapmak istiyoruz. Toplu alım için bize özel bir fiyat verebilir misiniz?\n\nUygun olması durumunda ilk etapta 100–250 adet arası bir sipariş planlıyoruz.\n\nÜrün kalitesinden memnun kalmamız ve anlaşma sağlamamız durumunda uzun vadeli ve düzenli çalışmayı isteriz.\n\nGeri dönüşünüzü bekliyoruz. İyi çalışmalar dilerim.',
}
