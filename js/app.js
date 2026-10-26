const VENUES = typeof buildCookzVenues === "function" ? buildCookzVenues("es") : [];

const FAVOS = window.FAVOS_ITEMS || [];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const TICKETS_FALLBACK = [
  {
    src: "media/ui/tickets.png",
    copy: {
      ja: "日付: 2026-09-30. 時間: 10:40.",
      es: "Fecha: 30/09/2026. Hora: 10:40. Lugar: Nishi-Shinsaibashi 2-chome, Chuo-ku, Osaka, Japón. Establecimiento: 7-Eleven (大阪西心斎橋２丁目店). Total: ¥780.",
      en: "Date: 30/09/2026. Time: 10:40. Place: Nishi-Shinsaibashi 2-chome, Chuo-ku, Osaka, Japan. Store: 7-Eleven. Total: ¥780.",
    },
  },
];

let TICKETS = [...TICKETS_FALLBACK];
const TICKET_JSON = "/data/tickets.json";
const TICKET_LANG_KEY = "cookz-konbini-lang";
const TICKET_SORT_KEY = "cookz-konbini-sort";

let selected = -1;
let hovering = -1;
let cookzLandingIndex = -1;
let lienzoReturn = false;

function pickCookzLandingIndex() {
  const candidates = VENUES.map((v, i) => i).filter((i) => Boolean(VENUES[i].hover));
  if (!candidates.length) return 0;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function cookzLandingHero() {
  const venue = VENUES[cookzLandingIndex];
  return venue?.hover || venue?.photos?.[0] || null;
}
let konbiniView = "hub";
let ticketLang = localStorage.getItem(TICKET_LANG_KEY) || "es";
let ticketSort = localStorage.getItem(TICKET_SORT_KEY) || "date";

const TICKET_LABELS = {
  ja: { buys: "購入", total: "合計" },
  es: { buys: "Compra", total: "Total" },
  en: { buys: "Items", total: "Total" },
};

const CHAIN_SORT_ORDER = { "7-Eleven": 0, Lawson: 1, FamilyMart: 2 };

function formatTicketDate(iso, lang) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (lang === "ja") return iso;
  return `${d}/${m}/${y}`;
}

function ticketPlaceRomaji(ticket) {
  return ticket.place?.labelRomaji || ticket.place?.labelEn?.replace(/, (Japan|Japón)$/i, "") || "—";
}

function ticketCityKey(ticket) {
  return ticket.place?.cityKey || ticketPlaceRomaji(ticket).split(",").pop()?.trim() || "";
}

function ticketDateTimeLine(ticket) {
  const time = ticket.time || "—";
  if (ticketLang === "ja") {
    return `${ticket.date || "—"} ${time}`;
  }
  const date = formatTicketDate(ticket.date, ticketLang);
  return `${date} · ${time}`;
}

function ticketTimestamp(ticket) {
  const d = ticket.date || "1970-01-01";
  const t = (ticket.time || "00:00").padStart(5, "0");
  return `${d}T${t}`;
}

function compareTickets(a, b, key) {
  switch (key) {
    case "total":
      return (a.total || 0) - (b.total || 0);
    case "city":
      return ticketCityKey(a).localeCompare(ticketCityKey(b), "en");
    case "chain": {
      const ca = CHAIN_SORT_ORDER[a.establishment?.chain] ?? 9;
      const cb = CHAIN_SORT_ORDER[b.establishment?.chain] ?? 9;
      return ca - cb || ticketTimestamp(a).localeCompare(ticketTimestamp(b));
    }
    case "date":
    default:
      return ticketTimestamp(a).localeCompare(ticketTimestamp(b));
  }
}

const TICKET_SORT_KEYS = ["date", "total", "city", "chain"];
/** @type {Record<string, string[]> | null} */
let ticketSortOrders = null;

function sortTicketsByKey(key) {
  const list = [...TICKETS];
  const asc = key === "city" || key === "chain";
  list.sort((a, b) => {
    const cmp = compareTickets(a, b, key);
    return asc ? cmp : -cmp;
  });
  return list;
}

function rebuildTicketSortOrders() {
  ticketSortOrders = {};
  for (const key of TICKET_SORT_KEYS) {
    ticketSortOrders[key] = sortTicketsByKey(key).map((t) => t.ktId);
  }
}

function getSortedTickets() {
  const order = ticketSortOrders?.[ticketSort];
  if (order?.length) {
    const byId = new Map(TICKETS.map((t) => [t.ktId, t]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }
  return sortTicketsByKey(ticketSort);
}

function ticketItemLabel(it, lang) {
  const ja = (it.nameJa || "").replace(/\s*\(軽減税率\)\s*$/, "").trim();
  const sub =
    lang === "en"
      ? (it.nameEn || it.nameEs || "").trim()
      : (it.nameEs || "").trim();
  if (!ja) return { main: sub || "—", paren: "" };
  if (sub && sub !== ja) return { main: ja, paren: sub };
  return { main: ja, paren: "" };
}

function buildTicketInfoEl(ticket) {
  const L = TICKET_LABELS[ticketLang] || TICKET_LABELS.es;
  const wrap = document.createElement("div");
  wrap.className = "t-card__info";
  const panel = document.createElement("div");
  panel.className = "t-card__panel";
  wrap.append(panel);

  const when = document.createElement("div");
  when.className = "t-card__datetime";
  when.textContent = ticketDateTimeLine(ticket);
  panel.append(when);

  const place = document.createElement("div");
  place.className = "t-card__place";
  place.textContent = ticketPlaceRomaji(ticket);
  panel.append(place);

  const scroll = document.createElement("div");
  scroll.className = "t-card__scroll";
  panel.append(scroll);

  const items = (ticket.items || []).filter((it) => it.amount > 0 && it.nameJa !== "商品");
  if (items.length) {
    const head = document.createElement("div");
    head.className = "t-card__section";
    head.textContent = L.buys;
    scroll.append(head);
    const ul = document.createElement("ul");
    ul.className = "t-card__items";
    items.forEach((it) => {
      const li = document.createElement("li");
      li.className = "t-card__line";
      const body = document.createElement("div");
      body.className = "t-item-body";
      const { main, paren } = ticketItemLabel(it, ticketLang);
      const name = document.createElement("span");
      name.className = "t-item-main";
      name.textContent = main;
      body.append(name);
      if (paren) {
        const par = document.createElement("span");
        par.className = "t-item-es";
        par.textContent = ticketLang === "ja" ? `（${paren}）` : `(${paren})`;
        body.append(par);
      }
      const price = document.createElement("span");
      price.className = "t-item-price";
      price.textContent = `¥${it.amount}`;
      li.append(body, price);
      ul.append(li);
    });
    scroll.append(ul);
  }

  if (ticket.total != null) {
    const total = document.createElement("div");
    total.className = "t-card__total";
    const lab = document.createElement("strong");
    lab.textContent = L.total;
    const val = document.createElement("span");
    val.textContent = `¥${ticket.total}`;
    total.append(lab, val);
    panel.append(total);
  }

  return wrap;
}

function renderKonbiniStatsPanel() {
  const el = document.getElementById("konbini-stats");
  if (!el || typeof renderKonbiniStats !== "function") return;
  renderKonbiniStats(el, TICKETS, ticketLang);
}

function refreshTicketPanels() {
  const track = $("#t-track");
  if (!track) return;
  track.querySelectorAll(".t-card").forEach((card) => {
    const ticket = TICKETS.find((t) => t.ktId === card.dataset.ktId);
    if (!ticket) return;
    const info = card.querySelector(".t-card__info");
    if (info) info.replaceWith(buildTicketInfoEl(ticket));
  });
}

function normalizeTicket(row) {
  const rel = row.imageSrc || row.src || (row.image ? `../${row.image}` : "");
  const src =
    rel.startsWith("../konbini-tickets/")
      ? rel.replace(/^\.\.\//, "/")
      : rel;
  const copy =
    row.copy && typeof row.copy === "object"
      ? row.copy
      : { es: String(row.copy || ""), ja: String(row.copy || ""), en: String(row.copy || "") };
  return { ...row, src, copy };
}

async function loadTickets() {
  try {
    const res = await fetch(TICKET_JSON);
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.tickets || data).map(normalizeTicket);
    if (list.length) {
      TICKETS = list;
      rebuildTicketSortOrders();
    }
  } catch {
    /* fallback */
  }
  if (!ticketSortOrders && TICKETS.length) rebuildTicketSortOrders();
  layoutTickets({ force: true });
  syncTicketLangUi();
  syncTicketSortUi();
  renderKonbiniStatsPanel();
}

function syncTicketLangUi() {
  $$("[data-ticket-lang]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.ticketLang === ticketLang);
  });
}

function setTicketLang(lang) {
  ticketLang = lang;
  localStorage.setItem(TICKET_LANG_KEY, lang);
  syncTicketLangUi();
  refreshTicketPanels();
  renderKonbiniStatsPanel();
}

function readSortLineBox(track, active) {
  const t = track.getBoundingClientRect();
  const b = active.getBoundingClientRect();
  return { left: b.left - t.left, width: b.width };
}

function applySortLineBox(line, box) {
  line.style.left = `${box.left}px`;
  line.style.width = `${box.width}px`;
}

function positionTicketSortLine(animate = false) {
  const nav = $("#t-sort");
  const track = nav?.querySelector(".t-sort__track");
  const line = nav?.querySelector(".t-sort__line");
  const active = nav?.querySelector(`[data-ticket-sort="${ticketSort}"]`);
  if (!track || !line || !active) return;

  const next = readSortLineBox(track, active);
  if (!animate || !sortLinePrev) {
    applySortLineBox(line, next);
    sortLinePrev = next;
    return;
  }

  const from = sortLinePrev;
  const unionL = Math.min(from.left, next.left);
  const unionR = Math.max(from.left + from.width, next.left + next.width);
  const span = unionR - unionL;
  const stretchPad = Math.max(18, span * 0.42);
  const stretchLeft = unionL - stretchPad;
  const stretchWidth = span + stretchPad * 2;
  const midLeft = stretchLeft + stretchWidth * 0.08;
  const midWidth = stretchWidth * 0.84;

  line.getAnimations().forEach((a) => a.cancel());
  applySortLineBox(line, from);

  const anim = line.animate(
    [
      { left: `${from.left}px`, width: `${from.width}px` },
      { left: `${midLeft}px`, width: `${midWidth}px` },
      { left: `${next.left}px`, width: `${next.width}px` },
    ],
    {
      duration: 900,
      easing: "cubic-bezier(0.34, 1.65, 0.44, 1)",
      fill: "forwards",
    },
  );
  anim.onfinish = () => {
    applySortLineBox(line, next);
    sortLinePrev = next;
  };
}

function syncTicketSortUi(animateLine = false) {
  $$("[data-ticket-sort]").forEach((btn) => {
    const on = btn.dataset.ticketSort === ticketSort;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  requestAnimationFrame(() => positionTicketSortLine(animateLine));
}

function setTicketSort(key) {
  if (!key || key === ticketSort) return;
  ticketSort = key;
  localStorage.setItem(TICKET_SORT_KEY, key);
  syncTicketSortUi(true);
  layoutTickets({ reorder: true });
}

function route() {
  const [screen, sub] = (location.hash.replace(/^#\/?/, "") || "home").split("/");
  return { screen, sub };
}

function go(screen, extra) {
  const path = extra ? `${screen}/${extra}` : screen;
  if (location.hash !== `#/${path}`) location.hash = `/${path}`;
  else apply();
}

function renderCookzOrder(el, text) {
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  el.replaceChildren();
  text.split("\n").forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    const row = document.createElement("div");
    row.className = "order-line";

    const total = raw.match(/^Total:\s*(.+)$/i);
    if (total) {
      row.classList.add("order-line--total");
      const item = document.createElement("span");
      item.className = "order-line__item";
      item.textContent = "Total";
      const price = document.createElement("span");
      price.className = "order-line__price";
      price.textContent = total[1].trim();
      row.append(item, price);
      el.append(row);
      return;
    }

    const dash = raw.match(/^(.+?)\s*[—–-]\s*(¥[\d,]+.*)$/);
    if (dash) {
      const item = document.createElement("span");
      item.className = "order-line__item";
      item.textContent = dash[1].trim();
      const price = document.createElement("span");
      price.className = "order-line__price";
      price.textContent = dash[2].trim();
      row.append(item, price);
      el.append(row);
      return;
    }

    const item = document.createElement("span");
    item.className = "order-line__item";
    item.textContent = raw;
    row.append(item);
    el.append(row);
  });
}

// Ajustes de contenido apagados. Encender solo si el usuario dice
// "activa los ajustes de contenido de cooks".
const COOKZ_ADJUST = false;
const COOKZ_EDIT_KEY = "cookz-edit";
let cookzFrameOn = false;
let cookzSlotVenue = null;
let cookzActiveSlot = 0;
let cookzFrameDrag = null;

function readCookzEdit() {
  const baked = typeof COOKZ_SAVED !== "undefined" ? COOKZ_SAVED : {};
  if (!COOKZ_ADJUST) return baked;
  try {
    const local = JSON.parse(localStorage.getItem(COOKZ_EDIT_KEY));
    if (local && Object.keys(local).length) return local;
  } catch {
    /* sigue el archivo guardado */
  }
  return baked;
}

function writeCookzEdit(data) {
  if (!COOKZ_ADJUST) return;
  localStorage.setItem(COOKZ_EDIT_KEY, JSON.stringify(data));
}

function venueBoard(venue) {
  const pool = venue.pool || [];
  const known = new Set(pool.map((item) => item.src));
  const ok = (src) => Boolean(src) && (!known.size || known.has(src));
  const saved = readCookzEdit()[venue.id] || {};
  if (Array.isArray(saved.slots)) {
    const count = Math.min(4, Math.max(1, Number(saved.count) || saved.slots.length || 1));
    const slots = saved.slots.slice(0, count).map((src) => (ok(src) ? src : null));
    while (slots.length < count) slots.push(null);
    return { count, slots };
  }
  const picks = Array.isArray(saved.picks)
    ? saved.picks.filter(ok)
    : (venue.photos || []).filter(ok);
  const count = Math.min(4, Math.max(1, picks.length || 1));
  const slots = picks.slice(0, count);
  while (slots.length < count) slots.push(null);
  return { count, slots };
}

function normalizeCookzFrame(frame) {
  const raw = ((Number(frame?.r) || 0) % 360 + 360) % 360;
  const r = raw === 90 || raw === 180 || raw === 270 ? raw : 0;
  return {
    x: Number.isFinite(frame?.x) ? frame.x : 50,
    y: Number.isFinite(frame?.y) ? frame.y : 50,
    z: Number.isFinite(frame?.z) ? frame.z : 1,
    r,
    fx: frame?.fx === -1 ? -1 : 1,
    fy: frame?.fy === -1 ? -1 : 1,
  };
}

function cookzSrcKey(src) {
  const text = String(src || "");
  const at = text.indexOf("media/");
  return at >= 0 ? text.slice(at) : text;
}

function findCookzFrame(frames, src) {
  if (!frames) return null;
  const key = cookzSrcKey(src);
  if (frames[key]) return frames[key];
  if (src && frames[src]) return frames[src];
  for (const saved of Object.keys(frames)) {
    if (cookzSrcKey(saved) === key) return frames[saved];
  }
  return null;
}

function venueFrame(venueId, src) {
  return normalizeCookzFrame(findCookzFrame(readCookzEdit()[venueId]?.frames, src));
}

function saveCookzBoard(venueId, count, slots) {
  const all = readCookzEdit();
  const cur = all[venueId] || { frames: {} };
  cur.count = count;
  cur.slots = slots;
  cur.frames = cur.frames || {};
  all[venueId] = cur;
  writeCookzEdit(all);
}

function saveCookzFrame(venueId, src, frame) {
  const all = readCookzEdit();
  const cur = all[venueId] || { frames: {} };
  cur.frames = cur.frames || {};
  cur.frames[cookzSrcKey(src)] = frame;
  all[venueId] = cur;
  writeCookzEdit(all);
}

function applyCookzCrop(img, frame) {
  const f = normalizeCookzFrame(frame);
  img.style.objectPosition = `${f.x}% ${f.y}%`;
  img.style.transformOrigin = `${f.x}% ${f.y}%`;
  img.style.transform = f.z > 1.01 ? `scale(${f.z})` : "";
}

function applyCookzOrient(img, frame) {
  const f = normalizeCookzFrame(frame);
  const fit = img.parentElement?.classList.contains("cookz-fit") ? img.parentElement : null;
  const cell = img.closest(".cookz-grid__cell");
  img.dataset.r = String(f.r);
  img.dataset.fx = String(f.fx);
  img.dataset.fy = String(f.fy);
  if (!fit || !cell) return;
  const turned = f.r === 90 || f.r === 270;
  if (turned) {
    fit.style.width = `${cell.clientHeight + 2}px`;
    fit.style.height = `${cell.clientWidth + 2}px`;
  } else {
    fit.style.width = "calc(100% + 2px)";
    fit.style.height = "calc(100% + 2px)";
  }
  fit.style.transform = `translate(-50%, -50%) rotate(${f.r}deg) scale(${f.fx}, ${f.fy})`;
  const orient = cell.querySelector(".cookz-orient");
  if (orient) {
    orient.querySelector('[data-orient="rot"]')?.classList.toggle("is-on", f.r !== 0);
    orient.querySelector('[data-orient="flipx"]')?.classList.toggle("is-on", f.fx === -1);
    orient.querySelector('[data-orient="flipy"]')?.classList.toggle("is-on", f.fy === -1);
  }
}

function applyCookzFrame(img, frame) {
  applyCookzCrop(img, frame);
  applyCookzOrient(img, frame);
}

function cookzFrameOnImg(img, venueId) {
  const frame = venueFrame(venueId, cookzSrcKey(img.getAttribute("src")));
  if (img.dataset.r != null && img.dataset.r !== "") frame.r = Number(img.dataset.r) || 0;
  if (img.dataset.fx != null && img.dataset.fx !== "") frame.fx = Number(img.dataset.fx) === -1 ? -1 : 1;
  if (img.dataset.fy != null && img.dataset.fy !== "") frame.fy = Number(img.dataset.fy) === -1 ? -1 : 1;
  return normalizeCookzFrame(frame);
}

const COOKZ_KANJI_KEY = "cookz-kanji";
let cookzKanjiDrag = null;
let cookzCoverId = null;

function cookzCoverVenue() {
  return VENUES.find((venue) => venue.id === cookzCoverId) || null;
}

function readCookzKanji() {
  const baked = typeof COOKZ_KANJI !== "undefined" ? { ...COOKZ_KANJI } : {};
  try {
    const local = JSON.parse(localStorage.getItem(COOKZ_KANJI_KEY));
    if (local && typeof local === "object") return { ...baked, ...local };
  } catch {
    /* sigue el archivo */
  }
  return baked;
}

function kanjiPlace(venueId) {
  const raw = readCookzKanji()[venueId] || {};
  const s = Number(raw.s);
  return {
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : 0,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : 0,
    s: Number.isFinite(s) && s > 0 ? s : 1,
  };
}

function saveCookzKanji(venueId, place) {
  const all = readCookzKanji();
  all[venueId] = {
    x: Math.round(place.x * 10) / 10,
    y: Math.round(place.y * 10) / 10,
    s: Math.round(place.s * 100) / 100,
  };
  localStorage.setItem(COOKZ_KANJI_KEY, JSON.stringify(all));
}

function applyCookzKanji(el, place) {
  const s = Math.min(3, Math.max(0.25, place.s));
  el.style.left = `calc(50% + ${place.x}%)`;
  el.style.top = `calc(50% + ${place.y}%)`;
  el.style.transform = `translate(-50%, -50%) scale(${s})`;
}

function fitCookzRomaji() {
  const el = document.querySelector("#cookz-romaji");
  const span = el?.querySelector("span");
  if (!el || !span || el.hidden) return;
  const max = el.clientWidth;
  if (!max) return;
  span.style.fontSize = "100px";
  const width = span.getBoundingClientRect().width;
  if (!width) return;
  span.style.fontSize = `${(100 * max) / width}px`;
}

function paintCookzMark(venue) {
  const kanji = $("#cookz-kanji");
  const romaji = $("#cookz-romaji");
  const span = romaji?.querySelector("span");
  if (!kanji || !romaji || !span) return;
  if (!venue) {
    cookzCoverId = null;
    kanji.hidden = true;
    romaji.hidden = true;
    return;
  }
  cookzCoverId = venue.id;
  const src = `media/kanji/${venue.id}.svg`;
  if (kanji.getAttribute("src") !== src) kanji.src = src;
  kanji.hidden = false;
  span.textContent = venue.venueRomaji || "";
  romaji.hidden = !span.textContent;
  if (!cookzKanjiDrag) applyCookzKanji(kanji, kanjiPlace(venue.id));
  fitCookzRomaji();
}

function bindCookzKanji() {
  const kanji = $("#cookz-kanji");
  const grid = $("#cookz-grid");
  if (!kanji || !grid || kanji.dataset.bound === "1") return;
  kanji.dataset.bound = "1";

  kanji.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const venue = cookzCoverVenue();
    if (!venue || kanji.hidden) return;
    const box = grid.getBoundingClientRect();
    const place = kanjiPlace(venue.id);
    cookzKanjiDrag = {
      id: venue.id,
      place,
      x: e.clientX,
      y: e.clientY,
      w: box.width || 1,
      h: box.height || 1,
      moved: false,
    };
    kanji.classList.add("is-drag");
    kanji.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  kanji.addEventListener("pointermove", (e) => {
    if (!cookzKanjiDrag) return;
    const dx = ((e.clientX - cookzKanjiDrag.x) / cookzKanjiDrag.w) * 100;
    const dy = ((e.clientY - cookzKanjiDrag.y) / cookzKanjiDrag.h) * 100;
    if (Math.abs(dx) + Math.abs(dy) < 0.4) return;
    cookzKanjiDrag.moved = true;
    const place = {
      x: cookzKanjiDrag.place.x + dx,
      y: cookzKanjiDrag.place.y + dy,
      s: cookzKanjiDrag.place.s,
    };
    applyCookzKanji(kanji, place);
    cookzKanjiDrag.live = place;
  });

  const endKanji = () => {
    if (!cookzKanjiDrag) return;
    if (cookzKanjiDrag.live) saveCookzKanji(cookzKanjiDrag.id, cookzKanjiDrag.live);
    cookzKanjiDrag = null;
    kanji.classList.remove("is-drag");
  };
  kanji.addEventListener("pointerup", endKanji);
  kanji.addEventListener("pointercancel", endKanji);

  kanji.addEventListener(
    "wheel",
    (e) => {
      const venue = cookzCoverVenue();
      if (!venue || kanji.hidden) return;
      e.preventDefault();
      const place = cookzKanjiDrag?.live || kanjiPlace(venue.id);
      place.s = Math.min(3, Math.max(0.25, place.s + (e.deltaY < 0 ? 0.06 : -0.06)));
      applyCookzKanji(kanji, place);
      saveCookzKanji(venue.id, place);
      if (cookzKanjiDrag) cookzKanjiDrag.place.s = place.s;
    },
    { passive: false },
  );

  kanji.addEventListener("dblclick", (e) => {
    const venue = cookzCoverVenue();
    if (!venue) return;
    e.preventDefault();
    const place = { x: 0, y: 0, s: 1 };
    applyCookzKanji(kanji, place);
    saveCookzKanji(venue.id, place);
  });
}

function paintCookzGallery(urls, frames, activeSlot = -1) {
  const grid = $("#cookz-grid");
  if (!grid) return;
  const count = Math.min(Math.max(urls.length, 1), 4);
  grid.dataset.layout = String(count);

  for (let i = 0; i < 4; i++) {
    const cell = grid.querySelector(`[data-slot="${i}"]`);
    const img = $(`#cookz-img-${i}`);
    if (!cell || !img) continue;
    if (i >= count) {
      cell.hidden = true;
      cell.classList.remove("is-target", "is-empty");
      continue;
    }
    cell.hidden = false;
    cell.classList.remove("is-target");
    const src = urls[i];
    if (cookzFrameDrag?.img === img) {
      cell.hidden = false;
      cell.classList.add("has-img");
      cell.classList.remove("is-empty", "is-target");
      const live = cookzFrameDrag.live || cookzFrameDrag.frame;
      applyCookzCrop(img, live);
      applyCookzOrient(img, live);
      continue;
    }
    if (src) {
      cell.classList.add("has-img");
      cell.classList.remove("is-empty");
      if (cookzSrcKey(img.getAttribute("src")) !== cookzSrcKey(src)) img.src = src;
      img.hidden = false;
      applyCookzFrame(img, frames?.[src]);
    } else {
      cell.classList.remove("has-img");
      cell.classList.add("is-empty");
      img.removeAttribute("src");
      img.hidden = true;
      applyCookzFrame(img, { x: 50, y: 50, z: 1 });
    }
  }
}

function setCookzCount(venue, count) {
  const board = venueBoard(venue);
  const slots = board.slots.slice(0, count);
  while (slots.length < count) slots.push(null);
  saveCookzBoard(venue.id, count, slots);
  if (cookzActiveSlot >= count) cookzActiveSlot = count - 1;
  const empty = slots.findIndex((src) => !src);
  if (empty >= 0) cookzActiveSlot = empty;
  paintCookz();
}

function placeCookzPhoto(venue, src, slot) {
  const board = venueBoard(venue);
  if (slot < 0 || slot >= board.count) return;
  const slots = board.slots.slice();
  const other = slots.indexOf(src);
  if (other >= 0 && other !== slot) slots[other] = null;
  slots[slot] = src;
  saveCookzBoard(venue.id, board.count, slots);
  cookzActiveSlot = slot;
  paintCookz();
}

function cookzCellAt(x, y) {
  const ghost = document.querySelector(".cookz-ghost");
  if (ghost) ghost.hidden = true;
  const el = document.elementFromPoint(x, y);
  if (ghost) ghost.hidden = false;
  const cell = el?.closest?.(".cookz-grid__cell");
  if (!cell || cell.hidden) return null;
  return cell;
}

function bindCookzDrop() {
  const bar = $("#cookz-pick");
  const grid = $("#cookz-grid");
  if (!bar || !grid || bar.dataset.dropBound === "1") return;
  bar.dataset.dropBound = "1";
  let drag = null;

  bar.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const btn = e.target.closest(".cookz-pick__row button");
    if (!btn?.dataset.src) return;
    drag = {
      src: btn.dataset.src,
      x: e.clientX,
      y: e.clientY,
      btn,
      ghost: null,
      pointerId: e.pointerId,
    };
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.ghost) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      const ghost = document.createElement("img");
      ghost.className = "cookz-ghost";
      ghost.src = drag.src;
      ghost.alt = "";
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.btn.classList.add("is-dragging");
    }
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const under = cookzCellAt(e.clientX, e.clientY);
    grid.querySelectorAll(".cookz-grid__cell").forEach((cell) => {
      cell.classList.toggle("is-drop", cell === under);
    });
  });

  const finish = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const under = drag.ghost ? cookzCellAt(e.clientX, e.clientY) : null;
    const venue = VENUES[selected];
    drag.ghost?.remove();
    drag.btn.classList.remove("is-dragging");
    grid.querySelectorAll(".is-drop").forEach((cell) => cell.classList.remove("is-drop"));
    const src = drag.src;
    const slot = under ? Number(under.dataset.slot) : -1;
    drag = null;
    if (under && venue) placeCookzPhoto(venue, src, slot);
  };
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

function renderCookzPick(venue, on) {
  const bar = $("#cookz-pick");
  const stage = $("#cookz-stage");
  if (!bar) return;
  stage?.classList.toggle("is-edit", Boolean(on));
  if (!on || !venue?.pool?.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const board = venueBoard(venue);
  if (bar.dataset.venue !== String(venue.id)) {
    bar.dataset.venue = String(venue.id);
    bar.replaceChildren();
    const head = document.createElement("div");
    head.className = "cookz-pick__head";
    const count = document.createElement("div");
    count.className = "cookz-count";
    count.setAttribute("role", "group");
    count.setAttribute("aria-label", "Cuántas fotos");
    for (let n = 1; n <= 4; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.count = String(n);
      btn.textContent = String(n);
      btn.addEventListener("click", () => setCookzCount(venue, n));
      count.append(btn);
    }
    const note = document.createElement("p");
    note.className = "cookz-pick__note";
    const row = document.createElement("div");
    row.className = "cookz-pick__row";
    venue.pool.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.src = item.src;
      btn.title = item.name;
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.name;
      img.draggable = false;
      const cap = document.createElement("span");
      cap.className = "cookz-pick__name";
      cap.textContent = item.name;
      const num = document.createElement("span");
      num.className = "cookz-pick__n";
      num.hidden = true;
      btn.append(img, cap, num);
      row.append(btn);
    });
    head.append(count, note);
    bar.append(head, row);
  }
  bar.querySelectorAll(".cookz-count button").forEach((btn) => {
    btn.classList.toggle("is-on", Number(btn.dataset.count) === board.count);
  });
  const note = bar.querySelector(".cookz-pick__note");
  if (note) note.textContent = "Arrastra al sitio. En la foto, arrastra para encuadrar. 90° gira, las flechas voltean.";
  bar.querySelectorAll(".cookz-pick__row button").forEach((btn) => {
    const index = board.slots.indexOf(btn.dataset.src);
    btn.classList.toggle("is-on", index >= 0);
    const num = btn.querySelector(".cookz-pick__n");
    num.hidden = index < 0;
    num.textContent = index >= 0 ? String(index + 1) : "";
  });
}

function bindCookzFrame() {
  const grid = $("#cookz-grid");
  if (!grid || grid.dataset.frameBound === "1") return;
  grid.dataset.frameBound = "1";
  let drag = null;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".cookz-orient button");
    if (!btn || !cookzFrameOn) return;
    const cell = btn.closest(".cookz-grid__cell");
    const img = cell?.querySelector("img");
    const src = cookzSrcKey(img?.getAttribute("src"));
    const venue = VENUES[selected];
    if (!src || !venue) return;
    const frame = cookzFrameOnImg(img, venue.id);
    if (btn.dataset.orient === "rot") frame.r = (frame.r + 90) % 360;
    if (btn.dataset.orient === "flipx") frame.fx = frame.fx === -1 ? 1 : -1;
    if (btn.dataset.orient === "flipy") frame.fy = frame.fy === -1 ? 1 : -1;
    applyCookzFrame(img, frame);
    saveCookzFrame(venue.id, src, frame);
  });

  grid.addEventListener("pointerdown", (e) => {
    if (!cookzFrameOn || e.button !== 0) return;
    if (e.target.closest(".cookz-orient")) return;
    const cell = e.target.closest(".cookz-grid__cell");
    const img = cell?.querySelector("img");
    const src = cookzSrcKey(img?.getAttribute("src"));
    const venue = VENUES[selected];
    if (!cell || cell.hidden || !venue || !src) return;
    const slot = Number(cell.dataset.slot);
    drag = {
      src,
      slot,
      id: venue.id,
      frame: cookzFrameOnImg(img, venue.id),
      x: e.clientX,
      y: e.clientY,
      w: img.clientWidth || cell.clientWidth,
      h: img.clientHeight || cell.clientHeight,
      img,
      live: null,
    };
    cookzFrameDrag = drag;
    cell.classList.add("is-framing");
    cell.setPointerCapture(e.pointerId);
  });

  grid.addEventListener("pointermove", (e) => {
    if (!drag?.frame) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    const fx = drag.frame.fx;
    const fy = drag.frame.fy;
    const rad = (-drag.frame.r * Math.PI) / 180;
    const sx = dx * fx;
    const sy = dy * fy;
    const ix = sx * Math.cos(rad) - sy * Math.sin(rad);
    const iy = sx * Math.sin(rad) + sy * Math.cos(rad);
    const x = clamp(drag.frame.x - (ix / drag.w) * 100, 0, 100);
    const y = clamp(drag.frame.y - (iy / drag.h) * 100, 0, 100);
    drag.live = { ...drag.frame, x, y };
    applyCookzCrop(drag.img, drag.live);
  });

  const endDrag = () => {
    if (!drag) return;
    if (drag.live) saveCookzFrame(drag.id, drag.src, drag.live);
    drag = null;
    cookzFrameDrag = null;
    grid.querySelectorAll(".is-framing").forEach((cell) => cell.classList.remove("is-framing"));
  };
  grid.addEventListener("pointerup", endDrag);
  grid.addEventListener("pointercancel", endDrag);

  grid.addEventListener(
    "wheel",
    (e) => {
      if (!cookzFrameOn) return;
      const cell = e.target.closest(".cookz-grid__cell");
      const img = cell?.querySelector("img");
      const src = cookzSrcKey(img?.getAttribute("src"));
      const venue = VENUES[selected];
      if (!src || !venue) return;
      e.preventDefault();
      const frame = cookzFrameOnImg(img, venue.id);
      frame.z = clamp((frame.z || 1) + (e.deltaY < 0 ? 0.08 : -0.08), 1, 3);
      frame.z = Math.round(frame.z * 100) / 100;
      applyCookzFrame(img, frame);
      saveCookzFrame(venue.id, src, frame);
    },
    { passive: false },
  );

  grid.addEventListener("dblclick", (e) => {
    if (!cookzFrameOn || e.target.closest(".cookz-orient")) return;
    const cell = e.target.closest(".cookz-grid__cell");
    const img = cell?.querySelector("img");
    const src = cookzSrcKey(img?.getAttribute("src"));
    const venue = VENUES[selected];
    if (!src || !venue) return;
    const frame = { x: 50, y: 50, z: 1, r: 0, fx: 1, fy: 1 };
    applyCookzFrame(img, frame);
    saveCookzFrame(venue.id, src, frame);
  });

  window.addEventListener("resize", () => {
    if (!cookzFrameOn && !document.querySelector("#cookz-romaji")?.textContent) return;
    fitCookzRomaji();
    if (!cookzFrameOn) return;
    paintCookz();
  });
}

function paintCookz() {
  const focus = hovering >= 0 ? hovering : selected;
  $$("#venue-list button").forEach((btn, i) => {
    btn.classList.toggle("is-on", i === focus);
    btn.classList.toggle("is-picked", i === selected);
  });

  const detail = $("#detail");
  const gridMode = selected >= 0 && (hovering < 0 || hovering === selected);
  const active = hovering >= 0 ? hovering : selected;

  if (active < 0) {
    cookzFrameOn = false;
    const hero = cookzLandingHero();
    paintCookzGallery(hero ? [hero] : []);
    renderCookzPick(null, false);
    paintCookzMark(VENUES[cookzLandingIndex] || null);
    detail.classList.remove("is-on");
    return;
  }

  const venue = VENUES[active];
  if (gridMode) {
    if (cookzSlotVenue !== venue.id) {
      cookzSlotVenue = venue.id;
      const first = venueBoard(venue);
      const empty = first.slots.findIndex((src) => !src);
      cookzActiveSlot = empty >= 0 ? empty : 0;
    }
    const board = venueBoard(venue);
    const frames = {};
    board.slots.forEach((src) => {
      if (src) frames[src] = venueFrame(venue.id, src);
    });
    cookzFrameOn = COOKZ_ADJUST;
    paintCookzGallery(board.slots, frames, cookzActiveSlot);
    renderCookzPick(venue, COOKZ_ADJUST);
    paintCookzMark(null);
  } else {
    cookzFrameOn = false;
    const hero = venue.hover || venue.photos?.[0];
    paintCookzGallery(hero ? [hero] : []);
    renderCookzPick(venue, false);
    paintCookzMark(venue);
  }
  const same = detail.dataset.venue === venue.name && detail.classList.contains("is-on");

  $("#detail-venue-ja").textContent = venue.venueJa || "";
  const romajiEl = $("#detail-venue-romaji");
  const romaji = venue.venueRomaji || "";
  romajiEl.textContent = romaji;
  romajiEl.hidden = !romaji || romaji === venue.venueJa;

  const addrJaEl = $("#detail-address-ja");
  if (venue.addressJa && !venue.franchise) {
    addrJaEl.textContent = venue.addressJa;
    addrJaEl.hidden = false;
  } else {
    addrJaEl.textContent = "";
    addrJaEl.hidden = true;
  }

  const addrLink = $("#detail-address");
  if (addrLink) {
    if (venue.mapsUrl) {
      addrLink.href = venue.mapsUrl;
      addrLink.target = "_blank";
      addrLink.rel = "noopener noreferrer";
      addrLink.hidden = false;
      if (venue.franchise) {
        addrLink.textContent = "Franquicia — ver ubicaciones en Google Maps";
      } else if (venue.addressLine) {
        addrLink.textContent = venue.addressLine;
      } else {
        addrLink.textContent = "Buscar en Google Maps";
      }
    } else {
      addrLink.hidden = true;
      addrLink.removeAttribute("href");
      addrLink.textContent = "";
    }
  }

  const orderJaEl = $("#detail-order-ja");
  const orderEl = $("#detail-order");
  const hasOrderJa = Boolean(venue.orderJa);
  const hasOrderWest = Boolean(venue.order);
  const bilingualOrder = hasOrderJa && hasOrderWest && venue.orderJa !== venue.order;
  if (bilingualOrder) {
    renderCookzOrder(orderJaEl, venue.orderJa);
    renderCookzOrder(orderEl, venue.order);
  } else if (hasOrderJa) {
    renderCookzOrder(orderJaEl, venue.orderJa);
    renderCookzOrder(orderEl, "");
  } else if (hasOrderWest) {
    renderCookzOrder(orderJaEl, "");
    renderCookzOrder(orderEl, venue.order);
  } else {
    renderCookzOrder(orderJaEl, "");
    renderCookzOrder(orderEl, "");
  }
  if (same) return;
  detail.dataset.venue = venue.name;
  detail.classList.remove("is-on");
  requestAnimationFrame(() => {
    void detail.offsetWidth;
    detail.classList.add("is-on");
  });
}

function fitScreen() {
  const sizer = document.getElementById("sizer");
  const stage = document.getElementById("stage");
  if (!sizer || !stage) return;
  sizer.style.width = "100%";
  sizer.style.height = "100%";
  sizer.style.marginLeft = "0";
  sizer.style.marginTop = "0";
  stage.style.transform = "none";
}

function liftCookzLogo(on) {
  const frame = document.querySelector('.frame[data-screen="cookz"]');
  const link = frame?.querySelector("a:has(.logo)") || document.querySelector("a.logo-link--cookz");
  if (!frame || !link) return;
  if (on) {
    document.body.append(link);
    link.classList.add("logo-link--cookz");
    return;
  }
  if (!link.classList.contains("logo-link--cookz")) return;
  frame.prepend(link);
  link.classList.remove("logo-link--cookz");
}

function show(screen) {
  const keepLienzo = screen === "cookz" && lienzoReturn;
  $$(".frame").forEach((frame) => {
    const on = frame.dataset.screen === screen || (keepLienzo && frame.dataset.screen === "lienzo");
    frame.classList.toggle("is-on", on);
  });
  liftCookzLogo(screen === "cookz");
  fitScreen();
  if (screen === "japan2026") layoutJapan();

  const sub = screen === "konbini";
  $$("[data-kview]").forEach((el) => el.classList.toggle("is-on", sub && el.dataset.kview === konbiniView));
  const nav = $("#side-nav");
  if (nav) {
    nav.classList.toggle("is-on", sub && konbiniView !== "hub");
    $$("#side-nav a").forEach((a) => {
      const on = a.dataset.view === konbiniView
        || (konbiniView === "stats" && a.dataset.view === "tracker")
        ;
      a.classList.toggle("is-on", on);
    });
  }
  const back = $("#konbini-back");
  if (back) {
    back.classList.toggle("is-on", sub && konbiniView !== "hub");
    back.classList.toggle("back--left", konbiniView !== "tickets-all");
    back.classList.toggle("back--right", konbiniView === "tickets-all");
    if (konbiniView === "tickets-all") {
      back.dataset.goto = "konbini";
      back.dataset.extra = "";
    } else if (konbiniView === "stats") {
      back.dataset.goto = "konbini";
      back.dataset.extra = "tracker";
    } else {
      back.dataset.goto = "japan2026";
      back.dataset.extra = "";
    }
  }
  if (sub && konbiniView === "tickets-all") {
    requestAnimationFrame(() => {
      layoutTickets({ force: true });
      syncTicketSortUi();
      sortLinePrev = null;
      positionTicketSortLine(false);
    });
  }
  if (sub && konbiniView === "stats") {
    renderKonbiniStatsPanel();
  }
  if (window.favosBottle) {
    window.favosBottle.setActive(sub && konbiniView === "favos");
    window.favosBottle.syncActive?.();
  }
  if (window.syncFavosRide) window.syncFavosRide(sub && konbiniView === "favos");
  if (window.csInspect) {
    window.csInspect.setActive(sub && konbiniView === "tracker");
  }
}

const LIENZO_NAME = 72;
const LIENZO_ZOOM_MS = 720;
const LIENZO_ZOOM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
let lienzoView = { x: 0, y: 0 };
let lienzoTarget = { x: 0, y: 0 };
let lienzoVel = { x: 0, y: 0 };
let lienzoWish = { x: 0, y: 0 };
let lienzoWishAt = 0;
let lienzoTile = { w: 1, h: 1 };
let lienzoPlaced = false;
let lienzoMode = "wander";
let lienzoHold = false;
let lienzoLoop = 0;
let lienzoCase = null;
let lienzoCaseAnim = null;
let lienzoZoom = null;
let caseZoomGen = 0;

function wrapLienzo(v, size) {
  if (!size) return 0;
  let n = v % size;
  if (n > 0) n -= size;
  if (n <= -size) n += size;
  return n;
}

function lienzoField() {
  const board = $("#lienzo");
  const box = board.getBoundingClientRect();
  const cols = 4;
  const rows = 4;
  const mobile = window.matchMedia("(max-width: 820px)").matches;
  const gapX = mobile ? 18 : 64;
  const gapY = mobile ? 16 : 56;
  const nameH = mobile ? 48 : LIENZO_NAME;
  const minW = mobile ? 150 : 300;
  const minH = mobile ? 120 : 392;
  const minImg = mobile ? 110 : 180;
  let tileW = Math.max(cols * (minW + gapX), Math.ceil(box.width) + 1);
  let tileH = Math.max(rows * (minH + gapY), Math.ceil(box.height) + 1);
  tileW = Math.ceil(tileW / cols) * cols;
  tileH = Math.ceil(tileH / rows) * rows;
  const pitchX = tileW / cols;
  const pitchY = tileH / rows;
  const cardW = pitchX - gapX;
  const imgH = Math.max(minImg, Math.min(cardW * 1.25, pitchY - gapY - nameH));
  const cardH = imgH + nameH;
  return { cols, rows, cardW, cardH, imgH, tileW, tileH, pitchX, pitchY };
}

function paintLienzoView() {
  const world = $("#lienzo-world");
  if (!world) return;
  const x = wrapLienzo(lienzoView.x, lienzoTile.w);
  const y = wrapLienzo(lienzoView.y, lienzoTile.h);
  world.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function placeLienzo() {
  const board = $("#lienzo");
  const world = $("#lienzo-world");
  if (!board || !world) return;
  if (!lienzoPlaced) {
    const box = board.getBoundingClientRect();
    const field = lienzoField();
    lienzoView.x = (box.width - field.tileW) / 2 - field.pitchX * 0.38;
    lienzoView.y = (box.height - field.tileH) / 2 + field.pitchY * 0.12;
    lienzoPlaced = true;
  }
  const next = lienzoField();
  if (!world.childElementCount || next.tileW !== lienzoTile.w || next.tileH !== lienzoTile.h) {
    buildLienzoField();
  }
  resumeLienzoDrift();
  paintLienzoView();
}

function buildLienzoField() {
  const world = $("#lienzo-world");
  const board = $("#lienzo");
  if (!world || !board) return;
  const field = lienzoField();
  lienzoTile = { w: field.tileW, h: field.tileH };
  board.style.setProperty("--lienzo-w", `${field.cardW}px`);
  board.style.setProperty("--lienzo-h", `${field.imgH}px`);
  world.replaceChildren();
  for (let ty = -1; ty <= 1; ty += 1) {
    for (let tx = -1; tx <= 1; tx += 1) {
      const tile = document.createElement("div");
      tile.className = "lienzo__tile";
      tile.style.width = `${field.tileW}px`;
      tile.style.height = `${field.tileH}px`;
      tile.style.transform = `translate3d(${tx * field.tileW}px, ${ty * field.tileH}px, 0)`;
      VENUES.forEach((venue, i) => {
        const col = i % field.cols;
        const row = Math.floor(i / field.cols);
        const card = document.createElement("button");
        card.type = "button";
        card.className = "lienzo__card";
        card.style.left = `${col * field.pitchX + (field.pitchX - field.cardW) / 2}px`;
        card.style.top = `${row * field.pitchY + (field.pitchY - field.cardH) / 2}px`;
        const photo = document.createElement("span");
        photo.className = "lienzo__photo";
        const img = document.createElement("img");
        img.src = venue.hover.replace(/hover\.jpg$/, "lienzo.jpg");
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
        photo.append(img);
        const name = document.createElement("span");
        name.className = "lienzo__name";
        name.textContent = venue.venueRomaji || venue.name;
        card.append(photo, name);
        card.dataset.index = String(i);
        tile.append(card);
      });
      world.append(tile);
    }
  }
}

function lienzoReduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function aimLienzoWander(now) {
  const speed = 10 + Math.random() * 14;
  const angle = Math.random() * Math.PI * 2;
  lienzoWish.x = Math.cos(angle) * speed;
  lienzoWish.y = Math.sin(angle) * speed;
  lienzoWishAt = now + 2800 + Math.random() * 3200;
}

function resumeLienzoDrift() {
  lienzoHold = false;
  lienzoMode = lienzoReduced() ? "still" : "wander";
  if (!lienzoWishAt) aimLienzoWander(performance.now());
  startLienzoLoop();
}

function startLienzoLoop() {
  if (lienzoLoop) return;
  lienzoTick.last = 0;
  lienzoLoop = requestAnimationFrame(lienzoTick);
}

function lienzoTick(now) {
  const lienzoOn = document.querySelector('.frame[data-screen="lienzo"]')?.classList.contains("is-on");
  if (!lienzoOn) {
    lienzoLoop = 0;
    return;
  }
  const prev = lienzoTick.last || now;
  const dt = Math.min(0.032, (now - prev) / 1000);
  lienzoTick.last = now;
  if (!lienzoHold && dt > 0) {
    if (lienzoMode === "drag") {
      const prevX = lienzoView.x;
      const prevY = lienzoView.y;
      const follow = 1 - Math.exp(-28 * dt);
      lienzoView.x += (lienzoTarget.x - lienzoView.x) * follow;
      lienzoView.y += (lienzoTarget.y - lienzoView.y) * follow;
      lienzoVel.x = (lienzoView.x - prevX) / dt;
      lienzoVel.y = (lienzoView.y - prevY) / dt;
    } else if (lienzoMode === "coast") {
      lienzoView.x += lienzoVel.x * dt;
      lienzoView.y += lienzoVel.y * dt;
      const drag = Math.exp(-2.4 * dt);
      lienzoVel.x *= drag;
      lienzoVel.y *= drag;
      if (Math.hypot(lienzoVel.x, lienzoVel.y) < 8) resumeLienzoDrift();
    } else if (lienzoMode === "wander") {
      if (now >= lienzoWishAt) aimLienzoWander(now);
      const ease = 1 - Math.exp(-0.45 * dt);
      lienzoVel.x += (lienzoWish.x - lienzoVel.x) * ease;
      lienzoVel.y += (lienzoWish.y - lienzoVel.y) * ease;
      lienzoView.x += lienzoVel.x * dt;
      lienzoView.y += lienzoVel.y * dt;
    }
    paintLienzoView();
  }
  lienzoLoop = requestAnimationFrame(lienzoTick);
}

function cookzFrame() {
  return document.querySelector('.frame[data-screen="cookz"]');
}

function lienzoPhotoRect(index, near) {
  const photos = [...document.querySelectorAll(`.lienzo__card[data-index="${index}"] .lienzo__photo`)];
  let best = photos[0];
  let bestD = Infinity;
  const nx = near ? near.left + near.width / 2 : window.innerWidth / 2;
  const ny = near ? near.top + near.height / 2 : window.innerHeight / 2;
  photos.forEach((photo) => {
    const rect = photo.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - nx;
    const dy = rect.top + rect.height / 2 - ny;
    const dist = dx * dx + dy * dy;
    if (dist < bestD) {
      bestD = dist;
      best = photo;
    }
  });
  return best ? best.getBoundingClientRect() : { left: 80, top: 80, width: 300, height: 360 };
}

function caseZoomSpec(box) {
  const scale = box.width / window.innerWidth;
  const endX = box.left;
  const endY = box.top + (box.height - window.innerHeight * scale) / 2;
  const small = `translate(${endX}px, ${endY}px) scale(${scale})`;
  return {
    scale,
    small,
    frames: [
      { transform: small, transformOrigin: "0px 0px" },
      { transform: "translate(0px, 0px) scale(1)", transformOrigin: "0px 0px" },
    ],
  };
}

function primeCaseZoom(box) {
  const frame = cookzFrame();
  if (!frame || !box) return;
  const spec = caseZoomSpec(box);
  lienzoCase.small = spec.small;
  frame.classList.add("is-case-zoom", "is-case-set");
  frame.classList.remove("is-case-ready");
  frame.style.transformOrigin = "0 0";
  frame.style.transform = spec.small;
}

function playCaseZoom() {
  const frame = cookzFrame();
  if (!frame || !lienzoCase) return;
  const spec = caseZoomSpec(lienzoCase);
  lienzoCase.small = spec.small;
  const gen = ++caseZoomGen;
  if (lienzoCaseAnim) lienzoCaseAnim.cancel();
  frame.classList.remove("is-case-set");
  frame.style.transformOrigin = "0 0";
  lienzoCaseAnim = frame.animate(spec.frames, {
    duration: LIENZO_ZOOM_MS,
    easing: LIENZO_ZOOM_EASE,
    fill: "both",
  });
  lienzoCaseAnim.onfinish = () => {
    if (gen !== caseZoomGen) return;
    frame.style.transform = "translate(0px, 0px) scale(1)";
    frame.classList.add("is-case-ready");
    openLienzoVenue.busy = false;
  };
}

function lienzoCoverSrc(index, img) {
  if (img?.currentSrc || img?.src) return img.currentSrc || img.src;
  const venue = VENUES[index];
  return venue?.hover ? venue.hover.replace(/hover\.jpg$/, "lienzo.jpg") : "";
}

function dropLienzoCover() {
  const cover = document.querySelector(".lienzo-cover");
  if (!cover) return;
  cover.getAnimations().forEach((anim) => {
    anim.onfinish = null;
    anim.cancel();
  });
  cover.remove();
}

function openLienzoVenue(index, img) {
  if (openLienzoVenue.busy) return;
  openLienzoVenue.busy = true;
  const rect = img ? img.getBoundingClientRect() : lienzoPhotoRect(index);
  lienzoCase = {
    index,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    src: lienzoCoverSrc(index, img),
  };
  lienzoReturn = true;
  lienzoHold = true;
  selected = index;
  hovering = index;
  cookzSlotVenue = null;
  if (lienzoReduced()) {
    lienzoZoom = null;
    go("cookz");
    openLienzoVenue.busy = false;
    return;
  }
  lienzoZoom = "in";
  go("cookz");
}

function shrinkLienzoCase() {
  if (shrinkLienzoCase.busy) return;
  const frame = cookzFrame();
  const finish = () => {
    shrinkLienzoCase.busy = false;
    openLienzoVenue.busy = false;
    if (lienzoCaseAnim) {
      lienzoCaseAnim.onfinish = null;
      lienzoCaseAnim.cancel();
      lienzoCaseAnim = null;
    }
    if (frame) {
      frame.classList.add("is-case-cut");
      frame.getAnimations().forEach((anim) => {
        anim.onfinish = null;
        anim.cancel();
      });
      frame.style.opacity = "";
      frame.style.transform = "";
      frame.style.transformOrigin = "";
      frame.classList.remove("is-case-zoom", "is-case-set", "is-case-ready");
    }
    dropLienzoCover();
    lienzoZoom = null;
    lienzoReturn = false;
    go("cookz");
    if (frame) requestAnimationFrame(() => frame.classList.remove("is-case-cut"));
  };
  if (!frame || lienzoReduced() || !lienzoCase) {
    shrinkLienzoCase.busy = true;
    finish();
    return;
  }
  shrinkLienzoCase.busy = true;
  frame.classList.remove("is-case-ready");
  if (lienzoCaseAnim) {
    lienzoCaseAnim.onfinish = null;
    lienzoCaseAnim.cancel();
    lienzoCaseAnim = null;
  }
  frame.style.transformOrigin = "0 0";
  frame.style.transform = "translate(0px, 0px) scale(1)";
  const box = lienzoCase;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  dropLienzoCover();
  const cover = document.createElement("img");
  cover.className = "lienzo-cover";
  cover.alt = "";
  cover.draggable = false;
  cover.src = box.src || "";
  cover.style.left = "0px";
  cover.style.top = "0px";
  cover.style.width = `${vw}px`;
  cover.style.height = `${vh}px`;
  cover.style.opacity = "0";
  document.body.append(cover);
  frame.animate(
    [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.62 },
      { opacity: 0, offset: 1 },
    ],
    { duration: 320, easing: "linear", fill: "forwards" },
  );
  cover.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration: 220, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  );
  const gen = ++caseZoomGen;
  const anim = cover.animate(
    [
      { left: "0px", top: "0px", width: `${vw}px`, height: `${vh}px` },
      { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` },
    ],
    { duration: LIENZO_ZOOM_MS, delay: 180, easing: LIENZO_ZOOM_EASE, fill: "both" },
  );
  lienzoCaseAnim = anim;
  let closed = false;
  const done = () => {
    if (closed || gen !== caseZoomGen) return;
    closed = true;
    finish();
  };
  anim.onfinish = done;
}

function bindLienzo() {
  const board = $("#lienzo");
  const world = $("#lienzo-world");
  if (!board || !world || board.dataset.bound === "1") return;
  board.dataset.bound = "1";

  let drag = null;

  board.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    lienzoHold = false;
    lienzoMode = "drag";
    lienzoTarget.x = lienzoView.x;
    lienzoTarget.y = lienzoView.y;
    lienzoVel.x = 0;
    lienzoVel.y = 0;
    drag = {
      x: e.clientX,
      y: e.clientY,
      ox: lienzoView.x,
      oy: lienzoView.y,
      moved: false,
      card: e.target.closest(".lienzo__card"),
    };
    board.classList.add("is-grab");
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    startLienzoLoop();
  });
  board.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    lienzoTarget.x = drag.ox + dx;
    lienzoTarget.y = drag.oy + dy;
  });
  const endDrag = () => {
    if (!drag) return;
    const card = drag.card;
    const moved = drag.moved;
    drag = null;
    board.classList.remove("is-grab");
    if (!moved && card) {
      lienzoVel.x = 0;
      lienzoVel.y = 0;
      openLienzoVenue(Number(card.dataset.index), card.querySelector("img"));
      return;
    }
    lienzoMode = lienzoReduced() ? "still" : "coast";
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", () => {
    drag = null;
    board.classList.remove("is-grab");
    if (!lienzoReduced()) lienzoMode = "coast";
  });
  board.addEventListener("click", (e) => {
    e.preventDefault();
  });
  board.addEventListener("dragstart", (e) => {
    e.preventDefault();
  });
  board.addEventListener("selectstart", (e) => {
    e.preventDefault();
  });
  let wheelTimer = 0;
  let wheelStamp = 0;
  board.addEventListener(
    "wheel",
    (e) => {
      if (!board.closest(".frame")?.classList.contains("is-on")) return;
      e.preventDefault();
      if (e.ctrlKey || drag) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? board.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (!dx && !dy) return;
      const now = performance.now();
      const dt = wheelStamp ? Math.max(0.008, (now - wheelStamp) / 1000) : 0.016;
      wheelStamp = now;
      lienzoHold = false;
      lienzoMode = "still";
      lienzoView.x -= dx;
      lienzoView.y -= dy;
      lienzoTarget.x = lienzoView.x;
      lienzoTarget.y = lienzoView.y;
      lienzoVel.x = -dx / dt;
      lienzoVel.y = -dy / dt;
      paintLienzoView();
      startLienzoLoop();
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelStamp = 0;
        if (drag) return;
        lienzoMode = lienzoReduced() ? "still" : "coast";
      }, 90);
    },
    { passive: false },
  );
  window.addEventListener("resize", () => {
    if (!board.closest(".frame")?.classList.contains("is-on")) return;
    const next = lienzoField();
    if (next.tileW === lienzoTile.w && next.tileH === lienzoTile.h) return;
    buildLienzoField();
    paintLienzoView();
  });
}

const PASSED_KEY = "cookz-passed";
const PASSED_URL = "https://ikistvqinmhtvifsgoev.supabase.co/rest/v1/passed";
const PASSED_PUBLIC = "sb_publishable_hEb7K3aZDUsZPpvGzwij3g_tSg3lQ_u";

function bindPassed() {
  const board = $("#passed");
  const world = $("#passed-world");
  const form = $("#passed-form");
  if (!board || !world || board.dataset.bound === "1") return;
  board.dataset.bound = "1";

  const view = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };
  const wish = { x: 0, y: 0 };
  let wishAt = 0;
  let tile = { w: 1, h: 1 };
  let mode = "wander";
  let loop = 0;
  let last = 0;
  let placed = false;
  const note = $("#passed-note");

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const screenOn = () => board.closest(".frame")?.classList.contains("is-on");
  const foodLine = (text) => (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "—" && !/^total:/i.test(line))
    .join(", ");
  const PASSED_COPY = {
    en: {
      lead: "My recommendation",
      nombre: "Site name",
      comida: "Try this!",
      maps: "Paste the link",
      send: "Add",
      link: "See location",
      maybe: "Maybe you meant this?",
      japan: "That place is not in Japan",
      linkOnly: "Paste the map link",
      check: "Couldn't check the link",
      short: "Copy the link from the map's address bar",
    },
    es: {
      lead: "Mi recomendación",
      nombre: "Nombre del sitio",
      comida: "Prueba esto!",
      maps: "Pegar el link",
      send: "Añadir",
      link: "Descubrir ubicación",
      maybe: "¿Tal vez te refieras a este?",
      japan: "Ese sitio no está en Japón",
      linkOnly: "Pega el enlace del mapa",
      check: "No pude comprobar el enlace",
      short: "Copia el enlace de la barra del mapa",
    },
  };
  let passedLang = localStorage.getItem("cookz-passed-lang") === "en" ? "en" : "es";
  let remoteNotes = [];
  let remoteReady = false;
  const passedHeaders = {
    apikey: PASSED_PUBLIC,
    Authorization: `Bearer ${PASSED_PUBLIC}`,
    "Content-Type": "application/json",
  };
  const sameNote = (a, b) =>
    String(a?.nombre || "").trim() === String(b?.nombre || "").trim()
    && String(a?.comida || "").trim() === String(b?.comida || "").trim()
    && String(a?.maps || "").trim() === String(b?.maps || "").trim();
  const localNotes = () => {
    try { return JSON.parse(localStorage.getItem(PASSED_KEY)) || []; } catch { return []; }
  };
  const insertPassed = async (note) => {
    const body = {
      nombre: String(note.nombre).trim().slice(0, 120),
      comida: String(note.comida).trim().slice(0, 240),
      maps: String(note.maps).trim().slice(0, 500),
    };
    if (!body.nombre || !body.comida || !body.maps) return false;
    const res = await fetch(PASSED_URL, {
      method: "POST",
      headers: { ...passedHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    return res.ok;
  };
  const siteKey = (value) => String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const sameSite = (a, b) => {
    const ka = siteKey(a);
    const kb = siteKey(b);
    if (!ka || !kb) return false;
    return ka === kb || kb.startsWith(`${ka} `) || ka.startsWith(`${kb} `);
  };
  const matchSite = (nombre) => {
    const hits = entries().filter((entry) => sameSite(entry.nombre, nombre));
    hits.sort((a, b) =>
      Math.abs(siteKey(a.nombre).length - siteKey(nombre).length)
      - Math.abs(siteKey(b.nombre).length - siteKey(nombre).length));
    return hits[0] || null;
  };
  const coordsOf = (text) => {
    const at = text.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (at) return { lat: at[1], lon: at[2] };
    const pin = text.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (pin) return { lat: pin[1], lon: pin[2] };
    try {
      const url = new URL(text);
      const q = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("ll") || "";
      const pair = q.match(/^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if (pair) return { lat: pair[1], lon: pair[2] };
    } catch { /* not a url */ }
    return null;
  };
  const queryOf = (text) => {
    try {
      const url = new URL(text);
      const q = url.searchParams.get("query") || url.searchParams.get("q");
      if (q && !/^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/.test(q)) return q;
      const place = url.pathname.match(/\/place\/([^/]+)/);
      if (place) return decodeURIComponent(place[1]).replace(/\+/g, " ");
    } catch { /* a written address */ }
    return "";
  };
  const countryAt = async (coords, q) => {
    let res;
    try {
      res = await fetch(coords
        ? `https://photon.komoot.io/reverse?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lon)}`
        : `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`);
    } catch { return "check"; }
    if (!res.ok) return "check";
    let data;
    try { data = await res.json(); } catch { return "check"; }
    const code = data.features?.[0]?.properties?.countrycode;
    if (!code) return "japan";
    return code === "JP" ? "jp" : "japan";
  };
  const placeInJapan = async (text) => {
    const link = text.trim();
    if (!/^https?:\/\//i.test(link)) return "link";
    let coords = coordsOf(link);
    let q = coords ? "" : queryOf(link);
    if (!coords && !q) {
      try {
        const res = await fetch(link, { redirect: "follow" });
        const landed = res.url || "";
        coords = coordsOf(landed);
        q = coords ? "" : queryOf(landed);
      } catch { /* short links often hide the destination */ }
    }
    if (!coords && !q) return "short";
    return countryAt(coords, q);
  };
  let hintKind = "";
  let hintEntry = null;
  const copy = () => PASSED_COPY[passedLang];
  const paintHint = () => {
    const hint = form?.querySelector(".passed-form__hint");
    const line = form?.querySelector(".passed-form__hint-line");
    const site = form?.querySelector(".passed-form__hint-site");
    if (!hint || !line || !site) return;
    if (!hintKind) {
      hint.hidden = true;
      return;
    }
    line.textContent = copy()[hintKind] || "";
    if (hintKind === "maybe" && hintEntry) {
      site.hidden = false;
      site.textContent = hintEntry.nombre;
      site.dataset.nombre = hintEntry.nombre;
      site.dataset.maps = hintEntry.maps || "";
      site.dataset.comida = hintEntry.comida || "";
    } else site.hidden = true;
    hint.hidden = false;
  };
  const showHint = (kind, entry) => {
    hintKind = kind;
    hintEntry = entry || null;
    paintHint();
  };
  const hideHint = () => {
    hintKind = "";
    hintEntry = null;
    paintHint();
  };
  const fitFood = () => {
    const field = form?.querySelector('[name="comida"]');
    if (!field) return;
    const max = 22;
    const min = 11;
    let size = max;
    field.style.fontSize = `${size}px`;
    while (size > min && field.scrollHeight > field.clientHeight + 1) {
      size -= 1;
      field.style.fontSize = `${size}px`;
    }
  };
  const paintForm = () => {
    const text = copy();
    const lead = form?.querySelector(".passed-form__lead");
    if (lead) lead.textContent = text.lead;
    ["nombre", "comida", "maps"].forEach((key) => {
      const field = form?.querySelector(`[name="${key}"]`);
      if (!field) return;
      field.placeholder = text[key];
      field.setAttribute("aria-label", text[key]);
    });
    const send = form?.querySelector(".passed-form__send");
    if (send) send.textContent = text.send;
    $$("[data-passed-lang]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.passedLang === passedLang);
    });
    paintHint();
    fitFood();
  };
  const orderOf = (venue) => {
    const source = typeof COOKS !== "undefined" ? COOKS.find((item) => item.id === venue.id) : null;
    return source?.order?.[passedLang] || "";
  };
  const entries = () => {
    const cooks = VENUES.map((venue) => ({
      nombre: (venue.venueRomaji || venue.name || "").replace(/_/g, " "),
      maps: venue.mapsUrl || venue.addressLine || "",
      comida: foodLine(orderOf(venue)),
    })).filter((entry) => entry.nombre);
    const notes = remoteReady ? remoteNotes : localNotes();
    notes.forEach((item) => {
      if (!item?.nombre) return;
      const next = {
        nombre: String(item.nombre),
        maps: String(item.maps || ""),
        comida: String(item.comida || ""),
      };
      if (cooks.some((row) => sameNote(row, next))) return;
      cooks.push(next);
    });
    return cooks;
  };

  const paint = () => {
    const x = wrapLienzo(view.x, tile.w);
    const y = wrapLienzo(view.y, tile.h);
    world.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const build = () => {
    const list = entries();
    const box = board.getBoundingClientRect();
    const tileW = Math.max(Math.ceil(box.width * 1.7), 1280);
    const tileH = Math.max(Math.ceil(box.height * 1.7), 820);
    tile = { w: tileW, h: tileH };
    let seed = 11;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const copies = [];
    for (let n = 0; n < 2; n += 1) list.forEach((entry) => copies.push(entry));
    const spots = [];
    copies.forEach(() => {
      let spot = { x: rand() * (tileW - 180), y: rand() * (tileH - 48) };
      for (let n = 0; n < 24; n += 1) {
        const next = { x: 24 + rand() * (tileW - 220), y: 16 + rand() * (tileH - 64) };
        const clear = spots.every((point) => Math.hypot(point.x - next.x, point.y - next.y) > 118);
        spot = next;
        if (clear) break;
      }
      spots.push(spot);
    });
    world.replaceChildren();
    for (let ty = -1; ty <= 1; ty += 1) {
      for (let tx = -1; tx <= 1; tx += 1) {
        const cell = document.createElement("div");
        cell.className = "passed__tile";
        cell.style.width = `${tileW}px`;
        cell.style.height = `${tileH}px`;
        cell.style.transform = `translate3d(${tx * tileW}px, ${ty * tileH}px, 0)`;
        copies.forEach((entry, i) => {
          const word = document.createElement("button");
          word.type = "button";
          word.className = "passed__word";
          word.textContent = entry.nombre;
          word.style.left = `${spots[i].x}px`;
          word.style.top = `${spots[i].y}px`;
          word.dataset.nombre = entry.nombre;
          word.dataset.maps = entry.maps;
          word.dataset.comida = entry.comida;
          cell.append(word);
        });
        world.append(cell);
      }
    }
  };

  const hideNote = () => {
    if (note) note.hidden = true;
  };

  const openNote = (word) => {
    if (!note) return;
    const nombre = word.dataset.nombre || "";
    const maps = word.dataset.maps || "";
    const comida = word.dataset.comida || "";
    note.querySelector(".passed-note__name").textContent = nombre;
    const link = note.querySelector(".passed-note__link");
    const food = note.querySelector(".passed-note__food");
    const url = /^https?:\/\//i.test(maps);
    link.textContent = copy().link;
    link.href = url ? maps : maps ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(maps)}` : "#";
    link.hidden = !maps;
    food.textContent = comida;
    food.hidden = !comida;
    note.hidden = false;
    const box = word.getBoundingClientRect();
    const width = note.offsetWidth || 180;
    const height = note.offsetHeight || 110;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, box.left));
    const top = Math.min(window.innerHeight - height - 12, Math.max(12, box.bottom + 10));
    note.style.left = `${left}px`;
    note.style.top = `${top}px`;
  };

  const aim = (now) => {
    const speed = 8 + Math.random() * 12;
    const angle = Math.random() * Math.PI * 2;
    wish.x = Math.cos(angle) * speed;
    wish.y = Math.sin(angle) * speed;
    wishAt = now + 2800 + Math.random() * 3200;
  };

  const tick = (now) => {
    if (!screenOn()) {
      loop = 0;
      return;
    }
    const prev = last || now;
    const dt = Math.min(0.032, (now - prev) / 1000);
    last = now;
    if (dt > 0) {
      if (mode === "drag") {
        const px = view.x;
        const py = view.y;
        const follow = 1 - Math.exp(-28 * dt);
        view.x += (target.x - view.x) * follow;
        view.y += (target.y - view.y) * follow;
        vel.x = (view.x - px) / dt;
        vel.y = (view.y - py) / dt;
      } else if (mode === "coast") {
        view.x += vel.x * dt;
        view.y += vel.y * dt;
        const drag = Math.exp(-2.4 * dt);
        vel.x *= drag;
        vel.y *= drag;
        if (Math.hypot(vel.x, vel.y) < 8) {
          mode = reduced() ? "still" : "wander";
          if (!wishAt) aim(now);
        }
      } else if (mode === "wander") {
        if (now >= wishAt) aim(now);
        const ease = 1 - Math.exp(-0.45 * dt);
        vel.x += (wish.x - vel.x) * ease;
        vel.y += (wish.y - vel.y) * ease;
        view.x += vel.x * dt;
        view.y += vel.y * dt;
      }
      paint();
    }
    loop = requestAnimationFrame(tick);
  };

  const start = () => {
    if (loop) return;
    last = 0;
    loop = requestAnimationFrame(tick);
  };

  const place = () => {
    if (!world.childElementCount) build();
    if (!placed) {
      const box = board.getBoundingClientRect();
      view.x = (box.width - tile.w) / 2;
      view.y = (box.height - tile.h) / 2;
      placed = true;
    }
    if (mode !== "drag" && mode !== "coast") mode = reduced() ? "still" : "wander";
    if (!wishAt) aim(performance.now());
    paint();
    start();
  };
  window.placePassed = place;

  let drag = null;
  board.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    mode = "drag";
    target.x = view.x;
    target.y = view.y;
    vel.x = 0;
    vel.y = 0;
    drag = {
      x: e.clientX,
      y: e.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
      word: e.target.closest(".passed__word"),
    };
    board.classList.add("is-grab");
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    start();
  });
  board.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    target.x = drag.ox + dx;
    target.y = drag.oy + dy;
  });
  const endDrag = () => {
    if (!drag) return;
    const word = drag.word;
    const moved = drag.moved;
    drag = null;
    board.classList.remove("is-grab");
    mode = reduced() ? "still" : "coast";
    if (!moved && word) openNote(word);
    else hideNote();
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", endDrag);
  board.addEventListener("dragstart", (e) => e.preventDefault());

  let wheelTimer = 0;
  let wheelStamp = 0;
  board.addEventListener("wheel", (e) => {
    if (!screenOn()) return;
    e.preventDefault();
    if (e.ctrlKey || drag) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? board.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (!dx && !dy) return;
    const now = performance.now();
    const dt = wheelStamp ? Math.max(0.008, (now - wheelStamp) / 1000) : 0.016;
    wheelStamp = now;
    mode = "still";
    view.x -= dx;
    view.y -= dy;
    target.x = view.x;
    target.y = view.y;
    vel.x = -dx / dt;
    vel.y = -dy / dt;
    paint();
    start();
    window.clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => {
      wheelStamp = 0;
      if (drag) return;
      mode = reduced() ? "still" : "coast";
    }, 90);
  }, { passive: false });

  window.addEventListener("resize", () => {
    if (!screenOn()) return;
    build();
    paint();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!note || note.hidden) return;
    if (e.target.closest(".passed-note") || e.target.closest(".passed__word")) return;
    hideNote();
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form.dataset.sending === "1") return;
      const data = new FormData(form);
      const note = {
        maps: String(data.get("maps") || "").trim(),
        nombre: String(data.get("nombre") || "").trim(),
        comida: String(data.get("comida") || "").trim(),
      };
      if (!note.maps || !note.nombre || !note.comida) return;
      const existing = matchSite(note.nombre);
      if (existing) {
        showHint("maybe", existing);
        return;
      }
      form.dataset.sending = "1";
      const send = form.querySelector(".passed-form__send");
      const where = await placeInJapan(note.maps);
      if (where !== "jp") {
        form.dataset.sending = "";
        showHint(where === "link" ? "linkOnly" : where === "short" ? "short" : where === "check" ? "check" : "japan");
        return;
      }
      let ok = false;
      try { ok = await insertPassed(note); } catch { ok = false; }
      form.dataset.sending = "";
      if (!ok) {
        if (send) {
          const fail = passedLang === "en" ? "Not saved" : "No se guardó";
          send.textContent = fail;
          window.setTimeout(() => { if (send.textContent === fail) paintForm(); }, 1600);
        }
        return;
      }
      if (!remoteNotes.some((row) => sameNote(row, note))) remoteNotes.push(note);
      remoteReady = true;
      hideHint();
      form.reset();
      paintForm();
      build();
      paint();
    });
    form.addEventListener("input", (e) => {
      hideHint();
      if (e.target?.name === "comida") fitFood();
    });
    form.querySelector(".passed-form__hint-site")?.addEventListener("click", (e) => {
      openNote(e.currentTarget);
    });
  }

  $$("[data-passed-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.passedLang === "en" ? "en" : "es";
      if (next === passedLang) return;
      passedLang = next;
      localStorage.setItem("cookz-passed-lang", passedLang);
      paintForm();
      hideNote();
      if (!screenOn()) return;
      build();
      paint();
    });
  });
  const uploadLocal = async () => {
    const notes = localNotes().filter((item) => item?.nombre && item?.comida && item?.maps);
    if (!notes.length) return;
    localStorage.removeItem(PASSED_KEY);
    const left = [];
    for (const item of notes) {
      if (remoteNotes.some((row) => sameNote(row, item))) continue;
      let ok = false;
      try { ok = await insertPassed(item); } catch { ok = false; }
      if (ok) remoteNotes.push({ nombre: item.nombre, comida: item.comida, maps: item.maps });
      else left.push(item);
    }
    if (left.length) localStorage.setItem(PASSED_KEY, JSON.stringify(left));
    else localStorage.removeItem(PASSED_KEY);
  };
  const loadPassed = async () => {
    try {
      const res = await fetch(`${PASSED_URL}?select=nombre,comida,maps&order=created_at.asc`, {
        headers: passedHeaders,
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      const fresh = rows.filter((item) => item?.nombre);
      remoteNotes.forEach((item) => {
        if (!fresh.some((row) => sameNote(row, item))) fresh.push(item);
      });
      remoteNotes = fresh;
      remoteReady = true;
      await uploadLocal();
      if (screenOn()) {
        build();
        paint();
      }
    } catch { /* the venue names stay; notes wait for the next visit */ }
  };
  paintForm();
  loadPassed();
}

function apply() {
  const { screen, sub } = route();
  if (screen === "lienzo" || screen === "descartes") {
    location.replace("#/cookz");
    return;
  }
  const known = ["home", "japan2026", "manifest", "cookz", "passed-along", "konbini"];
  const current = known.includes(screen) ? screen : "home";
  if (current === "konbini") {
    if (sub === "tickets") {
      konbiniView = "tickets-all";
      if (location.hash !== "#/konbini/tickets-all") location.replace("#/konbini/tickets-all");
    } else {
      konbiniView = ["tickets-all", "tracker", "favos", "stats"].includes(sub) ? sub : "hub";
    }
  }
  const caseOpen = current === "cookz" && (lienzoZoom === "in" || lienzoReturn);
  if (caseOpen && lienzoZoom === "in") primeCaseZoom(lienzoCase);
  show(caseOpen ? "cookz" : current === "cookz" ? "lienzo" : current);
  if (current === "cookz" && !caseOpen) placeLienzo();
  if (current === "passed-along" && window.placePassed) window.placePassed();
  const cookzBack = document.querySelector(".back--cookz");
  if (caseOpen && cookzBack) cookzBack.dataset.goto = "cookz";
  if (!caseOpen && current !== "cookz") lienzoReturn = false;
  if (caseOpen) {
    cookzLandingIndex = pickCookzLandingIndex();
    paintCookz();
    if (lienzoZoom === "in") {
      lienzoZoom = "hold";
      playCaseZoom();
    }
  }
}

function buildCookzList(container) {
  container.innerHTML = "";
  VENUES.forEach((venue, i) => {
    if (i > 0) container.append(document.createTextNode(" "));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = venue.name.replace(/_/g, " ").toUpperCase();
    btn.addEventListener("mouseenter", () => {
      hovering = i;
      paintCookz();
    });
    btn.addEventListener("click", () => {
      selected = i;
      hovering = i;
      paintCookz();
    });
    container.append(btn);
  });
}

function buildList(ul, interactive) {
  ul.innerHTML = "";
  VENUES.forEach((venue, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = venue.name;
    if (interactive) {
      btn.addEventListener("mouseenter", () => {
        hovering = i;
        paintCookz();
      });
    }
    li.append(btn);
    ul.append(li);
  });
}

const TICKET_MIN = 200;
const FLIP_MS = 620;
const FLIP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
let sortLinePrev = null;

function createTicketCard(ticket) {
  const card = document.createElement("article");
  card.className = "t-card";
  card.dataset.ktId = ticket.ktId || "";
  const media = document.createElement("div");
  media.className = "t-card__media";
  const img = document.createElement("img");
  img.src = ticket.src;
  img.alt = ticket.ktId || "Ticket";
  img.loading = "lazy";
  media.append(img);
  card.append(media, buildTicketInfoEl(ticket));
  return card;
}

function flipReorderTickets(track, sorted) {
  const cards = [...track.querySelectorAll(".t-card")];
  const byId = new Map(cards.map((c) => [c.dataset.ktId, c]));

  track.classList.add("is-sorting");
  window.setTimeout(() => track.classList.remove("is-sorting"), FLIP_MS + 50);

  cards.forEach((card) => {
    card.getAnimations().forEach((a) => a.cancel());
    card.classList.remove("is-flipping");
    card.style.transform = "";
  });

  const first = new Map();
  cards.forEach((card) => {
    first.set(card.dataset.ktId, card.getBoundingClientRect());
  });

  sorted.forEach((ticket, index) => {
    const card = byId.get(ticket.ktId);
    if (card) card.style.order = String(index);
  });

  requestAnimationFrame(() => {
    sorted.forEach((ticket) => {
      const card = byId.get(ticket.ktId);
      if (!card) return;
      const prev = first.get(ticket.ktId);
      const last = card.getBoundingClientRect();
      if (!prev) return;
      const dx = prev.left - last.left;
      const dy = prev.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      card.classList.add("is-flipping");
      card
        .animate(
          [
            { transform: `translate3d(${dx}px, ${dy}px, 0)` },
            { transform: "translate3d(0, 0, 0)" },
          ],
          { duration: FLIP_MS, easing: FLIP_EASE, fill: "forwards" },
        )
        .addEventListener(
          "finish",
          () => {
            card.classList.remove("is-flipping");
            card.style.transform = "";
          },
          { once: true },
        );
    });
  });
}

function layoutTickets({ reorder = false, force = false } = {}) {
  const windowEl = $("#t-window");
  const track = $("#t-track");
  if (!windowEl || !track) return;
  if (!TICKETS.length) return;
  const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
  const width = track.clientWidth;
  const cols = Math.max(1, Math.floor((width + gap) / (TICKET_MIN + gap)));
  const sorted = getSortedTickets();
  const orderKey = sorted.map((t) => t.ktId).join("|");
  const layoutKey = `${cols}|${orderKey}|${ticketSort}`;

  track.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

  const cards = track.querySelectorAll(".t-card");
  const cardCount = cards.length;
  if (cardCount !== sorted.length) force = true;

  if (!force && cardCount > 0 && track.dataset.layoutKey?.startsWith(`${cols}|`)) {
    if (track.dataset.layoutKey === layoutKey && !reorder) return;
    flipReorderTickets(track, sorted);
    track.dataset.layoutKey = layoutKey;
    window.setTimeout(() => positionTicketSortLine(false), FLIP_MS + 40);
    return;
  }
  if (!force && track.dataset.layoutKey === layoutKey) return;

  track.dataset.layoutKey = layoutKey;
  track.innerHTML = "";
  sorted.forEach((ticket, index) => {
    const card = createTicketCard(ticket);
    card.style.order = String(index);
    track.append(card);
  });
}

function buildFavos() {
  const row = $("#favos-picks");
  row.innerHTML = "";
  FAVOS.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.favosId = item.id;
    btn.classList.remove("is-on");
    const mark = document.createElement("img");
    mark.className = "favos-mark";
    mark.alt = "";
    mark.draggable = false;
    mark.src = item.icon;
    btn.setAttribute("aria-label", item.label);
    btn.append(mark);
    btn.addEventListener("click", () => {
      $$("#favos-picks button").forEach((b, j) => b.classList.toggle("is-on", j === i));
      const cap = $("#favos-cap");
      const en = cap?.querySelector(".k-hero-cap__en");
      const ja = cap?.querySelector(".k-hero-cap__ja");
      if (en) en.textContent = item.en;
      if (ja) ja.textContent = item.ja;
      if (window.favosBottle) window.favosBottle.setPick(i);
    });
    row.append(btn);
  });
  bindFavosWave(row);
  if (window.favosBottle?.bakeThumbnails) window.favosBottle.bakeThumbnails();
}

function bindFavosWave(row) {
  if (!row || row.dataset.wave === "1") return;
  row.dataset.wave = "1";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let x = 0;
  let t = 0;
  let vx = 0;

  const place = (clientX) => {
    const now = performance.now();
    const dt = Math.max(16, now - t);
    const raw = t ? (clientX - x) / dt : 0;
    x = clientX;
    t = now;
    vx = vx * 0.62 + raw * 0.38;
    const speed = Math.min(Math.abs(vx), 2);
    const dir = vx < 0 ? -1 : 1;
    row.querySelectorAll("button").forEach((btn) => {
      const mark = btn.querySelector(".favos-mark");
      const box = btn.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const over = clientX >= box.left && clientX <= box.right;
      const delta = cx - clientX;
      const behind = dir > 0 ? -delta : delta;
      const dist = Math.abs(delta);
      const reach = behind > 0 ? 90 + speed * 240 : 42 + speed * 36;
      const n = over ? 1 : Math.max(0, 1 - dist / reach);
      const base = btn.classList.contains("is-on") ? 44 : 0;
      const lift = base + n * n * (28 + (behind > 0 ? speed * 10 : 0));
      if (mark) mark.style.transform = lift < 1 ? "" : `translateY(${(-lift).toFixed(1)}px)`;
    });
  };

  row.addEventListener("pointermove", (e) => place(e.clientX));
  row.addEventListener("pointerleave", () => {
    t = 0;
    vx = 0;
    row.querySelectorAll(".favos-mark").forEach((mark) => {
      mark.style.transform = "";
    });
  });
}

function cleanManifest(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["p", "br", "strong", "em", "b", "i"]);
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }
      const tag = child.tagName.toLowerCase();
      walk(child);
      if (tag === "div") {
        const p = doc.createElement("p");
        while (child.firstChild) p.append(child.firstChild);
        child.replaceWith(p);
        return;
      }
      if (!allowed.has(tag)) {
        child.replaceWith(...child.childNodes);
        return;
      }
      [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
    });
  };
  walk(doc.body);
  return doc.body.innerHTML.trim();
}

let japanSetWidth = 0;
let japanLoopStart = 0;
let japanPosition = 0;
let japanFilmLaid = false;
let japanVelocity = 0;
let japanTickRaf = 0;
let japanPointerDown = false;
let japanPointerLastX = 0;
let japanPointerVel = 0;
let japanDragDistance = 0;

function cloneJapanCard(card) {
  const clone = card.cloneNode(true);
  clone.setAttribute("aria-hidden", "true");
  clone.tabIndex = -1;
  return clone;
}

function measureJapanLoop() {
  const track = document.getElementById("j-window")?.querySelector(".j-track");
  if (!track) return false;
  const cards = [...track.querySelectorAll(".j-card")];
  if (cards.length < 9) return false;
  const start = cards[3].offsetLeft;
  const width = cards[6].offsetLeft - cards[3].offsetLeft;
  if (!width) return false;
  japanLoopStart = start;
  japanSetWidth = width;
  return true;
}

function applyJapanTransform() {
  const track = document.getElementById("j-window")?.querySelector(".j-track");
  if (!track || !japanSetWidth) return;
  const w = japanSetWidth;
  const start = japanLoopStart;
  let local = japanPosition - start;
  local = ((local % w) + w) % w;
  track.style.transform = `translate3d(${-(start + local)}px, 0, 0)`;
  syncJapanLogo();
}

function syncJapanLogo() {
  const frame = document.querySelector('.frame[data-screen="japan2026"]');
  const base = frame?.querySelector(".logo:not(.logo--mix)");
  const mix = frame?.querySelector(".logo--mix");
  if (!base || !mix) return;
  const lr = base.getBoundingClientRect();
  let hit = null;
  let area = 0;
  frame.querySelectorAll(".j-card--konbini video").forEach((video) => {
    const vr = video.getBoundingClientRect();
    const left = Math.max(lr.left, vr.left);
    const right = Math.min(lr.right, vr.right);
    const top = Math.max(lr.top, vr.top);
    const bottom = Math.min(lr.bottom, vr.bottom);
    const w = right - left;
    const h = bottom - top;
    if (w > 0.5 && h > 0.5 && w * h > area) {
      area = w * h;
      hit = { x: left - lr.left, y: top - lr.top, w, h };
    }
  });
  base.style.maskImage = "";
  base.style.webkitMaskImage = "";
  if (!hit) {
    base.style.clipPath = "";
    mix.style.clipPath = "inset(100%)";
    return;
  }
  const right = Math.max(0, lr.width - (hit.x + hit.w));
  const bottom = Math.max(0, lr.height - (hit.y + hit.h));
  const x2 = hit.x + hit.w;
  const y2 = hit.y + hit.h;
  mix.style.clipPath = `inset(${hit.y}px ${right}px ${bottom}px ${hit.x}px)`;
  base.style.clipPath = `path(evenodd, "M 0 0 H ${lr.width} V ${lr.height} H 0 Z M ${hit.x} ${hit.y} H ${x2} V ${y2} H ${hit.x} Z")`;
}

function japanTick() {
  if (Math.abs(japanVelocity) < 0.06) {
    japanVelocity = 0;
    japanTickRaf = 0;
    return;
  }
  japanPosition += japanVelocity;
  japanVelocity *= 0.94;
  applyJapanTransform();
  japanTickRaf = requestAnimationFrame(japanTick);
}

function japanKickInertia() {
  if (!japanTickRaf) japanTickRaf = requestAnimationFrame(japanTick);
}

function onJapanWheel(e) {
  const japan = document.querySelector('.frame[data-screen="japan2026"]');
  if (!japan?.classList.contains("is-on")) return;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!delta) return;
  e.preventDefault();
  japanPosition += delta;
  japanVelocity += delta * 0.14;
  applyJapanTransform();
  japanKickInertia();
}

function setupJapanCarousel() {
  const rail = document.getElementById("j-window");
  const track = rail?.querySelector(".j-track");
  if (!track || track.dataset.japanReady === "1") return;
  const cards = [...track.querySelectorAll(".j-card")];
  if (cards.length !== 3) return;

  const beforeFrag = document.createDocumentFragment();
  const afterFrag = document.createDocumentFragment();
  cards.forEach((card) => {
    beforeFrag.appendChild(cloneJapanCard(card));
    afterFrag.appendChild(cloneJapanCard(card));
  });
  track.insertBefore(beforeFrag, cards[0]);
  track.appendChild(afterFrag);
  track.dataset.japanReady = "1";
  track.querySelectorAll(".j-card--konbini video").forEach((video) => {
    video.muted = true;
    video.play().catch(() => {});
    const lay = () => {
      if (japanFilmLaid) return;
      if (!video.videoWidth) return;
      japanFilmLaid = true;
      layoutJapan();
    };
    if (video.readyState >= 1) lay();
    else video.addEventListener("loadedmetadata", lay, { once: true });
  });
}

function initJapanMotion() {
  const rail = document.getElementById("j-window");
  const track = rail?.querySelector(".j-track");
  const japan = document.querySelector('.frame[data-screen="japan2026"]');
  if (!rail || !track || !japan || rail.dataset.japanMotion === "1") return;
  rail.dataset.japanMotion = "1";

  japan.addEventListener("wheel", onJapanWheel, { passive: false });

  rail.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".j-card")) return;
      japanPointerDown = true;
      japanDragDistance = 0;
      japanPointerLastX = e.clientX;
      japanPointerVel = 0;
      japanVelocity = 0;
      rail.classList.add("is-dragging");
      rail.setPointerCapture(e.pointerId);
    },
    { passive: true },
  );

  rail.addEventListener(
    "pointermove",
    (e) => {
      if (!japanPointerDown) return;
      const dx = japanPointerLastX - e.clientX;
      japanPointerLastX = e.clientX;
      japanDragDistance += Math.abs(dx);
      japanPointerVel = dx;
      japanPosition += dx;
      applyJapanTransform();
    },
    { passive: true },
  );

  const endDrag = (e) => {
    if (!japanPointerDown) return;
    japanPointerDown = false;
    rail.classList.remove("is-dragging");
    if (e.pointerId) rail.releasePointerCapture(e.pointerId);
    japanVelocity = japanPointerVel * 0.85;
    japanKickInertia();
  };
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);

  track.querySelectorAll(".j-card").forEach((card) => {
    card.addEventListener(
      "pointerdown",
      () => {
        japanDragDistance = 0;
      },
      { passive: true },
    );
  });

  const blend = document.getElementById("j-logo-blend");
  const mix = japan.querySelector(".logo--mix");
  if (blend && mix) {
    mix.style.mixBlendMode = "saturation";
    blend.value = "saturation";
  }
}

function centerJapanKonbini() {
  const track = document.getElementById("j-window")?.querySelector(".j-track");
  if (!track) return;
  const cookz = track.querySelector(".j-card--cookz:not([aria-hidden])");
  const konbini = track.querySelector(".j-card--konbini:not([aria-hidden])");
  const passed = track.querySelector(".j-card--passed:not([aria-hidden])");
  if (!cookz || !konbini || !passed) return;

  track.querySelectorAll(".j-card--konbini").forEach((el) => {
    el.style.transform = "";
  });

  const imgCenter = (card) => {
    const img = card.querySelector("video, img");
    if (!img) return card.offsetLeft + card.offsetWidth / 2;
    const trackRect = track.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    return imgRect.left + imgRect.width / 2 - trackRect.left;
  };

  const cookzX = imgCenter(cookz);
  const passedX = imgCenter(passed);
  const visualMid = (cookzX + passedX) / 2;
  const konbiniX = imgCenter(konbini);
  const shift = visualMid - konbiniX;

  track.querySelectorAll(".j-card--konbini").forEach((el) => {
    el.style.transform = shift ? `translateX(${shift}px)` : "";
  });

  return visualMid;
}

function layoutJapanHeader() {
  const frame = document.querySelector('.frame[data-screen="japan2026"]');
  const logo = frame?.querySelector(".logo");
  const title = frame?.querySelector(".section-title");
  if (!frame || !logo || !title) return;
  const frameTop = frame.getBoundingClientRect().top;
  const headerBottom = Math.max(
    logo.getBoundingClientRect().bottom,
    title.getBoundingClientRect().bottom,
  );
  const gap = Math.max(12, frame.clientHeight * 0.02);
  frame.style.setProperty("--japan-header", `${headerBottom - frameTop + gap}px`);
}

function layoutJapan() {
  layoutJapanHeader();
  setupJapanCarousel();
  const rail = document.getElementById("j-window");
  const track = rail?.querySelector(".j-track");
  if (!rail || !track) return;

  track.style.transform = "none";
  const visualMid = centerJapanKonbini();
  if (!measureJapanLoop()) return;

  if (visualMid != null) {
    japanPosition = visualMid - rail.clientWidth / 2;
  } else {
    const cards = [...track.querySelectorAll(".j-card")];
    const focus = cards[4] || cards[3];
    japanPosition = focus.offsetLeft + focus.offsetWidth / 2 - rail.clientWidth / 2;
  }
  applyJapanTransform();
}

function initManifest() {
  const el = $("#manifest-copy");
  if (!el) return;
  const key = "cookz-manifest-html";
  const saved = localStorage.getItem(key);
  if (saved) el.innerHTML = saved;

  const note = $("#manifest-saved");
  const store = () => {
    const html = cleanManifest(el.innerHTML);
    localStorage.setItem(key, html);
    if (note) note.hidden = false;
  };

  el.addEventListener("input", store);
  $$("[data-fmt]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      el.focus();
      document.execCommand(btn.dataset.fmt, false);
      store();
    });
  });
}

function bindTicketRain() {
  const link = document.querySelector('.k-menu a[data-extra="tickets-all"]');
  const rain = document.querySelector(".k-rain");
  const frame = document.querySelector('.frame[data-screen="konbini"]');
  if (!link || !rain || !frame) return;
  let hideTimer = 0;

  const sources = () => {
    const list = (TICKETS || []).filter((t) => t.src);
    if (list.length <= 4) return list.map((t) => t.src);
    const picked = [];
    const seen = new Set();
    for (const t of list) {
      const chain = t.establishment?.chain || t.ktId;
      if (seen.has(chain)) continue;
      seen.add(chain);
      picked.push(t);
      if (picked.length === 4) break;
    }
    for (const t of list) {
      if (picked.length >= 4) break;
      if (picked.includes(t)) continue;
      picked.push(t);
    }
    return picked.map((t) => t.src);
  };

  const build = () => {
    const srcs = sources();
    if (!srcs.length) return;
    const rand = (a, b) => a + Math.random() * (b - a);
    const host = rain.getBoundingClientRect();
    const menu = link.closest(".k-menu").getBoundingClientRect();
    const gap = 28;
    const zone = {
      l: menu.left - host.left - gap,
      t: menu.top - host.top - gap,
      r: menu.right - host.left + gap,
      b: menu.bottom - host.top + gap,
    };
    const ticketW = Math.min(240, Math.max(168, window.innerWidth * 0.17));
    const ticketH = ticketW * 2.15;
    const toss = () => (Math.random() < 0.5 ? -1 : 1) * rand(12, 34);
    const size = () => rand(0.84, 1.12);
    const bounds = (x, y, tilt, scale) => {
      const rad = (Math.abs(tilt) * Math.PI) / 180;
      const w = ticketW * scale;
      const h = ticketH * scale;
      const boxW = w * Math.cos(rad) + h * Math.sin(rad);
      const boxH = h * Math.cos(rad) + w * Math.sin(rad);
      const cx = x + ticketW / 2;
      const cy = y + ticketH / 2;
      return { l: cx - boxW / 2, t: cy - boxH / 2, r: cx + boxW / 2, b: cy + boxH / 2, cx, cy };
    };
    const overlaps = (box) => !(box.r < zone.l || box.l > zone.r || box.b < zone.t || box.t > zone.b);
    const cols = Math.ceil(host.width / 110) + 2;
    const rows = Math.ceil(host.height / 150) + 2;
    const frag = document.createDocumentFragment();
    const mcx = (menu.left + menu.right) / 2 - host.left;
    const mcy = (menu.top + menu.bottom) / 2 - host.top;
    let i = 0;
    const addTicket = (x, y, box, tilt, scale) => {
      const img = document.createElement("img");
      img.className = "k-rain__ticket";
      img.src = srcs[i % srcs.length];
      img.alt = "";
      img.draggable = false;
      const awayX = box.cx >= mcx ? 1 : -1;
      const awayY = box.cy >= mcy ? 1 : -1;
      const pad = 48 + rand(0, 72);
      const fx = awayX > 0 ? host.width - box.l + pad : -(box.r + pad);
      const fy = awayY > 0 ? host.height - box.t + pad : -(box.b + pad);
      const norm = Math.min(1, Math.hypot((box.cx - mcx) / (host.width * 0.5), (box.cy - mcy) / (host.height * 0.5)));
      img.style.setProperty("--x", `${x.toFixed(1)}px`);
      img.style.setProperty("--y", `${y.toFixed(1)}px`);
      img.style.setProperty("--r", `${tilt.toFixed(1)}deg`);
      img.style.setProperty("--s", scale.toFixed(3));
      img.style.setProperty("--fx", `${fx.toFixed(1)}px`);
      img.style.setProperty("--fy", `${fy.toFixed(1)}px`);
      img.style.setProperty("--d", `${((1 - norm) * 0.36).toFixed(3)}s`);
      img.style.setProperty("--dur", `${(0.88 + (1 - norm) * 0.34).toFixed(2)}s`);
      frag.append(img);
      i += 1;
    };
    const onScreen = (box) => box.b > 0 && box.t < host.height && box.r > 0 && box.l < host.width;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (i >= 170) break;
        const tilt = toss();
        const scale = size();
        let x = ((c - 0.5) / Math.max(1, cols - 1)) * (host.width + ticketW * 0.35) - ticketW * 0.2 + rand(-36, 36);
        let y = ((r - 0.5) / Math.max(1, rows - 1)) * (host.height + ticketH * 0.35) - ticketH * 0.55 + rand(-32, 32);
        let box = bounds(x, y, tilt, scale);
        let guard = 0;
        while (overlaps(box) && guard < 3) {
          const pushLeft = box.r - zone.l;
          const pushRight = zone.r - box.l;
          const pushUp = box.b - zone.t;
          const pushDown = zone.b - box.t;
          const horizontal = Math.abs(box.cx - mcx) >= Math.abs(box.cy - mcy);
          if (horizontal) x += pushLeft < pushRight ? -pushLeft : pushRight;
          else y += pushUp < pushDown ? -pushUp : pushDown;
          box = bounds(x, y, tilt, scale);
          guard += 1;
        }
        if (overlaps(box) || !onScreen(box)) continue;
        addTicket(x, y, box, tilt, scale);
      }
    }
    const step = ticketW * 0.48;
    for (let x0 = -ticketW * 0.4; x0 < host.width + ticketW * 0.15; x0 += step) {
      const tilt = toss();
      const scale = size();
      let x = x0 + rand(-30, 30);
      let y = zone.t - ticketH * scale + rand(-46, 18);
      let box = bounds(x, y, tilt, scale);
      let guard = 0;
      while (overlaps(box) && guard < 3) {
        y -= box.b - zone.t + 2;
        box = bounds(x, y, tilt, scale);
        guard += 1;
      }
      if (overlaps(box) || !onScreen(box)) continue;
      addTicket(x, y, box, tilt, scale);
    }
    rain.replaceChildren(frag);
    rain.dataset.kinds = String(srcs.length);
  };

  const show = () => {
    window.clearTimeout(hideTimer);
    const srcs = sources();
    if (rain.dataset.kinds !== String(srcs.length) || !rain.childElementCount) build();
    frame.classList.add("is-ticket-rain");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => rain.classList.add("is-on"));
    });
  };
  const hide = () => {
    rain.classList.remove("is-on");
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!rain.classList.contains("is-on")) frame.classList.remove("is-ticket-rain");
    }, 1650);
  };

  link.addEventListener("mouseenter", show);
  link.addEventListener("mouseleave", hide);
  link.addEventListener("focus", show);
  link.addEventListener("blur", hide);
}

function bindFavosFilm() {
  const frame = document.querySelector('.frame[data-screen="konbini"]');
  const hoverLink = document.querySelector('.k-menu a[data-extra="favos"]');
  const video = document.querySelector("#k-film-frame");
  const view = document.querySelector('[data-kview="favos"]');
  if (!frame || !video || !view) return;
  let riding = false;
  let holding = false;

  const atEnd = () => Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.12;

  const arrive = () => {
    if (!Number.isFinite(video.duration)) {
      view.classList.add("is-arrived");
      return;
    }
    holding = true;
    riding = false;
    frame.classList.add("is-film");
    const last = Math.max(0, video.duration - 0.04);
    video.pause();
    if (video.currentTime < last) video.currentTime = last;
    view.classList.add("is-arrived");
  };

  const holdLast = () => {
    if (!atEnd() && !video.ended) return;
    holding = true;
    riding = false;
    video.pause();
    if (Number.isFinite(video.duration)) {
      const last = Math.max(0, video.duration - 0.04);
      if (video.currentTime < last) video.currentTime = last;
    }
    if (view.classList.contains("is-on")) {
      frame.classList.add("is-film");
      view.classList.add("is-arrived");
    }
  };

  video.addEventListener("timeupdate", () => {
    if (video.duration && video.currentTime >= video.duration - 0.12) holdLast();
  });
  video.addEventListener("ended", holdLast);
  video.addEventListener("error", () => view.classList.add("is-arrived"));

  const play = () => {
    if (riding || holding || view.classList.contains("is-on")) return;
    if (video.ended || atEnd()) return;
    video.play().catch(() => {});
  };
  const pause = () => {
    if (riding || view.classList.contains("is-on")) return;
    video.pause();
  };

  hoverLink?.addEventListener("mouseenter", play);
  hoverLink?.addEventListener("mouseleave", pause);
  hoverLink?.addEventListener("focus", play);
  hoverLink?.addEventListener("blur", pause);

  const parkOnLast = () => {
    const jump = () => {
      if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 0.04);
      arrive();
    };
    if (video.readyState >= 1) jump();
    else {
      video.load();
      video.addEventListener("loadedmetadata", jump, { once: true });
    }
  };

  const begin = () => {
    frame.classList.add("is-film");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      riding = true;
      parkOnLast();
      return;
    }
    if (holding || video.ended || atEnd()) {
      arrive();
      return;
    }
    riding = true;
    holding = false;
    view.classList.remove("is-arrived");
    video.play().catch(parkOnLast);
  };

  document.querySelectorAll('a[href="#/konbini/favos"]').forEach((link) => {
    link.addEventListener("click", begin);
  });

  window.syncFavosRide = (on) => {
    if (!on) {
      riding = false;
      frame.classList.remove("is-film");
      view.classList.remove("is-arrived");
      video.pause();
      return;
    }
    if (riding) return;
    if (holding || video.ended || atEnd()) {
      arrive();
      return;
    }
    if (frame.classList.contains("is-film")) return;
    begin();
  };
}

function cookzSelectedShots() {
  const saved = typeof COOKZ_SAVED !== "undefined" ? COOKZ_SAVED : {};
  const shots = [];
  Object.keys(saved)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((id) => {
      (saved[id].slots || []).forEach((src) => {
        if (src) shots.push(src);
      });
    });
  return shots;
}

// Portraits of the cooks. x/y is the face centre, w/h its size, both
// fractions of the oriented photo. The plate is sized to that face.
const HOME_PORTRAITS = [
  { src: "media/photo/gyokai/01-1-Ishikaya_kenta-Nakayoshi_shokudo-copia.jpg", x: 0.46, y: 0.48, w: 0.26, h: 0.16 },
  { src: "media/photo/gyokai/02-1-Ishikaya_kenta-Nakayoshi_shokudo.jpg", x: 0.46, y: 0.48, w: 0.26, h: 0.16 },
  { src: "media/photo/naochan/01-2-Ochiai_Makoto-Naochan_ramen.jpg", x: 0.64, y: 0.455, w: 0.26, h: 0.18 },
  { src: "media/photo/kakyo/03-3-Uchikawa_HirotoYonemitsu_Chinara-Kakyo.jpg", x: 0.38, y: 0.48, w: 0.18, h: 0.16 },
  { src: "media/photo/daichu/01-DSCF1038.jpg", x: 0.48, y: 0.45, w: 0.32, h: 0.22 },
  { src: "media/photo/daichu/10-DSCF1053.jpg", x: 0.40, y: 0.50, w: 0.22, h: 0.14 },
  { src: "media/photo/029/20-DSCF0663.jpg", x: 0.58, y: 0.42, w: 0.16, h: 0.28 },
  { src: "media/photo/earth/07-DSCF1554.jpg", x: 0.30, y: 0.58, w: 0.26, h: 0.16 },
  { src: "media/photo/musashi/06-DSCF1841.jpg", x: 0.50, y: 0.50, w: 0.26, h: 0.14 },
  { src: "media/photo/mifuku/28-DSCF1543.jpg", x: 0.57, y: 0.22, w: 0.09, h: 0.12 },
  { src: "media/photo/mifuku/24-DSCF1539.jpg", x: 0.60, y: 0.385, w: 0.24, h: 0.16 },
];

function placeHomeFace(img) {
  const face = img._face;
  if (!face || !img.naturalWidth) return;
  const rush = img.parentElement.getBoundingClientRect();
  const plate = document.querySelector(".home__plate");
  if (!plate) return;
  const box = plate.getBoundingClientRect();
  const ovalW = box.width * 0.72;
  const ovalH = box.height * 0.7;
  const cx = box.left + box.width / 2 - rush.left;
  const cy = box.top + box.height / 2 - rush.top;
  const scale = Math.max(ovalW / (face.w * img.naturalWidth), ovalH / (face.h * img.naturalHeight));
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  img.style.width = `${dw}px`;
  img.style.height = `${dh}px`;
  img.style.left = `${cx - face.x * dw}px`;
  img.style.top = `${cy - face.y * dh}px`;
}

function startHomeFlash() {
  const root = document.querySelector(".home__rush");
  if (!root || root.dataset.live === "1") return;
  const shots = HOME_PORTRAITS.map((shot) => ({ ...shot }));
  if (!shots.length) return;
  root.dataset.live = "1";
  for (let i = shots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shots[i], shots[j]] = [shots[j], shots[i]];
  }

  const beat = Math.round(72 * 1.1);
  const ready = new Map();
  const warm = (shot) => {
    const src = shot.src;
    if (ready.has(src)) return;
    const img = new Image();
    img.decoding = "async";
    const done = (ok) => ready.set(src, ok);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
    if (img.complete && img.naturalWidth) done(true);
    else if (img.complete) done(false);
  };

  const a = document.createElement("img");
  const b = document.createElement("img");
  a.className = "home__flash";
  b.className = "home__flash";
  a.alt = "";
  b.alt = "";
  a.draggable = false;
  b.draggable = false;
  root.append(a, b);

  let cursor = 0;
  let shown = a;
  let hidden = b;
  const ahead = 4;
  const arm = () => {
    for (let n = 0; n < ahead; n += 1) warm(shots[(cursor + n) % shots.length]);
  };
  const showShot = (img, shot) => {
    img._face = shot;
    if (img.getAttribute("src") !== shot.src) img.src = shot.src;
    placeHomeFace(img);
  };
  arm();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const still = () => {
      if (!ready.has(shots[0].src)) {
        window.setTimeout(still, 40);
        return;
      }
      if (!ready.get(shots[0].src)) return;
      showShot(a, shots[0]);
      a.classList.add("is-on");
    };
    still();
    return;
  }

  const step = () => {
    const homeOn = document.querySelector('[data-screen="home"]')?.classList.contains("is-on");
    if (!homeOn) {
      window.setTimeout(step, 400);
      return;
    }
    const shot = shots[cursor];
    if (!ready.has(shot.src)) {
      warm(shot);
      window.setTimeout(step, 30);
      return;
    }
    if (!ready.get(shot.src)) {
      cursor = (cursor + 1) % shots.length;
      arm();
      window.setTimeout(step, 0);
      return;
    }
    showShot(hidden, shot);
    if (!(hidden.complete && hidden.naturalWidth)) {
      window.setTimeout(step, 16);
      return;
    }
    placeHomeFace(hidden);
    hidden.classList.add("is-on");
    shown.classList.remove("is-on");
    const next = shown;
    shown = hidden;
    hidden = next;
    cursor = (cursor + 1) % shots.length;
    const upcoming = shots[cursor];
    warm(upcoming);
    warm(shots[(cursor + 1) % shots.length]);
    if (ready.get(upcoming.src) && hidden.getAttribute("src") !== upcoming.src) {
      hidden._face = upcoming;
      hidden.src = upcoming.src;
    }
    window.setTimeout(step, beat);
  };
  step();
}

function fitHomeDiary() {
  const el = document.querySelector(".home__diary");
  const span = el?.querySelector(".home__diary-full");
  if (!span) return;
  const words = [...el.querySelectorAll(".home__diary-word")];
  const mobile = window.matchMedia("(max-width: 820px)").matches && words.length === 3;
  if (!mobile) {
    words.forEach((word) => {
      word.hidden = true;
      word.style.display = "none";
      word.style.fontSize = "";
      word.style.letterSpacing = "";
    });
    span.hidden = false;
    span.style.display = "";
    const max = el.clientWidth;
    if (!max) return;
    span.style.fontSize = "100px";
    const width = span.scrollWidth;
    if (!width) return;
    span.style.fontSize = `${(100 * max) / width}px`;
    return;
  }
  span.hidden = true;
  span.style.display = "none";
  words.forEach((word) => {
    word.hidden = false;
    word.style.display = "";
  });
  const max = el.clientWidth;
  if (!max) return;
  const gastro = el.querySelector(".home__diary-word--gastro");
  gastro.style.letterSpacing = "-0.045em";
  gastro.style.fontSize = "100px";
  const width = gastro.scrollWidth;
  if (!width) return;
  const size = (100 * max) / width;
  const half = max / 2;
  words.forEach((word) => {
    word.style.fontSize = `${size}px`;
    word.style.letterSpacing = "-0.045em";
  });
  const trackTo = (word, target) => {
    const natural = word.scrollWidth;
    if (!natural || natural >= target - 1) return;
    let lo = -0.045;
    let hi = 0.8;
    for (let i = 0; i < 14; i += 1) {
      const mid = (lo + hi) / 2;
      word.style.letterSpacing = `${mid}em`;
      if (word.scrollWidth > target) hi = mid;
      else lo = mid;
    }
    word.style.letterSpacing = `${lo}em`;
  };
  trackTo(el.querySelector(".home__diary-word--visual"), half);
}

function bindHomeMenu() {
  const menu = document.querySelector(".home__menu");
  const btn = menu?.querySelector("button");
  const list = document.querySelector("#home-menu-list");
  if (!menu || !btn || !list) return;
  let disarm = () => {};
  let closeTimer = 0;
  const finishClose = () => {
    clearTimeout(closeTimer);
    disarm();
    disarm = () => {};
    menu.classList.remove("is-open", "is-closing");
    btn.setAttribute("aria-expanded", "false");
    list.hidden = true;
  };
  const close = () => {
    if (list.hidden || menu.classList.contains("is-closing")) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    btn.setAttribute("aria-expanded", "false");
    const first = list.querySelector("a");
    const done = (e) => {
      if (e.target !== first || !menu.classList.contains("is-closing")) return;
      finishClose();
    };
    first.addEventListener("animationend", done);
    disarm = () => first.removeEventListener("animationend", done);
    closeTimer = setTimeout(() => {
      if (menu.classList.contains("is-closing")) finishClose();
    }, 700);
  };
  const open = () => {
    clearTimeout(closeTimer);
    disarm();
    disarm = () => {};
    menu.classList.remove("is-closing");
    list.hidden = false;
    menu.classList.remove("is-open");
    void list.offsetWidth;
    menu.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
  };
  btn.addEventListener("click", () => {
    if (menu.classList.contains("is-open")) close();
    else open();
  });
  list.querySelectorAll("[data-goto]").forEach((link) => {
    link.addEventListener("click", close);
  });
  document.addEventListener("click", (e) => {
    if (menu.contains(e.target)) return;
    close();
  });
  startHomeFlash();
  fitHomeDiary();
  window.addEventListener("resize", () => {
    fitHomeDiary();
    document.querySelectorAll(".home__flash").forEach(placeHomeFace);
  });
}

function bindPagePeel() {
  const peel = document.getElementById("page-peel");
  const hit = peel?.querySelector(".page-peel__hit");
  if (!peel || !hit) return;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 821px)");
  const reach = 260;
  const max = 168;
  let x = -9999;
  let y = -9999;
  let raf = 0;

  const backButton = () => {
    const backs = document.querySelectorAll(".frame.is-on .back.is-on");
    return backs.length ? backs[backs.length - 1] : null;
  };

  const hide = () => {
    peel.classList.remove("is-on");
    peel.setAttribute("aria-hidden", "true");
    hit.tabIndex = -1;
  };

  const place = () => {
    raf = 0;
    if (!fine.matches || route().screen === "home") {
      hide();
      return;
    }
    const corners = [
      { id: "tl", x: 0, y: 0 },
      { id: "bl", x: 0, y: window.innerHeight },
    ];
    let best = null;
    let dist = reach;
    corners.forEach((corner) => {
      const d = Math.hypot(x - corner.x, y - corner.y);
      if (d < dist) {
        dist = d;
        best = corner;
      }
    });
    if (!best) {
      hide();
      return;
    }
    const t = 1 - dist / reach;
    const size = Math.round(58 + t * t * (max - 58));
    peel.dataset.corner = best.id;
    peel.style.setProperty("--peel", `${size}px`);
    peel.classList.add("is-on");
    peel.setAttribute("aria-hidden", "false");
    hit.tabIndex = 0;
  };

  document.addEventListener("pointermove", (e) => {
    x = e.clientX;
    y = e.clientY;
    if (!raf) raf = requestAnimationFrame(place);
  });
  document.addEventListener("pointerleave", hide);
  hit.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const back = backButton();
    if (back) {
      back.click();
      return;
    }
    const { screen } = route();
    if (screen === "home") return;
    if (screen === "japan2026" || screen === "manifest") go("home");
    else go("japan2026");
  });
}

function init() {
  buildCookzList($("#venue-list"));
  bindPassed();

  const mapsLink = $("#detail-address");
  if (mapsLink) {
    mapsLink.addEventListener("click", (e) => {
      const url = mapsLink.getAttribute("href");
      if (mapsLink.hidden || !url || url === "#") return;
      e.preventDefault();
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }
  loadTickets();
  buildFavos();
  initManifest();

  $$("[data-ticket-lang]").forEach((btn) => {
    btn.addEventListener("click", () => setTicketLang(btn.dataset.ticketLang));
  });
  syncTicketSortUi();
  $$("[data-ticket-sort]").forEach((btn) => {
    btn.addEventListener("click", () => setTicketSort(btn.dataset.ticketSort));
  });
  const sortNav = $("#t-sort");
  if (sortNav && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => positionTicketSortLine(false));
    ro.observe(sortNav);
  }
  addEventListener("resize", () => {
    sortLinePrev = null;
    positionTicketSortLine(false);
  });

  setupJapanCarousel();
  initJapanMotion();
  bindCookzFrame();
  bindCookzDrop();
  bindCookzKanji();
  bindFavosFilm();
  bindTicketRain();
  bindHomeMenu();
  const snackActions = document.querySelector(".k-actions");
  const syncSnackActions = () => {
    if (!snackActions) return;
    snackActions.hidden = !window.matchMedia("(max-width: 820px)").matches;
  };
  syncSnackActions();
  window.addEventListener("resize", syncSnackActions);
  bindLienzo();
  bindPagePeel();

  const cookzNav = document.querySelector(".cookz-nav");
  if (cookzNav) {
    cookzNav.addEventListener("mouseleave", () => {
      hovering = -1;
      paintCookz();
    });
  }

  document.addEventListener("click", (e) => {
    const hit = e.target.closest("[data-goto]");
    if (!hit) return;
    if (hit.closest(".j-card") && japanDragDistance > 10) return;
    if (hit.classList.contains("back--cookz") && lienzoReturn) {
      e.preventDefault();
      shrinkLienzoCase();
      return;
    }
    e.preventDefault();
    go(hit.dataset.goto, hit.dataset.extra || "");
  });

  $$("#side-nav a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      go("konbini", a.dataset.view);
    });
  });

  addEventListener("hashchange", apply);
  document.querySelectorAll(".j-card img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", layoutJapan);
  });

  addEventListener("resize", () => {
    fitScreen();
    layoutTickets({ force: true });
    layoutJapan();
  });
  if (!location.hash) location.hash = "/home";
  apply();
}

init();
