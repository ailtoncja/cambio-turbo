// Câmbio Turbo — acha valores em dinheiro num texto, converte e formata (sempre no jeito brasileiro).
// Usado pelo script das páginas (content.js) e pelo menu (popup.js).
(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true, // converter ao selecionar
    target: 'BRL', // a sua moeda
    feeOn: false, // mostrar também o valor com IOF/taxa do cartão
    feePercent: 3.5,
    disabledSites: [], // sites onde a conversão fica desligada
    siteSymbols: {}, // { 'site.com': { $: 'CAD' } } — o que o "$" quer dizer em cada site
    theme: 'dark',
  };

  // Moedas que aparecem primeiro nas listas.
  const POPULAR = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'MXN', 'CLP', 'UYU', 'PYG', 'COP', 'PEN', 'KRW', 'INR'];

  // Símbolos que servem para mais de uma moeda. A primeira é o padrão quando o site não dá pista.
  const AMBIGUOUS = {
    $: ['USD', 'CAD', 'AUD', 'NZD', 'MXN', 'ARS', 'CLP', 'COP', 'UYU', 'HKD', 'SGD', 'TWD'],
    '¥': ['JPY', 'CNY'],
    kr: ['SEK', 'NOK', 'DKK', 'ISK'],
    peso: ['ARS', 'MXN', 'CLP', 'COP', 'UYU'],
  };

  // [como aparece, moeda (ou grupo ambíguo), onde fica: antes do número, depois ou nos dois]
  const SYMBOLS = [
    ['US$', 'USD', 'both'], ['U$S', 'USD', 'both'], ['U$', 'USD', 'both'], ['USD$', 'USD', 'pre'],
    ['R$', 'BRL', 'both'], ['AR$', 'ARS', 'both'], ['$U', 'UYU', 'pre'], ['UY$', 'UYU', 'pre'],
    ['CLP$', 'CLP', 'pre'], ['COL$', 'COP', 'pre'], ['COP$', 'COP', 'pre'], ['MX$', 'MXN', 'both'], ['Mex$', 'MXN', 'pre'],
    ['CA$', 'CAD', 'both'], ['CAN$', 'CAD', 'both'], ['C$', 'CAD', 'both'], ['AU$', 'AUD', 'both'], ['A$', 'AUD', 'both'],
    ['NZ$', 'NZD', 'both'], ['HK$', 'HKD', 'both'], ['S$', 'SGD', 'both'], ['NT$', 'TWD', 'both'], ['RD$', 'DOP', 'pre'],
    ['$', '$', 'both'],
    ['€', 'EUR', 'both'], ['£', 'GBP', 'both'],
    ['JP¥', 'JPY', 'both'], ['CN¥', 'CNY', 'both'], ['¥', '¥', 'both'], ['￥', '¥', 'both'],
    ['円', 'JPY', 'post'], ['元', 'CNY', 'post'], ['RMB', 'CNY', 'both'], ['원', 'KRW', 'post'],
    ['₹', 'INR', 'both'], ['₩', 'KRW', 'both'], ['₽', 'RUB', 'both'], ['₺', 'TRY', 'both'], ['₴', 'UAH', 'both'],
    ['₪', 'ILS', 'both'], ['₱', 'PHP', 'both'], ['฿', 'THB', 'both'], ['₫', 'VND', 'both'], ['₦', 'NGN', 'both'],
    ['₲', 'PYG', 'both'], ['Gs.', 'PYG', 'pre'], ['Gs', 'PYG', 'both'],
    ['zł', 'PLN', 'post'], ['Kč', 'CZK', 'post'], ['Ft', 'HUF', 'post'], ['lei', 'RON', 'post'], ['лв', 'BGN', 'post'],
    ['TL', 'TRY', 'post'], ['RM', 'MYR', 'pre'], ['Rp', 'IDR', 'pre'], ['S/.', 'PEN', 'pre'], ['S/', 'PEN', 'pre'],
    ['Fr.', 'CHF', 'both'], ['kr.', 'kr', 'both'], ['kr', 'kr', 'both'], ['Kr', 'kr', 'both'],
  ];

  // Moeda escrita por extenso depois do número ("20 dólares", "1,5 milhão de euros").
  const WORDS = {
    'dólares canadenses': 'CAD', 'dólares canadienses': 'CAD', 'canadian dollars': 'CAD',
    'dólares australianos': 'AUD', 'australian dollars': 'AUD',
    dólares: 'USD', dolares: 'USD', dólar: 'USD', dolar: 'USD', dollars: 'USD', dollar: 'USD',
    euros: 'EUR', euro: 'EUR',
    'libras esterlinas': 'GBP', 'libra esterlina': 'GBP', libras: 'GBP', libra: 'GBP', 'pounds sterling': 'GBP',
    ienes: 'JPY', iene: 'JPY', yenes: 'JPY', yen: 'JPY',
    yuans: 'CNY', yuanes: 'CNY', iuanes: 'CNY', yuan: 'CNY', renminbi: 'CNY',
    reais: 'BRL',
    'pesos argentinos': 'ARS', 'pesos mexicanos': 'MXN', 'pesos chilenos': 'CLP', 'pesos colombianos': 'COP',
    'pesos uruguaios': 'UYU', 'pesos uruguayos': 'UYU', pesos: 'peso',
    'francos suíços': 'CHF', 'francos suizos': 'CHF', 'swiss francs': 'CHF',
    rublos: 'RUB', rubles: 'RUB', rupias: 'INR', rupees: 'INR',
    guaranis: 'PYG', guaraníes: 'PYG', soles: 'PEN', bolivianos: 'BOB',
  };

  // "US$ 2 mi", "€ 1,5 bilhão", "$4K"
  const MULTIPLIERS = {
    k: 1e3, K: 1e3, mil: 1e3,
    M: 1e6, mi: 1e6, mn: 1e6, mln: 1e6, milhão: 1e6, milhões: 1e6, millón: 1e6, millones: 1e6, million: 1e6, millions: 1e6,
    B: 1e9, bi: 1e9, bn: 1e9, bilhão: 1e9, bilhões: 1e9, billion: 1e9, billions: 1e9,
    tri: 1e12, trilhão: 1e12, trilhões: 1e12, trillion: 1e12, trillions: 1e12,
  };

  // Códigos de moeda que também são palavras ou marcas comuns em maiúsculas ("ALL", "TOP", "AMD").
  const NOT_CODES = new Set(['ALL', 'TOP', 'CUP', 'SOS', 'MOP', 'BOB', 'GEL', 'MAD', 'AMD', 'XXX', 'XTS']);

  const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const alternation = (list) => [...list].sort((a, b) => b.length - a.length).map(escapeRe).join('|');

  const symbolMap = new Map(SYMBOLS.map(([text, cur]) => [text, cur]));
  // Símbolo com letra na ponta não pode estar no meio de uma palavra ("FORM 10" não é ringgit, "5 kraft" não é coroa).
  // Símbolo de verdade ($, €, ¥…) vale mesmo grudado num texto ("Pro$8"), menos depois de maiúscula, para "ProR$ 8"
  // não virar dólar; e no fim do número não pode vir colado em outro número ("Top 10 $20").
  const LETTERY = /[\p{Script=Latin}\p{Script=Cyrillic}.]/u;
  const preSymbols = SYMBOLS.filter((s) => s[2] !== 'post').map((s) => s[0]);
  const postSymbols = SYMBOLS.filter((s) => s[2] !== 'pre').map((s) => s[0]);
  const PRE_RE = new RegExp(
    `(?:(?:^|[^\\p{L}\\p{N}])(${alternation(preSymbols.filter((s) => LETTERY.test(s[0])))}|[A-Z]{3})` +
      `|(?<![A-Z])(${alternation(preSymbols.filter((s) => !LETTERY.test(s[0])))}))\\s{0,2}$`,
    'u',
  );
  const POST_RE = new RegExp(
    `^\\s{0,2}(?:(${alternation(postSymbols.filter((s) => LETTERY.test(s.at(-1))))}|[A-Z]{3})(?![\\p{L}\\p{N}])` +
      `|(${alternation(postSymbols.filter((s) => !LETTERY.test(s.at(-1))))})(?!\\p{N}))`,
    'u',
  );
  const WORD_RE = new RegExp(`^\\s{0,2}(?:de\\s+)?(${alternation(Object.keys(WORDS))})(?![\\p{L}\\p{N}])`, 'iu');
  const MULT_RE = new RegExp(`^ ?(${alternation(Object.keys(MULTIPLIERS))})(?![\\p{L}\\p{N}])`, 'u');

  // Dígitos com separadores entre eles: "1.234,56", "1,234.56", "1 234,56", "1'234.50".
  const NUM_RE = /\d+(?:[.,'’]\d+| \d{3}(?!\d))*/g;
  // Faixas: "US$ 10–20", "10 a 20 euros".
  const RANGE_RE = /^\s*(?:[-–—~]|a|até|to)\s*$/i;

  let isoCodes = null;
  function isCode(code) {
    if (NOT_CODES.has(code)) return false;
    try {
      isoCodes ??= new Set(Intl.supportedValuesOf('currency'));
    } catch {
      isoCodes = new Set();
    }
    return isoCodes.size === 0 || isoCodes.has(code);
  }

  function markerFrom(text) {
    const known = symbolMap.get(text);
    if (known) return known in AMBIGUOUS ? { group: known } : { cur: known };
    if (/^[A-Z]{3}$/.test(text) && isCode(text)) return { cur: text };
    return null;
  }

  function markerBefore(text) {
    const m = PRE_RE.exec(text);
    return m ? markerFrom(m[1] ?? m[2]) : null;
  }

  function markerAfter(text) {
    const m = POST_RE.exec(text);
    const marker = m && markerFrom(m[1] ?? m[2]);
    if (marker) return marker;
    const w = WORD_RE.exec(text);
    if (!w) return null;
    const cur = WORDS[w[1].toLowerCase()];
    return cur === 'peso' ? { group: 'peso' } : cur ? { cur } : null;
  }

  // Um símbolo exato ("US$", "USD") vale mais que um ambíguo ("$") do outro lado do número.
  function pick(pre, post) {
    if (pre && post && pre.group && !post.group) return post;
    return pre || post;
  }

  function resolve(group, site) {
    if (group === 'peso') return AMBIGUOUS.peso.includes(site.$) ? site.$ : 'ARS';
    return site[group] || AMBIGUOUS[group][0];
  }

  const round = (n) => Number(n.toPrecision(12));

  // "1.234,56" → { value: 1234.56, decimals: 2 }. Um separador sozinho seguido de 3 dígitos é de milhar
  // ("R$ 1.299", "$1,299"), menos quando a parte inteira é zero ("0,500").
  function parseParts(raw) {
    const s = String(raw).replace(/[\s'’]/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return { value: NaN, decimals: 0 };
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let decimal = '';
    if (lastDot >= 0 && lastComma >= 0) {
      decimal = lastDot > lastComma ? '.' : ',';
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? '.' : ',';
      const first = s.indexOf(sep);
      const single = first === s.lastIndexOf(sep);
      if (single && (s.length - first - 1 !== 3 || /^0+$/.test(s.slice(0, first)))) decimal = sep;
    }
    if (decimal && s.indexOf(decimal) !== s.lastIndexOf(decimal)) return { value: NaN, decimals: 0 };
    if (!decimal) return { value: Number(s.replace(/[.,]/g, '')), decimals: 0 };
    const at = s.lastIndexOf(decimal);
    return { value: Number(`${s.slice(0, at).replace(/[.,]/g, '')}.${s.slice(at + 1)}`), decimals: s.length - at - 1 };
  }

  const parseNumber = (raw) => parseParts(raw).value;

  // Acha os valores em dinheiro de um texto.
  // site: o que os símbolos ambíguos querem dizer aqui, ex.: { $: 'USD', '¥': 'JPY', kr: 'SEK' }.
  // Devolve [{ amount, decimals (casas como na página), currency, symbol (grupo ambíguo ou null), numStart, numEnd }].
  function findMoney(input, site = {}) {
    // Espaços especiais (sem quebra, finos) viram espaço comum; o texto mantém o mesmo tamanho.
    const text = String(input).replace(/[  -​  　]/g, ' ');
    const nums = [];
    for (const m of text.matchAll(NUM_RE)) {
      let raw = m[0];
      let start = m.index;
      const pre = markerBefore(text.slice(Math.max(0, start - 12), start));
      // Milhar com espaço tem até 3 dígitos no primeiro grupo: "2024 100" são dois números.
      if (raw.includes(' ') && raw.indexOf(' ') > 3) {
        if (pre) {
          raw = raw.slice(0, raw.indexOf(' '));
        } else {
          const cut = raw.lastIndexOf(' ') + 1;
          start += cut;
          raw = raw.slice(cut);
        }
      }
      const end = start + raw.length;
      let rest = text.slice(end, end + 48);
      let mult = 1;
      let tail = 0;
      const mm = MULT_RE.exec(rest);
      if (mm) {
        mult = MULTIPLIERS[mm[1]];
        tail = mm[0].length;
        rest = rest.slice(tail);
      }
      nums.push({ raw, start, end, tail, mult, marker: pick(pre, markerAfter(rest)) });
    }

    // Número sem símbolo numa faixa herda o símbolo do vizinho.
    nums.forEach((n, i) => {
      if (n.marker) return;
      const prev = nums[i - 1];
      const next = nums[i + 1];
      if (prev?.marker && RANGE_RE.test(text.slice(prev.end + prev.tail, n.start))) {
        n.marker = prev.marker;
      } else if (next?.marker && RANGE_RE.test(text.slice(n.end + n.tail, next.start))) {
        n.marker = next.marker;
        if (n.mult === 1) n.mult = next.mult; // "10 a 20 mil dólares"
      }
    });

    const found = [];
    for (const n of nums) {
      if (!n.marker) continue;
      const currency = n.marker.cur ?? resolve(n.marker.group, site);
      const { value, decimals } = parseParts(n.raw);
      const amount = round(value * n.mult);
      if (!currency || !(amount >= 0)) continue; // "$0" (plano grátis) também mostra o balão
      found.push({
        amount,
        decimals: n.mult === 1 ? decimals : 0,
        currency,
        symbol: n.marker.group ?? null,
        numStart: n.start,
        numEnd: n.end + n.tail,
      });
    }
    return found;
  }

  // Número digitado no conversor do menu ("1.234,56", "1,5 mil", "2k").
  function parseInput(text) {
    const s = String(text).replace(/[  ]/g, ' ').trim();
    const m = /\d+(?:[.,'’]\d+| \d{3}(?!\d))*/.exec(s);
    if (!m) return NaN;
    let value = parseNumber(m[0]);
    const mm = MULT_RE.exec(s.slice(m.index + m[0].length));
    if (mm) value *= MULTIPLIERS[mm[1]];
    return round(value);
  }

  // O que "$", "¥" e "kr" querem dizer num site, pelo endereço (.ca, .com.ar…) e pelo idioma da página.
  const TLD_DOLLAR = { ca: 'CAD', au: 'AUD', nz: 'NZD', mx: 'MXN', ar: 'ARS', cl: 'CLP', uy: 'UYU', hk: 'HKD', sg: 'SGD', tw: 'TWD' };
  const REGION_DOLLAR = { CA: 'CAD', AU: 'AUD', NZ: 'NZD', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', UY: 'UYU', HK: 'HKD', SG: 'SGD', TW: 'TWD' };
  const TLD_KR = { se: 'SEK', no: 'NOK', dk: 'DKK', is: 'ISK', fo: 'DKK', gl: 'DKK' };
  const LANG_KR = { sv: 'SEK', nb: 'NOK', nn: 'NOK', no: 'NOK', da: 'DKK', is: 'ISK' };

  function siteDefaults(hostname = '', lang = '') {
    const labels = String(hostname).toLowerCase().split('.');
    const tld = labels.at(-1);
    let region = '';
    let language = '';
    try {
      const locale = new Intl.Locale(String(lang).replace('_', '-'));
      region = locale.region || '';
      language = locale.language || '';
    } catch {}
    let dollar = TLD_DOLLAR[tld];
    // .co sozinho é usado por empresas do mundo todo; só .com.co, .gov.co… são da Colômbia.
    if (!dollar && tld === 'co' && ['com', 'gov', 'org', 'net', 'edu'].includes(labels.at(-2))) dollar = 'COP';
    return {
      $: dollar || REGION_DOLLAR[region] || 'USD',
      '¥': tld === 'cn' || language === 'zh' ? 'CNY' : 'JPY',
      kr: TLD_KR[tld] || LANG_KR[language] || 'SEK',
    };
  }

  // ---------- Conversão e formatação ----------
  function convert(amount, from, to, values) {
    const a = values?.[from];
    const b = values?.[to];
    return a > 0 && b > 0 ? (amount / a) * b : NaN;
  }

  const formatters = new Map();
  function numberFormat(options) {
    const key = JSON.stringify(options);
    let format = formatters.get(key);
    if (!format) {
      format = new Intl.NumberFormat('pt-BR', options);
      formatters.set(key, format);
    }
    return format;
  }

  function digitsOf(code) {
    try {
      return numberFormat({ style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
    } catch {
      return 2;
    }
  }

  // Valor convertido: "R$ 274,15". Valores que viram zero ganham casas ("R$ 0,0042").
  function formatMoney(value, code) {
    const options = { style: 'currency', currency: code };
    const abs = Math.abs(value);
    if (abs > 0 && abs < 10 ** -digitsOf(code)) options.maximumSignificantDigits = 2;
    try {
      return numberFormat(options).format(value);
    } catch {
      return `${code} ${value.toFixed(2)}`;
    }
  }

  // Valor achado na página, com as casas que ele tinha ("US$ 1.299", "US$ 1.299,00", "US$ 0,125").
  function formatAmount(amount, code, decimals) {
    const own = decimals ?? (String(amount).split('.')[1] ?? '').length;
    const shown = own ? Math.min(Math.max(own, digitsOf(code)), 4) : 0;
    const options = { style: 'currency', currency: code, minimumFractionDigits: shown, maximumFractionDigits: shown };
    try {
      return numberFormat(options).format(amount);
    } catch {
      return `${code} ${amount}`;
    }
  }

  // "1 USD = R$ 5,0885"
  function formatRate(from, to, values) {
    const rate = convert(1, from, to, values);
    if (!Number.isFinite(rate)) return '';
    const options = { style: 'currency', currency: to };
    if (rate >= 1) Object.assign(options, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    else options.maximumSignificantDigits = 4;
    return `1 ${from} = ${numberFormat(options).format(rate)}`;
  }

  const formatNumber = (value, digits = 2) => numberFormat({ maximumFractionDigits: digits }).format(value);

  // "17/10 às 21:02"
  function formatWhen(ms) {
    if (!ms) return '';
    const date = new Date(ms);
    const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${day} às ${time}`;
  }

  let currencyNames;
  let regionNames;
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  // "Dólar americano", "Real brasileiro"…
  function currencyName(code) {
    try {
      currencyNames ??= new Intl.DisplayNames(['pt-BR'], { type: 'currency' });
      return capitalize(currencyNames.of(code) || code);
    } catch {
      return code;
    }
  }

  // País de uma moeda de dólar: "CAD" → "Canadá".
  function countryOf(code) {
    try {
      regionNames ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' });
      return regionNames.of(code.slice(0, 2)) || code;
    } catch {
      return code;
    }
  }

  // As cotações valem até a próxima atualização da fonte (no máximo 36 h).
  function isFresh(rates) {
    const now = Date.now();
    return Boolean(rates?.values) && now < (rates.next ?? 0) && now - (rates.fetched ?? 0) < 36 * 3600 * 1000;
  }

  globalThis.CambioTurbo = {
    DEFAULTS,
    POPULAR,
    AMBIGUOUS,
    findMoney,
    parseNumber,
    parseInput,
    siteDefaults,
    convert,
    formatMoney,
    formatAmount,
    formatRate,
    formatNumber,
    formatWhen,
    currencyName,
    countryOf,
    isFresh,
  };
})();
