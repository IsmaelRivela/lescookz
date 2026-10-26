/* global Intl */
/**
 * Konbini purchase stats from ticket JSON — consumed by app.js
 */
const STATS_LABELS = {
  es: {
    overview: "Resumen",
    money: "Dinero",
    visits: "Visitas",
    chains: "Cadenas",
    cities: "Ciudades",
    time: "Tiempo",
    stores: "Tiendas",
    products: "Productos top",
    categories: "Categorías",
    drinks: "Bebidas",
    food: "Comida",
    habits: "Hábitos",
    records: "Récords",
    tickets: "tickets",
    items: "líneas",
    yen: "¥",
    deduped: "sin duplicados de ticket",
    all: "todos los tickets",
  },
  en: {
    overview: "Overview",
    money: "Money",
    visits: "Visits",
    chains: "Chains",
    cities: "Cities",
    time: "Time",
    stores: "Stores",
    products: "Top products",
    categories: "Categories",
    drinks: "Drinks",
    food: "Food",
    habits: "Habits",
    records: "Records",
    tickets: "tickets",
    items: "line items",
    yen: "¥",
    deduped: "deduped receipts",
    all: "all tickets",
  },
  ja: {
    overview: "概要",
    money: "金額",
    visits: "回数",
    chains: "チェーン",
    cities: "都市",
    time: "時間",
    stores: "店舗",
    products: "商品トップ",
    categories: "カテゴリ",
    drinks: "飲料",
    food: "食品",
    habits: "傾向",
    records: "記録",
    tickets: "件",
    items: "行",
    yen: "¥",
    deduped: "重複除く",
    all: "全件",
  },
};

const DOW = {
  es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
};

const LOST_TICKETS_NOTE = {
  es: "Muchos tickets se perdieron lamentablemente ;_; estas stats son solo lo que quedó.",
  en: "Many receipts were unfortunately lost ;_; these stats are only what we still have.",
  ja: "Aikawarazu takusan no reshiputo ga nakunatta ;_; koko no tōkei wa nokotta bubun dake.",
};

function normJa(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function hasJapanese(s) {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(s || "");
}

function cleanRomaji(s) {
  return (s || "")
    .replace(/\uFF5E/g, "·")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function jaRomaji(ja) {
  const key = normJa(ja);
  if (!key) return "";
  if (!hasJapanese(key)) return key;
  const hit = window.KONBINI_ROMAJI?.romaji?.[key];
  return cleanRomaji(hit || key);
}

function jaEs(ja) {
  const key = normJa(ja);
  const es = window.KONBINI_ROMAJI?.es?.[key] || "";
  if (!es || es === key || hasJapanese(es)) return es;
  return es;
}

function romajiStoreKey(storeKey) {
  const parts = String(storeKey).split(" · ");
  if (parts.length < 2) return jaRomaji(storeKey);
  return `${parts[0]} · ${jaRomaji(parts.slice(1).join(" · "))}`;
}

function romajiAny(text) {
  const t = String(text || "");
  if (!hasJapanese(t)) return t;
  return jaRomaji(t);
}

function fmtYen(n, lang) {
  const v = Math.round(n || 0);
  return `${STATS_LABELS[lang]?.yen || "¥"}${v.toLocaleString(lang === "ja" ? "ja-JP" : lang === "en" ? "en-US" : "es-ES")}`;
}

function fmtNum(n, lang) {
  return (n ?? 0).toLocaleString(lang === "ja" ? "ja-JP" : lang === "en" ? "en-US" : "es-ES");
}

function parseTs(ticket) {
  const d = ticket.date || "1970-01-01";
  const t = (ticket.time || "00:00").padStart(5, "0");
  return new Date(`${d}T${t}:00`);
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function itemLabel(it, lang) {
  if (lang === "ja") return (it.nameJa || "").trim();
  if (lang === "en") return (it.nameEn || it.nameEs || it.nameJa || "").trim();
  return (it.nameEs || it.nameJa || "").trim();
}

function categorizeItem(it) {
  const blob = `${it.nameJa || ""} ${it.nameEs || ""} ${it.nameEn || ""}`.toLowerCase();
  if (/値引|値下|descuento|discount/.test(blob)) return "discount";
  if (/レジ袋|bolsa|plastic bag/.test(blob)) return "bag";
  if (/ポケカ|pokémon|pokemon/.test(blob)) return "cards";
  if (/ビール|super dry|dry zero|dryzero|red bull|redbull|オロナミン|pocari|yakult|おーいお茶|紅茶花伝|kochakaden|tea|té|latte|抹茶|カフェオレ|café|water|agua|テンネンスイ|特水|コイワイ|boss|ボス/.test(blob))
    return "drink";
  if (/ボヘーム|メビウス|mevius|lucky strike|cigarrill|tabaco/.test(blob)) return "tobacco";
  if (/ビール|super dry|dry zero|asahi/.test(blob) && !/zero/.test(blob)) return "alcohol";
  if (/ドライゼロ|dry zero/.test(blob)) return "drink";
  if (/傘|umbrella|イヤホン|earphone|充電|charger|プラグ|adapter|メモパッド|memo|灰皿|ashtray|calcetin|sock|トランクス|trunks|camiseta|outer/.test(blob))
    return "goods";
  if (
    /手巻|onigiri|temaki|サンド|sando|ファミチキ|famichiki|spam|むすび|ドッグ|ヌードル|noodle|わらび|クレープ|crepe|カラアゲ|karaage|チキン|たまご|egg|ハム|ham|アメリカン/.test(
      blob,
    )
  )
    return "food";
  if (/胃腸|cabagin|tablet|薬/.test(blob)) return "health";
  return "other";
}

function dedupeTickets(tickets) {
  const seen = new Set();
  const out = [];
  for (const t of tickets) {
    const key = t.id || t.ktId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function topN(map, n = 8) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function computeKonbiniStats(tickets) {
  const all = tickets || [];
  const unique = dedupeTickets(all);
  const useUnique = unique.length < all.length;

  const sumTicket = (list) => list.reduce((s, t) => s + (t.total || 0), 0);
  const totals = all.map((t) => t.total || 0);
  const totalsU = unique.map((t) => t.total || 0);

  const items = [];
  const itemsNoBagDisc = [];
  for (const t of all) {
    for (const it of t.items || []) {
      if (!it.amount || it.amount <= 0) continue;
      items.push({ ...it, ticket: t });
      const cat = categorizeItem(it);
      if (cat !== "bag" && cat !== "discount") itemsNoBagDisc.push({ ...it, ticket: t, cat });
    }
  }

  const chainSpend = new Map();
  const chainCount = new Map();
  const citySpend = new Map();
  const cityCount = new Map();
  const storeCount = new Map();
  const storeSpend = new Map();
  const prefSpend = new Map();

  const hourBuckets = { night: 0, morning: 0, midday: 0, afternoon: 0, evening: 0 };
  const hourSpend = { night: 0, morning: 0, midday: 0, afternoon: 0, evening: 0 };
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  const dowSpend = [0, 0, 0, 0, 0, 0, 0];
  const dateMap = new Map();

  for (const t of all) {
    const chain = t.establishment?.chain || "?";
    const city = t.place?.cityKey || t.place?.labelEs?.split(",")[0] || "?";
    const store = `${chain} · ${t.establishment?.nameJa || "?"}`;
    const pref = (t.place?.addressJa || "").slice(0, 3) || "?";

    chainSpend.set(chain, (chainSpend.get(chain) || 0) + (t.total || 0));
    chainCount.set(chain, (chainCount.get(chain) || 0) + 1);
    citySpend.set(city, (citySpend.get(city) || 0) + (t.total || 0));
    cityCount.set(city, (cityCount.get(city) || 0) + 1);
    storeCount.set(store, (storeCount.get(store) || 0) + 1);
    storeSpend.set(store, (storeSpend.get(store) || 0) + (t.total || 0));
    prefSpend.set(pref, (prefSpend.get(pref) || 0) + (t.total || 0));

    const ts = parseTs(t);
    if (!Number.isNaN(ts.getTime())) {
      const h = ts.getHours();
      let bucket = "night";
      if (h >= 5 && h < 11) bucket = "morning";
      else if (h >= 11 && h < 14) bucket = "midday";
      else if (h >= 14 && h < 18) bucket = "afternoon";
      else if (h >= 18 && h < 23) bucket = "evening";
      hourBuckets[bucket]++;
      hourSpend[bucket] += t.total || 0;
      const dow = ts.getDay();
      dowCount[dow]++;
      dowSpend[dow] += t.total || 0;
      const dk = t.date;
      dateMap.set(dk, (dateMap.get(dk) || 0) + 1);
    }
  }

  const productFreq = new Map();
  const productSpend = new Map();
  const catSpend = new Map();
  const catCount = new Map();
  let discountTotal = 0;
  let bagCount = 0;
  let bagSpend = 0;

  for (const row of items) {
    const it = row;
    const cat = categorizeItem(it);
    catSpend.set(cat, (catSpend.get(cat) || 0) + it.amount);
    catCount.set(cat, (catCount.get(cat) || 0) + 1);
    if (cat === "discount") discountTotal += it.amount;
    if (cat === "bag") {
      bagCount++;
      bagSpend += it.amount;
    }
    const key = (it.nameJa || "").replace(/\s+/g, " ").trim();
    if (!key || cat === "discount") continue;
    productFreq.set(key, (productFreq.get(key) || 0) + 1);
    productSpend.set(key, (productSpend.get(key) || 0) + it.amount);
  }

  const timestamps = all.map(parseTs).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push((timestamps[i] - timestamps[i - 1]) / 3600000);
  }

  let maxItem = null;
  let minItem = null;
  for (const it of itemsNoBagDisc) {
    if (!maxItem || it.amount > maxItem.amount) maxItem = it;
    if (!minItem || it.amount < minItem.amount) minItem = it;
  }

  const famichiki = items.filter((i) => /ファミチキ|famichiki/i.test(`${i.nameJa}${i.nameEs}`)).length;
  const onigiri = items.filter((i) => /手巻|onigiri|temaki|むすび|spam.*ツナ/i.test(`${i.nameJa}${i.nameEs}`)).length;
  const tamago = items.filter((i) => /たまごサンド|tamago sando/i.test(`${i.nameJa}${i.nameEs}`)).length;
  const milkTea = items.filter((i) => /紅茶花伝|kochakaden|royal milk|ロイヤルミルク/i.test(`${i.nameJa}${i.nameEs}`)).length;
  const pocari = items.filter((i) => /ポカリ|pocari/i.test(`${i.nameJa}${i.nameEs}`, "i")).reduce((s, i) => s + i.amount, 0);
  const yakult = items.filter((i) => /ヤクルト|yakult/i.test(`${i.nameJa}${i.nameEs}`, "i")).length;
  const cigarettes = items.filter((i) => categorizeItem(i) === "tobacco").length;
  const alcohol = items.filter((i) => /スーパードライ|super dry/i.test(`${i.nameJa}${i.nameEs}`) && !/zero/i.test(`${i.nameJa}`)).length;

  const busiestHourBucket = topN(new Map(Object.entries(hourBuckets)), 1)[0];
  const busiestDow = dowCount.indexOf(Math.max(...dowCount));
  const maxDayTickets = Math.max(...dateMap.values(), 0);
  const daysWithPurchase = dateMap.size;

  const uniqueSkus = productFreq.size;

  return {
    useUnique,
    uniqueSkus,
    ticketCount: all.length,
    ticketCountUnique: unique.length,
    itemLines: items.length,
    spendAll: sumTicket(all),
    spendUnique: sumTicket(unique),
    avgTicket: totals.length ? sumTicket(all) / totals.length : 0,
    avgTicketUnique: totalsU.length ? sumTicket(unique) / totalsU.length : 0,
    medianTicket: median(totals),
    minTicket: totals.length ? Math.min(...totals) : 0,
    maxTicket: totals.length ? Math.max(...totals) : 0,
    avgItemsPerTicket: all.length ? items.length / all.length : 0,
    chainSpend,
    chainCount,
    citySpend,
    cityCount,
    storeCount,
    storeSpend,
    prefSpend,
    hourBuckets,
    hourSpend,
    dowCount,
    dowSpend,
    busiestHourBucket,
    busiestDow,
    maxDayTickets,
    daysWithPurchase,
    dateFirst: timestamps[0],
    dateLast: timestamps[timestamps.length - 1],
    spanDays:
      timestamps.length > 1
        ? Math.max(1, Math.ceil((timestamps[timestamps.length - 1] - timestamps[0]) / 86400000) + 1)
        : 1,
    gaps,
    maxGapHours: gaps.length ? Math.max(...gaps) : 0,
    minGapHours: gaps.length ? Math.min(...gaps) : 0,
    avgGapHours: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
    productFreq,
    productSpend,
    catSpend,
    catCount,
    discountTotal,
    bagCount,
    bagSpend,
    maxItem,
    minItem,
    famichiki,
    onigiri,
    tamago,
    milkTea,
    pocari,
    yakult,
    cigarettes,
    alcohol,
  };
}

function rowStacked(romaji, es, value, extraClass = "", kind = "") {
  const li = document.createElement("li");
  li.className = `stats-row stats-row--stack${extraClass ? ` ${extraClass}` : ""}`;
  const label = document.createElement("div");
  label.className = "stats-row__label stats-row__stack";
  if (kind) {
    const k = document.createElement("span");
    k.className = "stats-row__kind";
    k.textContent = kind;
    label.append(k);
  }
  const main = document.createElement("span");
  main.className = "stats-product-romaji";
  main.textContent = romaji;
  label.append(main);
  if (es) {
    const sub = document.createElement("span");
    sub.className = "stats-product-es";
    sub.textContent = es;
    label.append(sub);
  }
  const b = document.createElement("span");
  b.className = "stats-row__value";
  b.textContent = value;
  li.append(label, b);
  return li;
}

function row(label, value, extraClass = "") {
  const li = document.createElement("li");
  li.className = `stats-row${extraClass ? ` ${extraClass}` : ""}`;
  const a = document.createElement("span");
  a.className = "stats-row__label";
  a.textContent = romajiAny(label);
  const b = document.createElement("span");
  b.className = "stats-row__value";
  b.textContent = value;
  li.append(a, b);
  return li;
}

function section(title, rows) {
  const sec = document.createElement("section");
  sec.className = "stats-section";
  const h = document.createElement("h3");
  h.className = "stats-section__title";
  h.textContent = title;
  const ul = document.createElement("ul");
  ul.className = "stats-rows";
  rows.forEach((r) => ul.append(r));
  sec.append(h, ul);
  return sec;
}

function renderKonbiniStats(container, tickets, lang = "es") {
  if (!container) return;
  const L = STATS_LABELS[lang] || STATS_LABELS.es;
  const dowNames = DOW[lang] || DOW.es;
  const s = computeKonbiniStats(tickets);

  container.innerHTML = "";
  const scroll = document.createElement("div");
  scroll.className = "stats-scroll";

  const footnote = document.createElement("p");
  footnote.className = "stats-footnote";
  const mark = document.createElement("span");
  mark.className = "stats-footnote__mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "* ";
  footnote.append(mark, document.createTextNode(LOST_TICKETS_NOTE[lang] || LOST_TICKETS_NOTE.es));
  scroll.append(footnote);

  const spend = s.useUnique ? s.spendUnique : s.spendAll;
  const ticketN = s.useUnique ? s.ticketCountUnique : s.ticketCount;
  const scopeNote = s.useUnique
    ? `${ticketN} ${L.tickets} (${L.deduped})`
    : `${ticketN} ${L.tickets}`;

  scroll.append(
    section(L.overview, [
      row(scopeNote, fmtYen(spend, lang), "stats-row--highlight"),
      row(lang === "ja" ? "商品行" : lang === "en" ? "Line items" : "Líneas de producto", fmtNum(s.itemLines, lang)),
      row(
        lang === "ja" ? "ユニーク商品" : lang === "en" ? "Unique products" : "Productos distintos",
        fmtNum(s.uniqueSkus, lang),
      ),
      row(
        lang === "ja" ? "全レシート合計" : lang === "en" ? "Gross (all scans)" : "Gasto bruto (todos los scans)",
        fmtYen(s.spendAll, lang),
      ),
      row(
        lang === "ja" ? "期間" : lang === "en" ? "Date range" : "Rango de fechas",
        s.dateFirst && s.dateLast
          ? `${s.dateFirst.toISOString().slice(0, 10)} → ${s.dateLast.toISOString().slice(0, 10)}`
          : "—",
      ),
      row(lang === "ja" ? "購入日数" : lang === "en" ? "Days shopped" : "Días con compra", fmtNum(s.daysWithPurchase, lang)),
      row(
        lang === "ja" ? "最大（1日）" : lang === "en" ? "Max tickets / day" : "Máx. tickets en un día",
        fmtNum(s.maxDayTickets, lang),
      ),
    ]),
  );

  scroll.append(
    section(L.money, [
      row(lang === "ja" ? "平均レシート" : lang === "en" ? "Avg. receipt" : "Ticket medio", fmtYen(s.avgTicket, lang)),
      row(lang === "ja" ? "中央値" : lang === "en" ? "Median receipt" : "Mediana ticket", fmtYen(s.medianTicket, lang)),
      row(lang === "ja" ? "最小" : lang === "en" ? "Smallest" : "Ticket mínimo", fmtYen(s.minTicket, lang)),
      row(lang === "ja" ? "最大" : lang === "en" ? "Largest" : "Ticket máximo", fmtYen(s.maxTicket, lang), "stats-row--highlight"),
      row(
        lang === "ja" ? "平均行数" : lang === "en" ? "Items / receipt" : "Ítems por ticket",
        s.avgItemsPerTicket.toFixed(1).replace(".", lang === "es" ? "," : "."),
      ),
      row(lang === "ja" ? "値引き合計" : lang === "en" ? "Total discounts" : "Descuentos (total)", fmtYen(Math.abs(s.discountTotal), lang)),
      row(
        lang === "ja" ? "レジ袋" : lang === "en" ? "Plastic bags" : "Bolsas de plástico",
        `${fmtNum(s.bagCount, lang)} · ${fmtYen(s.bagSpend, lang)}`,
      ),
    ]),
  );

  const chainRows = topN(s.chainSpend, 5).map(([name, amt]) => {
    const n = s.chainCount.get(name) || 0;
    return row(name, `${fmtNum(n, lang)} · ${fmtYen(amt, lang)}`);
  });
  scroll.append(section(L.chains, chainRows));

  const cityRows = topN(s.citySpend, 8).map(([name, amt]) => {
    const n = s.cityCount.get(name) || 0;
    return row(name, `${fmtNum(n, lang)} · ${fmtYen(amt, lang)}`);
  });
  scroll.append(section(L.cities, cityRows));

  const prefRows = topN(s.prefSpend, 6).map(([name, amt]) => row(jaRomaji(name), fmtYen(amt, lang)));
  if (prefRows.length) {
    scroll.append(
      section(lang === "ja" ? "都道府県" : lang === "en" ? "Prefectures" : "Prefecturas", prefRows),
    );
  }

  const chainShareRows = topN(s.chainSpend, 5).map(([name, amt]) => {
    const pct = spend ? ((amt / s.spendAll) * 100).toFixed(1) : "0";
    return row(`${name} (${pct}%)`, fmtYen(amt, lang));
  });
  scroll.append(
    section(lang === "ja" ? "チェーン比率" : lang === "en" ? "Chain share" : "Cuota por cadena", chainShareRows),
  );

  const bucketLabels = {
    es: { night: "00–05", morning: "05–11", midday: "11–14", afternoon: "14–18", evening: "18–23" },
    en: { night: "00–05", morning: "05–11", midday: "11–14", afternoon: "14–18", evening: "18–23" },
    ja: { night: "0–5時", morning: "5–11時", midday: "11–14時", afternoon: "14–18時", evening: "18–23時" },
  };
  const bl = bucketLabels[lang] || bucketLabels.es;
  const timeRows = Object.keys(s.hourBuckets).map((k) =>
    row(bl[k], `${fmtNum(s.hourBuckets[k], lang)} · ${fmtYen(s.hourSpend[k], lang)}`),
  );
  timeRows.push(
    row(
      lang === "ja" ? "最多曜日" : lang === "en" ? "Busiest weekday" : "Día más activo",
      `${dowNames[s.busiestDow]} · ${fmtYen(s.dowSpend[s.busiestDow], lang)}`,
    ),
  );
  scroll.append(section(L.time, timeRows));

  const dowRows = dowNames.map((name, i) =>
    row(name, `${fmtNum(s.dowCount[i], lang)} · ${fmtYen(s.dowSpend[i], lang)}`),
  );
  scroll.append(
    section(lang === "ja" ? "曜日別" : lang === "en" ? "By weekday" : "Por día de la semana", dowRows),
  );

  const storeRows = topN(s.storeCount, 6).map(([name, n]) =>
    row(romajiStoreKey(name), `${fmtNum(n, lang)} · ${fmtYen(s.storeSpend.get(name) || 0, lang)}`),
  );
  scroll.append(section(L.stores, storeRows));

  const freqRows = topN(s.productFreq, 10).map(([ja, n]) => {
    const spendP = s.productSpend.get(ja) || 0;
    const es = jaEs(ja);
    return rowStacked(jaRomaji(ja), es, `${fmtNum(n, lang)}× · ${fmtYen(spendP, lang)}`);
  });
  scroll.append(section(L.products, freqRows));

  const catNames = {
    es: {
      food: "Comida",
      drink: "Bebidas",
      tobacco: "Tabaco",
      goods: "No comida / util",
      health: "Salud / farmacia",
      cards: "Cartas Pokémon",
      bag: "Bolsas",
      other: "Otros",
    },
    en: {
      food: "Food",
      drink: "Drinks",
      tobacco: "Tobacco",
      goods: "Non-food / gear",
      health: "Health / OTC",
      cards: "Pokémon cards",
      bag: "Bags",
      other: "Other",
    },
    ja: {
      food: "食品",
      drink: "飲料",
      tobacco: "たばこ",
      goods: "雑貨",
      health: "健康・薬",
      cards: "ポケカ",
      bag: "袋",
      other: "その他",
    },
  };
  const cn = catNames[lang] || catNames.es;
  const catRows = topN(s.catSpend, 12)
    .filter(([k]) => k !== "discount")
    .map(([k, amt]) => row(cn[k] || k, `${fmtNum(s.catCount.get(k) || 0, lang)} · ${fmtYen(amt, lang)}`));
  scroll.append(section(L.categories, catRows));

  scroll.append(
    section(L.habits, [
      row("Famichiki", fmtNum(s.famichiki, lang)),
      row(lang === "ja" ? "おにぎり系" : lang === "en" ? "Onigiri / temaki" : "Onigiri / temaki", fmtNum(s.onigiri, lang)),
      row("Tamago sando", fmtNum(s.tamago, lang)),
      row(lang === "ja" ? "紅茶花伝系" : lang === "en" ? "Kochakaden / milk tea" : "Kochakaden / milk tea", fmtNum(s.milkTea, lang)),
      row("Pocari Sweat", fmtYen(s.pocari, lang)),
      row("Yakult Y1000", fmtNum(s.yakult, lang)),
      row(lang === "ja" ? "タバコ購入" : lang === "en" ? "Cigarette lines" : "Líneas tabaco", fmtNum(s.cigarettes, lang)),
      row(lang === "ja" ? "ビール系" : lang === "en" ? "Beer (Asahi SD)" : "Cerveza (Super Dry)", fmtNum(s.alcohol, lang)),
    ]),
  );

  const gapLabel =
    lang === "ja" ? "平均間隔（時間）" : lang === "en" ? "Avg. hours between visits" : "Media entre visitas (h)";
  scroll.append(
    section(L.records, [
      row(gapLabel, s.avgGapHours ? s.avgGapHours.toFixed(1) : "—"),
      row(
        lang === "ja" ? "最長空き（時間）" : lang === "en" ? "Longest gap (h)" : "Mayor hueco (horas)",
        s.maxGapHours ? s.maxGapHours.toFixed(0) : "—",
      ),
      s.maxItem
        ? rowStacked(
            jaRomaji(s.maxItem.nameJa),
            jaEs(s.maxItem.nameJa),
            fmtYen(s.maxItem.amount, lang),
            "",
            lang === "en" ? "Most expensive line" : "Línea más cara",
          )
        : row(lang === "en" ? "Most expensive line" : "Línea más cara", "—"),
      s.minItem
        ? rowStacked(
            jaRomaji(s.minItem.nameJa),
            jaEs(s.minItem.nameJa),
            fmtYen(s.minItem.amount, lang),
            "",
            lang === "en" ? "Cheapest (excl. bags)" : "Línea más barata (sin bolsas)",
          )
        : row(lang === "en" ? "Cheapest (excl. bags)" : "Línea más barata (sin bolsas)", "—"),
    ]),
  );

  container.append(scroll);
}
