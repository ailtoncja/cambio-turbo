// Câmbio Turbo — menu: conversor rápido, a sua moeda, IOF e o que vale para o site da aba atual.
// Firefox expõe `browser` (com Promises); Chrome expõe `chrome`.
const api = globalThis.browser ?? globalThis.chrome;
const CT = globalThis.CambioTurbo;
const $ = (id) => document.getElementById(id);
const inExtension = Boolean(api?.storage?.local);

const settings = { ...CT.DEFAULTS };
let rates = null;
let site = null; // { host, auto } do site da aba atual; null em páginas onde extensões não entram

// Cotações de exemplo, só para ver o visual abrindo o popup.html fora da extensão.
const DEMO_RATES = {
  values: {
    USD: 1, BRL: 5.0885, EUR: 0.8896, GBP: 0.7612, ARS: 1514.57, JPY: 158, CNY: 7.12, CAD: 1.402, AUD: 1.52,
    CHF: 0.81, MXN: 18.41, CLP: 950.2, UYU: 40.12, PYG: 7300, COP: 3900, PEN: 3.6, KRW: 1380, INR: 88.2,
  },
  updated: Date.now() - 2 * 3600 * 1000,
  source: 'ExchangeRate-API',
  link: 'https://www.exchangerate-api.com',
};

// Preferências só do popup (tema para abrir sem piscar e o conversor), no localStorage dele.
const prefs = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

function save(changes) {
  Object.assign(settings, changes);
  if (inExtension) api.storage.local.set(changes).catch(() => {});
}

// ---------- Listas de moedas ----------
function currencyGroups() {
  const all = Object.keys(rates?.values ?? {}).filter((code) => /^[A-Z]{3}$/.test(code));
  const popular = CT.POPULAR.filter((code) => all.includes(code));
  const rest = all
    .filter((code) => !popular.includes(code))
    .sort((a, b) => CT.currencyName(a).localeCompare(CT.currencyName(b), 'pt-BR'));
  return [['Mais usadas', popular], ['Todas', rest]];
}

function fillCurrencies(select, value) {
  const groups = [];
  let found = false;
  for (const [label, codes] of currencyGroups()) {
    if (!codes.length) continue;
    const group = document.createElement('optgroup');
    group.label = label;
    for (const code of codes) group.append(new Option(`${code} — ${CT.currencyName(code)}`, code));
    groups.push(group);
    found ||= codes.includes(value);
  }
  if (!found) groups.unshift(new Option(`${value} — ${CT.currencyName(value)}`, value));
  select.replaceChildren(...groups);
  select.value = value;
}

// ---------- Conversor ----------
const conv = { amount: '100', from: 'USD', to: 'BRL' };

function bold(text) {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}

function convertNow() {
  const { from, to } = conv;
  conv.amount = $('amount').value;
  prefs.set('converter', JSON.stringify(conv));
  $('from-code').textContent = from;
  $('to-code').textContent = to;
  $('names').textContent = `${CT.currencyName(from)} → ${CT.currencyName(to)}`;
  $('names').title = $('names').textContent;

  const values = rates?.values;
  const amount = CT.parseInput(conv.amount);
  const result = $('result');
  const feeBox = $('conv-fee');
  feeBox.hidden = true;
  result.classList.remove('long');
  if (!values || !Number.isFinite(amount)) {
    result.textContent = '—';
    result.title = '';
    $('rate').textContent = values ? 'Digite um valor.' : 'Sem cotações ainda.';
    return;
  }

  const value = CT.convert(amount, from, to, values);
  const text = CT.formatMoney(value, to);
  result.textContent = text;
  result.title = text;
  result.classList.toggle('long', text.length > 13);
  const percent = Number(settings.feePercent);
  if (settings.feeOn && percent > 0 && from !== to) {
    const name = to === 'BRL' ? 'IOF' : 'taxa';
    feeBox.replaceChildren(`com ${name} de ${CT.formatNumber(percent)}%: `, bold(CT.formatMoney(value * (1 + percent / 100), to)));
    feeBox.hidden = false;
  }
  $('rate').textContent = from === to ? 'Mesma moeda.' : CT.formatRate(from, to, values);
}

$('amount').addEventListener('input', convertNow);
$('from').addEventListener('change', () => {
  conv.from = $('from').value;
  convertNow();
});
$('to').addEventListener('change', () => {
  conv.to = $('to').value;
  convertNow();
});
$('swap').addEventListener('click', () => {
  [conv.from, conv.to] = [conv.to, conv.from];
  fillCurrencies($('from'), conv.from);
  fillCurrencies($('to'), conv.to);
  convertNow();
});

// ---------- Ajustes ----------
function renderSettings() {
  const power = $('power');
  power.setAttribute('aria-pressed', String(settings.enabled));
  power.setAttribute('aria-label', settings.enabled ? 'Conversão ao selecionar ligada' : 'Conversão ao selecionar desligada');
  power.title = settings.enabled ? 'Desligar a conversão ao selecionar' : 'Ligar a conversão ao selecionar';
  $('settings').classList.toggle('off', !settings.enabled);

  fillCurrencies($('target'), settings.target);
  $('target-code').textContent = settings.target;
  $('target-name').textContent = CT.currencyName(settings.target);
  $('fee-on').checked = Boolean(settings.feeOn);
  if (document.activeElement !== $('fee-percent')) $('fee-percent').value = CT.formatNumber(Number(settings.feePercent) || 0);
  renderSite();
}

function renderSite() {
  $('site-box').hidden = !site;
  $('site-note').hidden = Boolean(site) || !inExtension;
  if (!site) return;
  $('site-name').textContent = site.host || 'esta página';
  $('site-name').title = site.host || '';
  $('site-on').checked = !settings.disabledSites.includes(site.host);
  const select = $('site-dollar');
  select.replaceChildren(
    new Option(`Automático (${site.auto?.$ ?? 'USD'})`, 'auto'),
    ...CT.AMBIGUOUS.$.map((code) => new Option(`${code} · ${CT.countryOf(code)}`, code)),
  );
  select.value = settings.siteSymbols?.[site.host]?.$ ?? 'auto';
}

$('target').addEventListener('change', () => {
  save({ target: $('target').value });
  renderSettings();
});

$('fee-on').addEventListener('change', () => {
  save({ feeOn: $('fee-on').checked });
  convertNow();
});

$('fee-percent').addEventListener('input', () => {
  const percent = CT.parseInput($('fee-percent').value);
  if (!Number.isFinite(percent) || percent > 100) return;
  save({ feePercent: percent });
  convertNow();
});
$('fee-percent').addEventListener('change', () => {
  $('fee-percent').value = CT.formatNumber(Number(settings.feePercent) || 0);
});

$('site-on').addEventListener('change', () => {
  const list = settings.disabledSites.filter((host) => host !== site.host);
  if (!$('site-on').checked) list.push(site.host);
  save({ disabledSites: list });
});

$('site-dollar').addEventListener('change', () => {
  const all = { ...settings.siteSymbols };
  const mine = { ...(all[site.host] ?? {}) };
  if ($('site-dollar').value === 'auto') delete mine.$;
  else mine.$ = $('site-dollar').value;
  if (Object.keys(mine).length) all[site.host] = mine;
  else delete all[site.host];
  save({ siteSymbols: all });
});

$('power').addEventListener('click', () => {
  save({ enabled: !settings.enabled });
  renderSettings();
});

// ---------- Tema ----------
// Azul-marinho do Subaru é o padrão; o botão passa por preto e claro.
const THEMES = { dark: 'Azul-marinho', black: 'Preto', light: 'Claro' };
const themeOrder = Object.keys(THEMES);
const nextTheme = (theme) => themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length];

function applyTheme(theme) {
  if (!(theme in THEMES)) return;
  document.documentElement.dataset.theme = theme;
  const label = `Tema: ${THEMES[theme]} (clique para ${THEMES[nextTheme(theme)]})`;
  $('theme').title = label;
  $('theme').setAttribute('aria-label', label);
}

$('theme').addEventListener('click', () => {
  const next = nextTheme(document.documentElement.dataset.theme || 'dark');
  applyTheme(next);
  prefs.set('theme', next);
  save({ theme: next }); // o balão das páginas usa o mesmo tema
});

// ---------- Cotações ----------
function renderFooter(error = '') {
  const box = $('source');
  box.classList.toggle('old', Boolean(error));
  box.title = error ? `Não deu para atualizar agora (${error}).` : '';
  if (!rates?.values) {
    box.replaceChildren(error ? 'Não deu para buscar as cotações. Confira a internet.' : 'Buscando cotações…');
    return;
  }
  const link = document.createElement('a');
  link.href = rates.link;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = rates.source;
  box.replaceChildren(`Cotação de ${CT.formatWhen(rates.updated)} · `, link);
  if (Date.now() - rates.updated > 3 * 24 * 3600 * 1000) {
    box.classList.add('old');
    box.title ||= 'Cotação antiga: a extensão não conseguiu atualizar.';
  }
}

function renderAll(error) {
  fillCurrencies($('from'), conv.from);
  fillCurrencies($('to'), conv.to);
  renderSettings();
  convertNow();
  renderFooter(error);
}

async function refresh(force) {
  if (!inExtension) return;
  const button = $('refresh');
  button.classList.add('spinning');
  button.disabled = true;
  let error = '';
  try {
    const answer = await api.runtime.sendMessage({ type: 'rates:get', force });
    if (answer?.rates?.values) rates = answer.rates;
    error = answer?.error ?? '';
  } catch (e) {
    error = String(e?.message ?? e);
  }
  button.classList.remove('spinning');
  button.disabled = false;
  renderAll(error);
}

$('refresh').addEventListener('click', () => refresh(true));

// ---------- Permissão de acesso aos sites (Firefox) ----------
const siteOrigins = () => api?.runtime?.getManifest?.().host_permissions ?? [];

async function checkSiteAccess() {
  const origins = siteOrigins();
  if (!origins.length || !api.permissions?.contains) return;
  $('access').hidden = await api.permissions.contains({ origins });
}

// O Firefox só aceita o pedido de permissão direto no clique (sem await antes).
$('grant').addEventListener('click', () => {
  api.permissions.request({ origins: siteOrigins() }).then(checkSiteAccess, checkSiteAccess);
});

// ---------- Início ----------
async function loadSite() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    site = (await api.tabs.sendMessage(tab.id, { type: 'site:info' }, { frameId: 0 })) ?? null;
  } catch {
    site = null; // páginas do navegador e lojas de extensões não deixam extensões entrarem
  }
  renderSite();
}

(async () => {
  applyTheme(prefs.get('theme') || 'dark');
  let saved = null;
  try {
    saved = JSON.parse(prefs.get('converter') || 'null');
  } catch {}

  if (!inExtension) {
    // Aberto fora da extensão: só para ver o visual.
    rates = DEMO_RATES;
    site = { host: 'exemplo.com', auto: { $: 'USD' } };
    Object.assign(conv, saved ?? {});
    $('amount').value = conv.amount;
    renderAll();
    return;
  }

  const data = await api.storage.local.get(null);
  for (const key of Object.keys(CT.DEFAULTS)) if (data[key] !== undefined) settings[key] = data[key];
  rates = data.rates ?? null;
  applyTheme(settings.theme);
  prefs.set('theme', settings.theme);

  if (saved) Object.assign(conv, saved);
  else conv.to = settings.target;
  if (conv.from === conv.to) conv.from = conv.to === 'USD' ? 'EUR' : 'USD';
  $('amount').value = conv.amount;
  renderAll();

  if (!CT.isFresh(rates)) refresh(false);
  loadSite();
  checkSiteAccess().catch(() => {});
})();
