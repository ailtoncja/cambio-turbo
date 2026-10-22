// Câmbio Turbo — busca as cotações (base: dólar americano) e guarda até a próxima atualização da fonte.
// As páginas e o menu pedem com { type: 'rates:get' }; com force: true busca de novo na hora.
const api = globalThis.browser ?? globalThis.chrome;

const RETRY_MS = 15 * 60 * 1000; // depois de uma falha, espera 15 min para tentar de novo
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

// Fontes gratuitas e sem cadastro, na ordem em que são tentadas. Nada da pessoa é enviado: só baixa a tabela.
const SOURCES = [
  {
    name: 'ExchangeRate-API',
    link: 'https://www.exchangerate-api.com',
    urls: ['https://open.er-api.com/v6/latest/USD'],
    read(json) {
      if (json?.result !== 'success' || !json.rates) return null;
      return { values: json.rates, updated: json.time_last_update_unix * 1000, next: json.time_next_update_unix * 1000 };
    },
  },
  {
    name: 'Currency API',
    link: 'https://github.com/fawazahmed0/exchange-api',
    urls: [
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
      'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
    ],
    read(json) {
      if (!json?.usd || !json.date) return null;
      let iso = null;
      try {
        iso = new Set(Intl.supportedValuesOf('currency'));
      } catch {}
      // Essa fonte mistura criptomoedas; ficam só as moedas oficiais.
      const values = {};
      for (const [code, value] of Object.entries(json.usd)) {
        const upper = code.toUpperCase();
        if (/^[A-Z]{3}$/.test(upper) && value > 0 && (!iso || iso.has(upper))) values[upper] = value;
      }
      const updated = Date.parse(`${json.date}T00:00:00Z`);
      return { values, updated, next: updated + 30 * 60 * 60 * 1000 };
    },
  },
];

function isFresh(rates) {
  const now = Date.now();
  return Boolean(rates?.values) && now < (rates.next ?? 0) && now - (rates.fetched ?? 0) < MAX_AGE_MS;
}

async function download() {
  let lastError = new Error('nenhuma fonte respondeu');
  for (const source of SOURCES) {
    for (const url of source.urls) {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = source.read(await response.json());
        if (!data?.values || typeof data.values !== 'object') throw new Error('resposta inesperada');
        // Só códigos de moeda com valor numérico positivo: a resposta vem de fora e não é confiável.
        const values = {};
        for (const [code, value] of Object.entries(data.values)) {
          if (/^[A-Z]{3}$/.test(code) && Number.isFinite(value) && value > 0) values[code] = value;
        }
        data.values = values;
        if (!Number.isFinite(data.updated) || !Number.isFinite(data.next)) throw new Error('resposta inesperada');
        if (!(data.values.BRL > 0) || Object.keys(data.values).length < 30) throw new Error('resposta inesperada');
        data.values.USD = 1;
        return { ...data, fetched: Date.now(), source: source.name, link: source.link };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError;
}

let pending = null;
async function getRates(force = false) {
  const { rates = null, ratesTried = 0 } = await api.storage.local.get(['rates', 'ratesTried']);
  if (!force && isFresh(rates)) return { rates };
  if (!force && rates && Date.now() - ratesTried < RETRY_MS) return { rates };
  pending ??= (async () => {
    await api.storage.local.set({ ratesTried: Date.now() });
    const fresh = await download();
    await api.storage.local.set({ rates: fresh });
    return fresh;
  })().finally(() => {
    pending = null;
  });
  try {
    return { rates: await pending };
  } catch (error) {
    return { rates, error: String(error?.message ?? error) };
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'rates:get' || sender.id !== api.runtime.id) return false;
  getRates(Boolean(message.force)).then(sendResponse, (error) => sendResponse({ rates: null, error: String(error) }));
  return true; // resposta assíncrona
});

// Deixa as cotações prontas quando a extensão é instalada e quando o navegador abre.
api.runtime.onInstalled.addListener(() => {
  getRates().catch(() => {});
});
api.runtime.onStartup.addListener(() => {
  getRates().catch(() => {});
});
