// Câmbio Turbo — ao selecionar um preço na página, mostra num balão quanto ele vale na sua moeda.
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const CT = globalThis.CambioTurbo;
  if (!api?.runtime?.id || !CT) return;

  const MAX_SELECTION = 200; // seleções maiores (parágrafos inteiros) não são um preço
  const MAX_ITEMS = 5;
  const CONTEXT = 24; // letras olhadas antes e depois da seleção (o "$" fora de um duplo clique no número)
  const host = location.hostname.replace(/^www\./, '');

  const settings = { ...CT.DEFAULTS };
  let rates = null;
  const loaded = api.storage.local.get(null).then(
    (data) => {
      for (const key of Object.keys(CT.DEFAULTS)) if (data[key] !== undefined) settings[key] = data[key];
      rates = data.rates ?? null;
    },
    () => {},
  );

  const enabledHere = () => settings.enabled && !settings.disabledSites?.includes(host);

  // O que "$", "¥" e "kr" querem dizer neste site: automático, ou o que a pessoa escolheu no balão/menu.
  function siteSymbols() {
    const auto = CT.siteDefaults(location.hostname, document.documentElement.lang || '');
    return { ...auto, ...(settings.siteSymbols?.[host] ?? {}) };
  }

  // ---------- Seleção ----------
  // Cada leitura devolve { text, from, to, rect }: o texto com um pouco de contexto em volta e onde a seleção está nele.
  function inputSelection() {
    const el = document.activeElement;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return null;
    try {
      const { selectionStart: a, selectionEnd: b, value } = el;
      if (a == null || b == null || b <= a || b - a > MAX_SELECTION) return null;
      const start = Math.max(0, a - CONTEXT);
      return { text: value.slice(start, b + CONTEXT), from: a - start, to: b - start, rect: () => el.getBoundingClientRect() };
    } catch {
      return null; // campos sem seleção de texto (number, email…)
    }
  }

  const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);

  // Entre textos de elementos diferentes: o título "Pro" e o preço "$8" viram "Pro $8" (não "Pro$8"), e células
  // de tabela não se misturam. Número dividido em pedaços ("$" + "89" + ".99") continua junto.
  function gap(prev, node, last, first) {
    if (!prev || !last || !first || /\s/.test(last) || /\s/.test(first)) return '';
    if (prev.parentElement === node.parentElement) return '';
    if (prev.parentElement?.closest('td, th') !== node.parentElement?.closest('td, th')) return ' ';
    return /\p{L}/u.test(last) || /\p{L}/u.test(first) ? ' ' : '';
  }

  // A seleção com o texto em volta dela, dentro do mesmo pedacinho da página (o "$" fora de um duplo clique no número).
  function readAround(range) {
    let box = range.commonAncestorContainer;
    if (box.nodeType !== Node.ELEMENT_NODE) box = box.parentElement;
    if (!box) return null;
    for (let i = 0; i < 3 && box.parentElement && box.textContent.length < 48; i++) box = box.parentElement;
    if (box.textContent.length > 20000) return null;
    let text = '';
    let from = -1;
    let to = -1;
    let prev = null;
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const data = node.data;
      const parent = node.parentElement;
      if (!data || !parent || SKIP_TEXT.has(parent.tagName)) continue;
      // Parte selecionada deste texto: [s, e)
      let s = 0;
      let e = 0;
      if (range.intersectsNode(node)) {
        s = node === range.startContainer ? range.startOffset : 0;
        e = node === range.endContainer ? range.endOffset : data.length;
      }
      text += gap(prev, node, text.at(-1), data[0]);
      if (s < e) {
        if (from < 0) from = text.length + s;
        to = text.length + e;
      }
      text += data;
      prev = node;
    }
    if (from < 0) return null;
    const start = Math.max(0, from - CONTEXT);
    return { text: text.slice(start, to + CONTEXT), from: from - start, to: to - start };
  }

  function lastRect(range) {
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    return rects.at(-1) ?? range.getBoundingClientRect();
  }

  function pageSelection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const visible = sel.toString();
    if (!visible.trim() || visible.length > MAX_SELECTION) return null;
    const range = sel.getRangeAt(0).cloneRange();
    let read = null;
    try {
      read = readAround(range);
    } catch {}
    return { ...(read ?? { text: visible, from: 0, to: visible.length }), rect: () => lastRect(range) };
  }

  const readSelection = () => inputSelection() ?? pageSelection();

  // ---------- Valores achados ----------
  let state = null; // { text, from, to, rect } da seleção mostrada no balão

  // Valores dentro da seleção (o símbolo pode estar logo fora dela), sem repetir e fora a sua moeda.
  function itemsOf(current) {
    const seen = new Set();
    const items = [];
    for (const m of CT.findMoney(current.text, siteSymbols())) {
      if (m.numStart >= current.to || m.numEnd <= current.from || m.currency === settings.target) continue;
      if (rates?.values && !rates.values[m.currency]) continue;
      const key = `${m.currency}:${m.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(m);
      if (items.length === MAX_ITEMS) break;
    }
    return items;
  }

  let checkId = 0;
  async function check() {
    if (!alive()) return;
    await loaded;
    const id = ++checkId;
    if (!enabledHere()) return hide();
    const sel = readSelection();
    if (!sel) return hide();
    const next = { text: sel.text, from: sel.from, to: sel.to, rect: sel.rect };
    if (!itemsOf(next).length) return hide();
    if (!CT.isFresh(rates)) {
      try {
        const answer = await api.runtime.sendMessage({ type: 'rates:get' });
        if (answer?.rates?.values) rates = answer.rates;
      } catch {}
      if (id !== checkId) return; // outra seleção começou enquanto esperava
    }
    state = next;
    render();
  }

  // ---------- Balão ----------
  const CSS = `
    :host { all: initial; }
    .tip {
      --bg: #0c1430; --surface: #13204a; --text: #ececf3; --muted: #93a3cf; --border: #22346e;
      --value: #ffd200; --gold: #d9b44a; --accent: #3a78f2;
      position: fixed; top: 0; left: 0; box-sizing: border-box;
      min-width: 190px; max-width: min(360px, calc(100vw - 16px));
      margin: 0; padding: 11px 12px 8px;
      border: 1px solid var(--border); border-radius: 12px;
      background: var(--bg); color: var(--text);
      box-shadow: 0 12px 32px rgb(0 0 0 / 0.45);
      font: 13px/1.35 "Segoe UI", system-ui, -apple-system, sans-serif;
      text-align: left; color-scheme: dark; overflow: hidden;
      letter-spacing: normal; word-spacing: normal; text-transform: none; text-indent: 0; text-shadow: none;
      white-space: normal; direction: ltr; visibility: visible;
      animation: ct-pop 0.14s ease-out;
    }
    .tip[data-theme="black"] {
      --bg: #000000; --surface: #141414; --text: #f0f0f0; --muted: #9b9b9b; --border: #2a2a2a;
      box-shadow: 0 12px 32px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.05);
    }
    .tip[data-theme="light"] {
      --bg: #f6f8fd; --surface: #e7edfa; --text: #0f1b3d; --muted: #55658f; --border: #cfd9f0;
      --value: #1e56d6; --accent: #1e56d6;
      box-shadow: 0 12px 32px rgb(15 27 61 / 0.2); color-scheme: light;
    }
    /* Faixa azul e dourada do Subaru */
    .tip::before {
      content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, #1e56d6, #3a78f2 55%, #ffd200 82%, #d9b44a);
    }
    .from { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
    .from svg { flex: none; width: 15px; height: 15px; color: var(--gold); }
    .amount { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .chip {
      -webkit-appearance: none; appearance: none; margin: 0; padding: 1px 17px 1px 6px;
      border: 1px solid var(--border); border-radius: 6px;
      background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%2393a3cf' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 4px center / 9px;
      color: var(--text); font: 600 11px/1.4 "Segoe UI", system-ui, sans-serif; cursor: pointer;
    }
    .chip:hover { border-color: var(--accent); }
    .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .value {
      display: block; margin: 3px 0 0; padding: 0; border: 0; background: none;
      color: var(--value); font: inherit; font-weight: 700; font-variant-numeric: tabular-nums;
      text-align: left; white-space: nowrap; cursor: copy;
    }
    .value.big { font-size: 24px; line-height: 1.15; }
    .value:hover { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .value:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
    .value.copied { color: var(--text); text-decoration: none; }
    .fee { margin-top: 2px; color: var(--muted); font-size: 12px; }
    .fee b { color: var(--text); font-weight: 600; }
    small.fee { display: block; margin: 0; font-size: 11px; }
    .rows { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: 5px 8px; margin-top: 7px; }
    .rows .amount { display: flex; align-items: center; gap: 4px; font-weight: 500; }
    .rows .value { margin: 0; font-size: 15px; }
    .arrow { color: var(--muted); }
    .meta {
      margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--border);
      color: var(--muted); font-size: 11px; white-space: nowrap;
    }
    .error { max-width: 250px; margin: 6px 0 2px; color: var(--text); font-size: 12.5px; }
    .clip { position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    @keyframes ct-pop { from { opacity: 0; transform: translateY(4px); } }
    @media (prefers-reduced-motion: reduce) { .tip { animation: none; } }
  `;

  let hostEl = null;
  let wrap = null;
  let card = null;
  let pressedInside = false;

  function addStyle(root) {
    // Folha construída não esbarra no CSP da página; se o navegador não deixar, vai um <style>.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
      if (root.adoptedStyleSheets.length === 1) return;
    } catch {}
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
  }

  function mount() {
    if (!hostEl) {
      hostEl = document.createElement('cambio-turbo');
      // Só o necessário para o balão ficar por cima de tudo sem mexer no layout da página.
      const fixed = {
        display: 'block', position: 'fixed', top: '0', left: '0', width: '0', height: '0', margin: '0', padding: '0',
        border: '0', 'z-index': '2147483647', opacity: '1', visibility: 'visible', transform: 'none', filter: 'none',
        'pointer-events': 'auto', overflow: 'visible', contain: 'none', 'clip-path': 'none',
      };
      for (const [prop, value] of Object.entries(fixed)) hostEl.style.setProperty(prop, value, 'important');
      const root = hostEl.attachShadow({ mode: 'open' });
      addStyle(root);
      wrap = document.createElement('div');
      root.append(wrap);
      // Clicar no balão não pode desfazer a seleção da página (menos na lista de moedas, que precisa abrir).
      root.addEventListener('mousedown', (event) => {
        if (event.target.tagName !== 'SELECT' && event.target.tagName !== 'OPTION') event.preventDefault();
      });
    }
    if (!hostEl.isConnected) document.documentElement.append(hostEl);
  }

  function hide() {
    state = null;
    card = null;
    pressedInside = false;
    if (hostEl?.isConnected) hostEl.remove();
  }

  // append() escreveria "null" na tela; partes opcionais (IOF, lista de moedas) chegam como null.
  function add(el, ...children) {
    for (const child of children) if (child != null) el.append(child);
    return el;
  }

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) if (value != null) el.setAttribute(name, value);
    return add(el, ...children);
  }

  // Duas setas de troca, em dourado
  function icon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    const attrs = { d: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    for (const [name, value] of Object.entries(attrs)) path.setAttribute(name, value);
    svg.append(path);
    return svg;
  }

  // Lista para trocar a moeda de um símbolo ambíguo ("$" pode ser USD, CAD, AUD…) neste site.
  function chip(m) {
    if (!m.symbol) return null;
    const label = m.symbol === 'peso' ? '"pesos"' : m.symbol;
    const select = h('select', { class: 'chip', title: `De qual país é o ${label} neste site?`, 'aria-label': `Moeda do símbolo ${label}` });
    const codes = CT.AMBIGUOUS[m.symbol].includes(m.currency) ? CT.AMBIGUOUS[m.symbol] : [m.currency, ...CT.AMBIGUOUS[m.symbol]];
    for (const code of codes) {
      const option = h('option', { value: code, title: CT.currencyName(code) }, code);
      option.selected = code === m.currency;
      select.append(option);
    }
    select.addEventListener('change', () => remember(m.symbol, select.value));
    return select;
  }

  function remember(symbol, code) {
    const key = symbol === 'peso' ? '$' : symbol; // "pesos" segue o "$" do site
    const all = { ...(settings.siteSymbols ?? {}) };
    all[host] = { ...(all[host] ?? {}), [key]: code };
    settings.siteSymbols = all;
    api.storage.local.set({ siteSymbols: all }).catch(() => {});
    render();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    // Páginas sem https não têm a área de transferência moderna.
    try {
      const area = h('textarea', { class: 'clip', 'aria-hidden': 'true' });
      area.value = text;
      wrap.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function valueButton(text, big) {
    const button = h('button', { type: 'button', class: big ? 'value big' : 'value', title: 'Clique para copiar' }, text);
    button.addEventListener('click', async () => {
      if (!(await copy(text.replace(/[  ]/g, ' ')))) return;
      button.style.minWidth = `${button.offsetWidth}px`;
      button.textContent = 'Copiado!';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = text;
        button.classList.remove('copied');
      }, 1100);
    });
    return button;
  }

  function fee(value, compact) {
    const percent = Number(settings.feePercent);
    if (!settings.feeOn || !(percent > 0)) return null;
    const total = CT.formatMoney(value * (1 + percent / 100), settings.target);
    const name = settings.target === 'BRL' ? 'IOF' : 'taxa';
    if (compact) return h('small', { class: 'fee' }, `com ${name}: ${total}`);
    return h('div', { class: 'fee' }, `com ${name} de ${CT.formatNumber(percent)}%: `, h('b', {}, total));
  }

  function render() {
    if (!state || !enabledHere()) return hide();
    const items = itemsOf(state);
    if (!items.length) return hide();
    const target = settings.target;
    const values = rates?.values;
    const next = h('div', { class: 'tip', role: 'status', 'data-theme': ['light', 'black'].includes(settings.theme) ? settings.theme : 'dark' });

    if (!values) {
      add(next,
        h('div', { class: 'from' }, icon(), 'Câmbio Turbo'),
        h('p', { class: 'error' }, 'Ainda sem cotações. Confira a internet e selecione o valor de novo.'),
      );
    } else if (items.length === 1) {
      const [m] = items;
      const value = CT.convert(m.amount, m.currency, target, values);
      add(next,
        h('div', { class: 'from' }, icon(), h('span', { class: 'amount' }, CT.formatAmount(m.amount, m.currency, m.decimals)), chip(m)),
        valueButton(CT.formatMoney(value, target), true),
        fee(value),
        h('div', { class: 'meta' }, `${CT.formatRate(m.currency, target, values)} · ${CT.formatWhen(rates.updated)}`),
      );
    } else {
      const rows = h('div', { class: 'rows' });
      for (const m of items) {
        const value = CT.convert(m.amount, m.currency, target, values);
        rows.append(
          h('span', { class: 'amount' }, CT.formatAmount(m.amount, m.currency, m.decimals), chip(m)),
          h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
          h('span', {}, valueButton(CT.formatMoney(value, target)), fee(value, true)),
        );
      }
      const codes = [...new Set(items.map((m) => m.currency))];
      const when = CT.formatWhen(rates.updated);
      add(next,
        h('div', { class: 'from' }, icon(), `${items.length} valores em ${target}`),
        rows,
        h('div', { class: 'meta' }, codes.length === 1 ? `${CT.formatRate(codes[0], target, values)} · ${when}` : `Cotação de ${when}`),
      );
    }

    mount();
    wrap.replaceChildren(next);
    card = next;
    place();
  }

  // Embaixo da seleção; em cima se não couber. Some enquanto a seleção estiver fora da tela.
  function place() {
    if (!state || !card) return;
    const r = state.rect();
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = innerHeight;
    if (!r || (r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > vh) {
      card.style.visibility = 'hidden';
      return;
    }
    card.style.visibility = '';
    const w = card.offsetWidth;
    const hgt = card.offsetHeight;
    let top = r.bottom + 8;
    if (top + hgt > vh - 8 && r.top - hgt - 8 >= 8) top = r.top - hgt - 8;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  // ---------- Eventos ----------
  const registered = [];
  function on(target, type, listener, capture = false, passive = false) {
    target.addEventListener(type, listener, { capture, passive });
    registered.push([target, type, listener, capture]);
  }

  // Depois de uma atualização da extensão (no Chrome) o script antigo perde a conexão: ele sai de cena.
  function alive() {
    let ok = false;
    try {
      ok = Boolean(api.runtime?.id);
    } catch {}
    if (!ok) {
      hide();
      for (const [target, type, listener, capture] of registered.splice(0)) target.removeEventListener(type, listener, capture);
    }
    return ok;
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => check().catch(() => {}), 20);
  }

  on(document, 'pointerdown', (event) => {
    if (hostEl && event.target === hostEl) {
      pressedInside = true;
      return;
    }
    pressedInside = false;
    if (state) hide();
  }, true);

  on(document, 'mouseup', (event) => {
    if (event.button === 0 && event.target !== hostEl) schedule();
  }, true);

  // Seleção pelo teclado (Shift + setas, Ctrl+A)
  on(document, 'keyup', (event) => {
    if (event.key === 'Shift' || event.shiftKey || ((event.ctrlKey || event.metaKey) && /^a$/i.test(event.key))) schedule();
  }, true);

  on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && state) hide();
  }, true);

  on(document, 'selectionchange', () => {
    if (state && !pressedInside && !readSelection()) hide();
  });

  let frame = 0;
  const reposition = () => {
    if (!state || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  on(window, 'scroll', reposition, true, true);
  on(window, 'resize', reposition, false, true);

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (key === 'rates') rates = change.newValue ?? null;
      else if (key in CT.DEFAULTS) settings[key] = change.newValue ?? CT.DEFAULTS[key];
    }
    if (state) render();
  });

  // O menu pergunta o endereço do site e o que o "$" quer dizer aqui.
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'site:info') return false;
    sendResponse({ host, auto: CT.siteDefaults(location.hostname, document.documentElement.lang || '') });
    return false;
  });
})();
