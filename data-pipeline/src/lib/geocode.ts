/**
 * Offline geocoder for free-text GitHub profile locations ("Bengaluru, India", "SF Bay Area",
 * "Berlin/London", "Remote"). No network, no fuzzy matching: a string either matches one of
 * the 241 cities in shared/cities.ts (directly or through an alias), or falls back to a
 * country via country names, ISO codes, US states, provinces, flags and well-known cities
 * that are not on the globe. Everything else is "none".
 */
import { CITIES, type City } from '@shared/cities'
import { ALL_COUNTRIES, countryByCc } from './countries'
import { US_STATES } from './usStates'

export interface GeoCity {
  name: string
  cc: string
  lat: number
  lng: number
}

export type GeoMatch = { kind: 'city'; city: GeoCity; cc: string } | { kind: 'country'; cc: string } | { kind: 'none' }

export const GEOCODING_METHOD =
  'Offline: normalised free-text profile locations matched against the 241 globe cities plus an alias table; ' +
  'otherwise country by name, ISO code, flag emoji, US state, province or well-known city; no fuzzy matching.'

const NONE: GeoMatch = { kind: 'none' }

const LETTER_FIXES: Record<string, string> = {
  ß: 'ss',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
}

/** Lowercase ASCII words: diacritics removed, punctuation collapsed to single spaces. */
export function normalizePlace(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ßøæœłđðþı]/g, (ch) => LETTER_FIXES[ch] ?? ch)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// --- City tables -------------------------------------------------------------------------

/** Alias (normalised) → canonical name in shared/cities.ts. */
const CITY_ALIASES: Record<string, string> = {
  // United States
  nyc: 'New York',
  'new york city': 'New York',
  'new york ny': 'New York',
  manhattan: 'New York',
  brooklyn: 'New York',
  sf: 'San Francisco',
  'san fran': 'San Francisco',
  'sf bay area': 'San Francisco',
  'bay area': 'San Francisco',
  'the bay area': 'San Francisco',
  'san francisco bay area': 'San Francisco',
  'sf ca': 'San Francisco',
  norcal: 'San Francisco',
  'silicon valley': 'San Jose',
  la: 'Los Angeles',
  'l a': 'Los Angeles',
  socal: 'Los Angeles',
  atl: 'Atlanta',
  philly: 'Philadelphia',
  vegas: 'Las Vegas',
  atx: 'Austin',
  htx: 'Houston',
  dfw: 'Dallas',
  'dallas fort worth': 'Dallas',
  'fort worth': 'Dallas',
  // Canada and Latin America
  mtl: 'Montréal',
  'greater toronto area': 'Toronto',
  gta: 'Toronto',
  'ciudad de mexico': 'Mexico City',
  cdmx: 'Mexico City',
  'mexico df': 'Mexico City',
  'mexico d f': 'Mexico City',
  sampa: 'São Paulo',
  'sao paulo sp': 'São Paulo',
  rio: 'Rio de Janeiro',
  'rio de janeiro rj': 'Rio de Janeiro',
  'brasilia df': 'Brasília',
  'bogota dc': 'Bogotá',
  'bogota d c': 'Bogotá',
  bsas: 'Buenos Aires',
  caba: 'Buenos Aires',
  'santiago de chile': 'Santiago',
  // Europe
  kiev: 'Kyiv',
  moskva: 'Moscow',
  wien: 'Vienna',
  praha: 'Prague',
  warszawa: 'Warsaw',
  lisboa: 'Lisbon',
  roma: 'Rome',
  milano: 'Milan',
  bruxelles: 'Brussels',
  brussel: 'Brussels',
  kobenhavn: 'Copenhagen',
  zuerich: 'Zurich',
  athina: 'Athens',
  bucuresti: 'Bucharest',
  beograd: 'Belgrade',
  helsingfors: 'Helsinki',
  'nicosia cyprus': 'Nicosia',
  // Asia and Middle East
  bengaluru: 'Bangalore',
  bangaluru: 'Bangalore',
  bengalooru: 'Bangalore',
  blr: 'Bangalore',
  bombay: 'Mumbai',
  'navi mumbai': 'Mumbai',
  thane: 'Mumbai',
  delhi: 'New Delhi',
  'delhi ncr': 'New Delhi',
  gurgaon: 'New Delhi',
  gurugram: 'New Delhi',
  noida: 'New Delhi',
  'greater noida': 'New Delhi',
  ghaziabad: 'New Delhi',
  faridabad: 'New Delhi',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  saigon: 'Ho Chi Minh City',
  'sai gon': 'Ho Chi Minh City',
  hcmc: 'Ho Chi Minh City',
  'ho chi minh': 'Ho Chi Minh City',
  'hcm city': 'Ho Chi Minh City',
  'ha noi': 'Hanoi',
  peking: 'Beijing',
  canton: 'Guangzhou',
  hk: 'Hong Kong',
  hongkong: 'Hong Kong',
  'hong kong sar': 'Hong Kong',
  'new taipei': 'Taipei',
  'new taipei city': 'Taipei',
  tokio: 'Tokyo',
  kl: 'Kuala Lumpur',
  'south jakarta': 'Jakarta',
  'jakarta selatan': 'Jakarta',
  'jakarta barat': 'Jakarta',
  'jakarta timur': 'Jakarta',
  'jakarta pusat': 'Jakarta',
  'jakarta utara': 'Jakarta',
  'metro manila': 'Manila',
  'krung thep': 'Bangkok',
  sg: 'Singapore',
  singapura: 'Singapore',
  dxb: 'Dubai',
  'tel aviv yafo': 'Tel Aviv',
  'tel aviv jaffa': 'Tel Aviv',
  tlv: 'Tel Aviv',
  // Africa and Oceania
  joburg: 'Johannesburg',
  jhb: 'Johannesburg',
  kaapstad: 'Cape Town',
  melb: 'Melbourne',
}

/** Exact raw spellings in scripts that the ASCII normaliser would erase. */
const RAW_CITY_ALIASES: Record<string, string> = {
  北京: 'Beijing',
  北京市: 'Beijing',
  上海: 'Shanghai',
  上海市: 'Shanghai',
  深圳: 'Shenzhen',
  深圳市: 'Shenzhen',
  广州: 'Guangzhou',
  廣州: 'Guangzhou',
  成都: 'Chengdu',
  香港: 'Hong Kong',
  台北: 'Taipei',
  臺北: 'Taipei',
  台北市: 'Taipei',
  東京: 'Tokyo',
  東京都: 'Tokyo',
  东京: 'Tokyo',
  大阪: 'Osaka',
  名古屋: 'Nagoya',
  서울: 'Seoul',
  서울특별시: 'Seoul',
  부산: 'Busan',
  Москва: 'Moscow',
  Київ: 'Kyiv',
  Киев: 'Kyiv',
  Минск: 'Minsk',
  Мінск: 'Minsk',
  القاهرة: 'Cairo',
  دبي: 'Dubai',
  الرياض: 'Riyadh',
  'תל אביב': 'Tel Aviv',
  กรุงเทพ: 'Bangkok',
  กรุงเทพมหานคร: 'Bangkok',
}

const RAW_COUNTRY_ALIASES: Record<string, string> = {
  中国: 'CN',
  中國: 'CN',
  中华人民共和国: 'CN',
  台灣: 'TW',
  台湾: 'TW',
  臺灣: 'TW',
  日本: 'JP',
  한국: 'KR',
  대한민국: 'KR',
  Россия: 'RU',
  'Санкт-Петербург': 'RU',
  Україна: 'UA',
  Беларусь: 'BY',
  Казахстан: 'KZ',
  ประเทศไทย: 'TH',
  भारत: 'IN',
  مصر: 'EG',
  السعودية: 'SA',
  ישראל: 'IL',
  Ελλάδα: 'GR',
}

/**
 * Well-known cities and regions that are not on the globe, mapped to their country so the
 * owner still counts at country level. Ambiguous names (Cambridge, Victoria, Cordoba) are
 * deliberately absent.
 */
const PLACE_TO_COUNTRY: Record<string, string> = {
  // United States
  'palo alto': 'US', 'mountain view': 'US', 'menlo park': 'US', sunnyvale: 'US', cupertino: 'US', 'redwood city': 'US',
  oakland: 'US', berkeley: 'US', 'santa clara': 'US', 'san mateo': 'US', 'san diego': 'US', sacramento: 'US', portland: 'US',
  denver: 'US', boulder: 'US', phoenix: 'US', scottsdale: 'US', tempe: 'US', 'salt lake city': 'US', minneapolis: 'US',
  detroit: 'US', 'ann arbor': 'US', pittsburgh: 'US', columbus: 'US', cleveland: 'US', cincinnati: 'US', indianapolis: 'US',
  nashville: 'US', charlotte: 'US', raleigh: 'US', 'chapel hill': 'US', orlando: 'US', tampa: 'US', 'washington dc': 'US',
  'washington d c': 'US', baltimore: 'US', 'new orleans': 'US', nola: 'US', 'st louis': 'US', 'saint louis': 'US',
  'kansas city': 'US', madison: 'US', milwaukee: 'US', 'san antonio': 'US', irvine: 'US', 'santa monica': 'US', pasadena: 'US',
  'new haven': 'US', providence: 'US', princeton: 'US', ithaca: 'US', rochester: 'US', buffalo: 'US', albany: 'US',
  hartford: 'US', richmond: 'US', jacksonville: 'US', tucson: 'US', albuquerque: 'US', omaha: 'US', 'oklahoma city': 'US',
  tulsa: 'US', memphis: 'US', louisville: 'US', lexington: 'US', honolulu: 'US', anchorage: 'US', pdx: 'US',
  'silicon beach': 'US', 'research triangle': 'US', 'twin cities': 'US', 'new england': 'US', 'pacific northwest': 'US',
  'pnw': 'US', midwest: 'US', 'east coast': 'US', 'west coast': 'US',
  // Canada
  ottawa: 'CA', edmonton: 'CA', winnipeg: 'CA', 'quebec city': 'CA', waterloo: 'CA', kitchener: 'CA', halifax: 'CA',
  mississauga: 'CA', ontario: 'CA', quebec: 'CA', 'british columbia': 'CA', alberta: 'CA', manitoba: 'CA',
  saskatchewan: 'CA', 'nova scotia': 'CA', 'new brunswick': 'CA',
  // Latin America
  campinas: 'BR', 'belo horizonte': 'BR', 'porto alegre': 'BR', curitiba: 'BR', florianopolis: 'BR', recife: 'BR',
  fortaleza: 'BR', manaus: 'BR', goiania: 'BR', 'minas gerais': 'BR', 'rio grande do sul': 'BR', parana: 'BR',
  'santa catarina': 'BR', bahia: 'BR', pernambuco: 'BR', guadalajara: 'MX', monterrey: 'MX', puebla: 'MX', tijuana: 'MX',
  queretaro: 'MX', rosario: 'AR', mendoza: 'AR', medellin: 'CO', cali: 'CO', barranquilla: 'CO', valparaiso: 'CL',
  arequipa: 'PE', cusco: 'PE',
  // United Kingdom and Ireland
  england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', 'great britain': 'GB', britain: 'GB',
  'greater london': 'GB', manchester: 'GB', oxford: 'GB', edinburgh: 'GB', bristol: 'GB', leeds: 'GB', glasgow: 'GB',
  liverpool: 'GB', sheffield: 'GB', nottingham: 'GB', newcastle: 'GB', leicester: 'GB', coventry: 'GB', southampton: 'GB',
  brighton: 'GB', belfast: 'GB', cardiff: 'GB', york: 'GB', bath: 'GB', cork: 'IE', galway: 'IE', limerick: 'IE',
  // Western and Northern Europe
  lyon: 'FR', marseille: 'FR', toulouse: 'FR', bordeaux: 'FR', lille: 'FR', nantes: 'FR', nice: 'FR', strasbourg: 'FR',
  grenoble: 'FR', montpellier: 'FR', rennes: 'FR', munich: 'DE', munchen: 'DE', muenchen: 'DE', hamburg: 'DE',
  cologne: 'DE', koln: 'DE', koeln: 'DE', frankfurt: 'DE', stuttgart: 'DE', dusseldorf: 'DE', duesseldorf: 'DE',
  leipzig: 'DE', dresden: 'DE', hannover: 'DE', nuremberg: 'DE', nurnberg: 'DE', karlsruhe: 'DE', heidelberg: 'DE',
  bonn: 'DE', aachen: 'DE', darmstadt: 'DE', bremen: 'DE', bavaria: 'DE', bayern: 'DE', 'baden wurttemberg': 'DE',
  nrw: 'DE', 'north rhine westphalia': 'DE', hessen: 'DE', saxony: 'DE', sachsen: 'DE', porto: 'PT', braga: 'PT',
  coimbra: 'PT', valencia: 'ES', seville: 'ES', sevilla: 'ES', malaga: 'ES', bilbao: 'ES', zaragoza: 'ES', granada: 'ES',
  alicante: 'ES', murcia: 'ES', valladolid: 'ES', catalonia: 'ES', catalunya: 'ES', andalucia: 'ES', turin: 'IT',
  torino: 'IT', naples: 'IT', napoli: 'IT', florence: 'IT', firenze: 'IT', bologna: 'IT', genoa: 'IT', genova: 'IT',
  venice: 'IT', venezia: 'IT', verona: 'IT', padova: 'IT', padua: 'IT', pisa: 'IT', trento: 'IT', bari: 'IT',
  palermo: 'IT', catania: 'IT', gothenburg: 'SE', goteborg: 'SE', malmo: 'SE', uppsala: 'SE', lund: 'SE',
  linkoping: 'SE', aarhus: 'DK', odense: 'DK', aalborg: 'DK', tampere: 'FI', turku: 'FI', oulu: 'FI', espoo: 'FI',
  trondheim: 'NO', stavanger: 'NO', rotterdam: 'NL', utrecht: 'NL', eindhoven: 'NL', 'the hague': 'NL', 'den haag': 'NL',
  groningen: 'NL', delft: 'NL', leiden: 'NL', holland: 'NL', antwerp: 'BE', antwerpen: 'BE', ghent: 'BE', gent: 'BE',
  leuven: 'BE', liege: 'BE', bruges: 'BE', geneva: 'CH', geneve: 'CH', lausanne: 'CH', basel: 'CH', bern: 'CH',
  lugano: 'CH', winterthur: 'CH', graz: 'AT', linz: 'AT', innsbruck: 'AT',
  // Central and Eastern Europe
  krakow: 'PL', cracow: 'PL', wroclaw: 'PL', gdansk: 'PL', poznan: 'PL', lodz: 'PL', katowice: 'PL', lublin: 'PL',
  szczecin: 'PL', brno: 'CZ', ostrava: 'CZ', kosice: 'SK', debrecen: 'HU', szeged: 'HU', 'cluj napoca': 'RO', cluj: 'RO',
  timisoara: 'RO', iasi: 'RO', brasov: 'RO', plovdiv: 'BG', varna: 'BG', 'novi sad': 'RS', nis: 'RS', split: 'HR',
  rijeka: 'HR', maribor: 'SI', thessaloniki: 'GR', patras: 'GR', heraklion: 'GR', crete: 'GR', izmir: 'TR', antalya: 'TR',
  bursa: 'TR', konya: 'TR', lviv: 'UA', kharkiv: 'UA', odessa: 'UA', odesa: 'UA', dnipro: 'UA', tartu: 'EE', kaunas: 'LT',
  'st petersburg': 'RU', 'saint petersburg': 'RU', 'sankt peterburg': 'RU', petersburg: 'RU', novosibirsk: 'RU',
  kazan: 'RU', 'nizhny novgorod': 'RU', samara: 'RU', krasnodar: 'RU', 'rostov on don': 'RU', perm: 'RU', ufa: 'RU',
  voronezh: 'RU', krasnoyarsk: 'RU', omsk: 'RU', chelyabinsk: 'RU', tomsk: 'RU', siberia: 'RU', gomel: 'BY',
  grodno: 'BY', tbilisi: 'GE', yerevan: 'AM', baku: 'AZ',
  // Middle East and Africa
  haifa: 'IL', jerusalem: 'IL', herzliya: 'IL', sharjah: 'AE', dammam: 'SA', khobar: 'SA', mecca: 'SA', medina: 'SA',
  isfahan: 'IR', shiraz: 'IR', mashhad: 'IR', tabriz: 'IR', erbil: 'IQ', basra: 'IQ', alexandria: 'EG', giza: 'EG',
  marrakech: 'MA', marrakesh: 'MA', fes: 'MA', fez: 'MA', tangier: 'MA', ibadan: 'NG', 'port harcourt': 'NG', kano: 'NG',
  mombasa: 'KE', kisumu: 'KE', durban: 'ZA', stellenbosch: 'ZA', 'port elizabeth': 'ZA', gqeberha: 'ZA', kumasi: 'GH',
  arusha: 'TZ',
  // South Asia
  pune: 'IN', ahmedabad: 'IN', jaipur: 'IN', lucknow: 'IN', kochi: 'IN', cochin: 'IN', chandigarh: 'IN', indore: 'IN',
  bhopal: 'IN', nagpur: 'IN', surat: 'IN', coimbatore: 'IN', thiruvananthapuram: 'IN', trivandrum: 'IN',
  visakhapatnam: 'IN', vizag: 'IN', mysore: 'IN', mysuru: 'IN', kerala: 'IN', maharashtra: 'IN', karnataka: 'IN',
  'tamil nadu': 'IN', tamilnadu: 'IN', gujarat: 'IN', telangana: 'IN', 'andhra pradesh': 'IN', 'west bengal': 'IN',
  rajasthan: 'IN', 'uttar pradesh': 'IN', 'madhya pradesh': 'IN', bihar: 'IN', odisha: 'IN', haryana: 'IN',
  bharat: 'IN', faisalabad: 'PK', rawalpindi: 'PK', peshawar: 'PK', multan: 'PK', quetta: 'PK', chittagong: 'BD',
  sylhet: 'BD', khulna: 'BD', kandy: 'LK', galle: 'LK', pokhara: 'NP',
  // East and Southeast Asia
  hangzhou: 'CN', nanjing: 'CN', wuhan: 'CN', xian: 'CN', 'xi an': 'CN', suzhou: 'CN', tianjin: 'CN', chongqing: 'CN',
  qingdao: 'CN', dalian: 'CN', xiamen: 'CN', changsha: 'CN', zhengzhou: 'CN', jinan: 'CN', hefei: 'CN', fuzhou: 'CN',
  kunming: 'CN', harbin: 'CN', shenyang: 'CN', guangdong: 'CN', zhejiang: 'CN', jiangsu: 'CN', sichuan: 'CN', hubei: 'CN',
  shandong: 'CN', fujian: 'CN', hunan: 'CN', 'mainland china': 'CN', prc: 'CN', zhongguo: 'CN', kyoto: 'JP', fukuoka: 'JP',
  sapporo: 'JP', yokohama: 'JP', kobe: 'JP', sendai: 'JP', kanto: 'JP', kansai: 'JP', nippon: 'JP', nihon: 'JP',
  daegu: 'KR', incheon: 'KR', daejeon: 'KR', gwangju: 'KR', 'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR',
  taichung: 'TW', kaohsiung: 'TW', hsinchu: 'TW', tainan: 'TW', 'republic of china': 'TW', 'taiwan roc': 'TW',
  cebu: 'PH', davao: 'PH', 'quezon city': 'PH', makati: 'PH', taguig: 'PH', pasig: 'PH', bandung: 'ID', yogyakarta: 'ID',
  medan: 'ID', semarang: 'ID', bali: 'ID', denpasar: 'ID', penang: 'MY', 'johor bahru': 'MY', cyberjaya: 'MY',
  'petaling jaya': 'MY', 'chiang mai': 'TH', phuket: 'TH', 'da nang': 'VN', 'hai phong': 'VN', 'can tho': 'VN',
  samarkand: 'UZ',
  // Oceania
  adelaide: 'AU', canberra: 'AU', 'gold coast': 'AU', hobart: 'AU', 'new south wales': 'AU', nsw: 'AU', queensland: 'AU',
  qld: 'AU', vic: 'AU', tas: 'AU', tasmania: 'AU', 'western australia': 'AU', 'south australia': 'AU', aus: 'AU', oz: 'AU',
  straya: 'AU', christchurch: 'NZ', aotearoa: 'NZ', nz: 'NZ',
  // Country spellings, abbreviations and native names not covered by world-countries
  usa: 'US', 'u s a': 'US', 'u s': 'US', us: 'US', 'united states': 'US', america: 'US', 'estados unidos': 'US',
  uk: 'GB', 'u k': 'GB', 'united kingdom': 'GB', deutschland: 'DE', germany: 'DE', 'the netherlands': 'NL',
  nederland: 'NL', 'czech republic': 'CZ', czechia: 'CZ', cesko: 'CZ', russia: 'RU', rossiya: 'RU', vietnam: 'VN',
  'viet nam': 'VN', brasil: 'BR', espana: 'ES', turkiye: 'TR', uae: 'AE', 'u a e': 'AE', emirates: 'AE', ksa: 'SA',
  saudi: 'SA', 'ivory coast': 'CI', italia: 'IT', sverige: 'SE', norge: 'NO', suomi: 'FI', danmark: 'DK', osterreich: 'AT',
  schweiz: 'CH', suisse: 'CH', svizzera: 'CH', belgique: 'BE', belgie: 'BE', polska: 'PL', ukraina: 'UA', ellada: 'GR',
  hellas: 'GR', eire: 'IE', misr: 'EG', rsa: 'ZA', maroc: 'MA', 'north macedonia': 'MK', macedonia: 'MK', bosnia: 'BA',
  burma: 'MM', macau: 'MO', macao: 'MO', 'the gambia': 'GM', 'dr congo': 'CD', drc: 'CD', 'congo kinshasa': 'CD',
  'congo brazzaville': 'CG', swaziland: 'SZ', 'cape verde': 'CV', magyarorszag: 'HU', srbija: 'RS', hrvatska: 'HR',
  slovenija: 'SI', slovensko: 'SK', lietuva: 'LT', eesti: 'EE', 'hong kong': 'HK', 'south africa': 'ZA', 'sri lanka': 'LK',
  'new zealand': 'NZ', 'saudi arabia': 'SA', 'costa rica': 'CR', 'puerto rico': 'PR', 'el salvador': 'SV',
  'dominican republic': 'DO', 'north korea': 'KP', 'united arab emirates': 'AE', 'the philippines': 'PH', philippines: 'PH',
  'the bahamas': 'BS', iran: 'IR', syria: 'SY', laos: 'LA', moldova: 'MD', palestine: 'PS', tanzania: 'TZ', bolivia: 'BO',
  venezuela: 'VE',
}

/** Ambiguous words used only when nothing else matched. */
const WEAK_PLACE_TO_COUNTRY: Record<string, string> = {
  georgia: 'US',
}

const CA_PROVINCE_CODES = new Set(['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB'])

const NON_PLACES = new Set([
  'remote', 'earth', 'planet earth', 'worldwide', 'world', 'global', 'internet', 'the internet', 'online', 'everywhere',
  'nowhere', 'somewhere', 'home', 'localhost', '127 0 0 1', 'the moon', 'moon', 'mars', 'universe', 'the universe',
  'milky way', 'metaverse', 'cyberspace', 'the cloud', 'cloud', 'wfh', 'anywhere', 'unknown', 'n a', 'na', 'null',
  'undefined', 'void', 'space', 'outer space', 'the matrix', 'digital nomad', 'nomad', 'europe', 'asia', 'africa',
  'americas', 'latam', 'latin america', 'north america', 'south america', 'middle east', 'emea', 'apac', 'eu', 'the eu',
  'european union', 'scandinavia', 'nordics', 'balkans', 'oceania',
])

interface Hint {
  cc: string
  strength: 'strong' | 'medium' | 'weak'
}

const CITY_INDEX = new Map<string, City[]>()
for (const city of CITIES) {
  const key = normalizePlace(city.name)
  const list = CITY_INDEX.get(key) ?? []
  list.push(city)
  CITY_INDEX.set(key, list)
}
const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name, c]))

const COUNTRY_PHRASES = new Map<string, string>()
for (const country of ALL_COUNTRIES) {
  for (const phrase of [country.name, country.official, ...country.altSpellings]) {
    const key = normalizePlace(phrase)
    if (key.length >= 3 && !COUNTRY_PHRASES.has(key)) COUNTRY_PHRASES.set(key, country.cc)
  }
}
for (const [name] of Object.entries(US_STATES)) COUNTRY_PHRASES.set(normalizePlace(name), 'US')
for (const name of Object.values(US_STATES)) COUNTRY_PHRASES.set(normalizePlace(name), 'US')
COUNTRY_PHRASES.delete('georgia')
// Cities on the globe that share a name with a country (Singapore, Luxembourg, Monaco...) stay cities.
for (const key of CITY_INDEX.keys()) COUNTRY_PHRASES.delete(key)
for (const [alias, cc] of Object.entries(PLACE_TO_COUNTRY)) COUNTRY_PHRASES.set(alias, cc)

function stripDecorations(key: string): string[] {
  const variants = new Set([key])
  const trimmed = key
    .replace(/^(greater|downtown|metro|central|metropolitan|city of|region of|province of|state of)\s+/, '')
    .replace(/\s+(area|metro area|metropolitan area|region|city|province|prefecture|county|state|district|metro|sar)$/, '')
  if (trimmed) variants.add(trimmed)
  return [...variants]
}

function cityCandidates(rawPart: string, key: string): City[] {
  const raw = RAW_CITY_ALIASES[rawPart.trim()]
  if (raw !== undefined) {
    const city = CITY_BY_NAME.get(raw)
    return city ? [city] : []
  }
  for (const variant of stripDecorations(key)) {
    const alias = CITY_ALIASES[variant]
    if (alias !== undefined) {
      const city = CITY_BY_NAME.get(alias)
      if (city) return [city]
    }
    const direct = CITY_INDEX.get(variant)
    if (direct) return direct
  }
  return []
}

function countryOfPhrase(key: string): string | undefined {
  for (const variant of stripDecorations(key)) {
    const cc = COUNTRY_PHRASES.get(variant)
    if (cc !== undefined) return cc
  }
  return undefined
}

function codeHint(rawPart: string): Hint | undefined {
  const code = rawPart.trim()
  if (!/^[A-Z]{2}$/.test(code)) return undefined
  if (code in US_STATES) return { cc: 'US', strength: 'strong' }
  if (CA_PROVINCE_CODES.has(code)) return { cc: 'CA', strength: 'strong' }
  return countryByCc(code) ? { cc: code, strength: 'strong' } : undefined
}

function flagHints(text: string): Hint[] {
  const hints: Hint[] = []
  for (const match of text.matchAll(/[\u{1F1E6}-\u{1F1FF}]{2}/gu)) {
    // Each regional-indicator symbol is one astral code point (two UTF-16 units).
    const flag = match[0]
    const cc = [flag.codePointAt(0) ?? 0, flag.codePointAt(2) ?? 0].map((cp) => String.fromCharCode(cp - 0x1f1e6 + 65)).join('')
    if (countryByCc(cc)) hints.push({ cc, strength: 'strong' })
  }
  return hints
}

/** Word windows (longest first) so "rio grande do sul" is tried before "rio". */
function* ngrams(key: string): Generator<string> {
  const words = key.split(' ')
  for (let size = Math.min(4, words.length); size >= 1; size--) {
    for (let start = 0; start + size <= words.length; start++) {
      const gram = words.slice(start, start + size).join(' ')
      if (size > 1 || gram.length >= 4) yield gram
    }
  }
}

function pickCity(candidates: City[], hints: Hint[]): City | undefined {
  const strong = hints.filter((h) => h.strength === 'strong').map((h) => h.cc)
  if (strong.length > 0) return candidates.find((c) => strong.includes(c.cc))
  const medium = hints.filter((h) => h.strength === 'medium').map((h) => h.cc)
  const hinted = candidates.find((c) => medium.includes(c.cc))
  if (hinted) return hinted
  return [...candidates].sort((a, b) => b.weight - a.weight)[0]
}

function toGeoCity(city: City): GeoMatch {
  return { kind: 'city', city: { name: city.name, cc: city.cc, lat: city.lat, lng: city.lng }, cc: city.cc }
}

export function geocodeLocation(raw: string): GeoMatch {
  const text = raw.trim()
  if (!text) return NONE
  const rawParts = text
    .replace(/[()[\]]/g, ',')
    .split(/\s*(?:[,;/|•·]|\s[-–—]\s|\n)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const parts = rawParts.map((p) => ({ raw: p, key: normalizePlace(p) })).filter((p) => p.key.length > 0 || p.raw in RAW_CITY_ALIASES || p.raw in RAW_COUNTRY_ALIASES)
  const hints: Hint[] = flagHints(text)
  if (parts.length === 0) {
    const flag = hints[0]
    return flag ? { kind: 'country', cc: flag.cc } : NONE
  }
  if (parts.every((p) => NON_PLACES.has(p.key))) return NONE

  for (const part of parts) {
    const rawCountry = RAW_COUNTRY_ALIASES[part.raw]
    if (rawCountry !== undefined) hints.push({ cc: rawCountry, strength: 'strong' })
    const code = codeHint(part.raw)
    if (code) hints.push(code)
    const phrase = countryOfPhrase(part.key)
    if (phrase !== undefined) {
      // A specific city name (Pune, Palo Alto) is a medium hint; a country/state/province name is strong.
      const isCityLevel = part.key in PLACE_TO_COUNTRY && !COUNTRY_NAMES.has(part.key)
      hints.push({ cc: phrase, strength: isCityLevel ? 'medium' : 'strong' })
    }
    const weak = WEAK_PLACE_TO_COUNTRY[part.key]
    if (weak !== undefined) hints.push({ cc: weak, strength: 'weak' })
  }

  for (const part of parts) {
    const candidates = cityCandidates(part.raw, part.key)
    if (candidates.length === 0) continue
    const city = pickCity(candidates, hints)
    if (city) return toGeoCity(city)
  }
  for (const part of parts) {
    for (const gram of ngrams(part.key)) {
      const candidates = cityCandidates('', gram)
      if (candidates.length === 0) continue
      const city = pickCity(candidates, hints)
      if (city) return toGeoCity(city)
    }
  }

  for (const strength of ['strong', 'medium'] as const) {
    const hint = hints.find((h) => h.strength === strength)
    if (hint) return { kind: 'country', cc: hint.cc }
  }
  for (const part of parts) {
    for (const gram of ngrams(part.key)) {
      const cc = COUNTRY_PHRASES.get(gram)
      if (cc !== undefined) return { kind: 'country', cc }
    }
  }
  const weak = hints.find((h) => h.strength === 'weak')
  return weak ? { kind: 'country', cc: weak.cc } : NONE
}

/** Normalised country/state/province names (as opposed to city-level fallbacks). */
const COUNTRY_NAMES = new Set<string>()
for (const country of ALL_COUNTRIES) {
  for (const phrase of [country.name, country.official, ...country.altSpellings]) COUNTRY_NAMES.add(normalizePlace(phrase))
}
for (const name of Object.values(US_STATES)) COUNTRY_NAMES.add(normalizePlace(name))
for (const key of [
  'usa', 'u s a', 'u s', 'us', 'united states', 'america', 'uk', 'u k', 'united kingdom', 'england', 'scotland', 'wales',
  'northern ireland', 'great britain', 'britain', 'deutschland', 'germany', 'holland', 'the netherlands', 'nederland',
  'czech republic', 'czechia', 'russia', 'vietnam', 'viet nam', 'brasil', 'espana', 'turkiye', 'uae', 'emirates', 'ksa',
  'south korea', 'korea', 'republic of korea', 'republic of china', 'mainland china', 'prc', 'ontario', 'quebec',
  'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'bavaria', 'bayern',
  'catalonia', 'catalunya', 'andalucia', 'kerala', 'maharashtra', 'karnataka', 'tamil nadu', 'gujarat', 'telangana',
  'andhra pradesh', 'west bengal', 'rajasthan', 'uttar pradesh', 'madhya pradesh', 'guangdong', 'zhejiang', 'jiangsu',
  'sichuan', 'new south wales', 'nsw', 'queensland', 'qld', 'vic', 'tasmania', 'western australia', 'south australia',
  'aus', 'nz', 'aotearoa', 'minas gerais', 'rio grande do sul', 'parana', 'santa catarina', 'bahia', 'pernambuco',
  'hong kong', 'south africa', 'saudi arabia', 'costa rica', 'puerto rico', 'philippines', 'the philippines',
]) {
  COUNTRY_NAMES.add(key)
}
