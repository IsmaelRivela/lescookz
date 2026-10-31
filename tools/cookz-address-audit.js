/* eslint-disable no-unused-vars */
const STORAGE_KEY = "cookz-address-audit-v1";

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOverrides(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function mergeCook(cook, overrides) {
  const o = overrides[String(cook.id)];
  if (!o) return cook;
  return {
    ...cook,
    mapsUrl: o.mapsUrl ?? cook.mapsUrl,
    address: { ...cook.address, ...(o.address || {}) },
    _auditStatus: o.status,
    _auditNote: o.note,
  };
}

function venueLabel(cook) {
  return cook.venue?.es || cook.venue?.en || cook.folder || `Cook ${cook.id}`;
}

function queryFromMapsUrl(mapsUrl) {
  if (!mapsUrl) return "";
  try {
    const u = new URL(mapsUrl);
    const q = u.searchParams.get("query");
    if (q) return q;
    if (u.pathname.includes("/place/")) {
      const m = u.pathname.match(/\/place\/([^/]+)/);
      if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
    }
    if (u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.startsWith("/maps"))) {
      return "";
    }
  } catch {
    /* ignore */
  }
  return "";
}

function coordsFromGoogleMapsUrl(url) {
  const s = String(url || "");
  let m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  return null;
}

async function expandShortMapLink(url) {
  const short =
    url &&
    (url.includes("maps.app.goo.gl") ||
      (url.includes("goo.gl") && url.includes("/maps")));
  if (!short) return url;
  try {
    const res = await fetch(`/map-link?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return data?.url || url;
  } catch {
    return url;
  }
}

/** iframe src: coords from place URLs, never bare place name (avoids wrong country). */
async function mapsEmbedSrc(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  let url = raw;
  if (/^https?:\/\//i.test(raw)) {
    url = await expandShortMapLink(raw);
    const coords = coordsFromGoogleMapsUrl(url);
    if (coords) {
      return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=17&output=embed`;
    }
    try {
      const u = new URL(url);
      const q = u.searchParams.get("query");
      if (q) {
        return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=17&output=embed`;
      }
    } catch {
      /* ignore */
    }
    return "";
  }

  return `https://www.google.com/maps?q=${encodeURIComponent(raw)}&z=17&output=embed`;
}

function embedSrcFromQuery(query) {
  const q = String(query || "").trim();
  if (!q) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=17&output=embed`;
}

async function resolveEmbedQuery(mapsUrl, addressFallback) {
  if (!mapsUrl) {
    if (addressFallback && !/^—/.test(addressFallback.trim())) {
      const ja = addressFallback.replace(/^〒[\d-]+\s*/, "").trim();
      return ja || addressFallback;
    }
    return "";
  }

  const expanded = await expandShortMapLink(mapsUrl);
  const coords = coordsFromGoogleMapsUrl(expanded);
  if (coords) return `${coords.lat},${coords.lng}`;

  const fromUrl = queryFromMapsUrl(expanded);
  if (fromUrl && !/^https?:\/\//i.test(fromUrl)) return fromUrl;

  try {
    const u = new URL(expanded);
    const q = u.searchParams.get("query");
    if (q) return q;
  } catch {
    /* ignore */
  }

  if (addressFallback && !/^—/.test(addressFallback.trim())) {
    const ja = addressFallback.replace(/^〒[\d-]+\s*/, "").trim();
    return ja || addressFallback;
  }

  return "";
}

function mapsUrlFromLine(line) {
  const t = String(line || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t)}`;
}

async function mapsUrlFromLineResolved(line) {
  const t = String(line || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return expandShortMapLink(t);
  return mapsUrlFromLine(t);
}

function cookSnippet(cook) {
  const addr = cook.address || {};
  const lines = [
    `    mapsUrl:`,
    `      "${(cook.mapsUrl || "").replace(/"/g, '\\"')}",`,
    `    address: {`,
    `      ja: "${(addr.ja || "").replace(/"/g, '\\"')}",`,
    `      en: "${(addr.en || "").replace(/"/g, '\\"')}",`,
    `      es: "${(addr.es || "").replace(/"/g, '\\"')}",`,
    `    },`,
  ];
  return lines.join("\n");
}

function buildExportTable(cooks) {
  return cooks
    .map((c) => {
      const name = venueLabel(c);
      const es = c.address?.es || "—";
      const ja = c.address?.ja || "—";
      const maps = c.mapsUrl || "—";
      const flag = c.franchiseSearch ? "Franquicia" : c.placeholder ? "Placeholder" : "";
      return { id: c.id, name, es, ja, maps, flag };
    })
    .sort((a, b) => a.id - b.id);
}

const els = {
  list: document.getElementById("audit-list"),
  stats: document.getElementById("audit-stats"),
  panel: document.getElementById("audit-panel"),
  tableBody: document.getElementById("audit-table-body"),
  exportJson: document.getElementById("export-json"),
};

let overrides = loadOverrides();
let cooks = (typeof COOKS !== "undefined" ? COOKS : []).map((c) => mergeCook(c, overrides));
let selectedId = cooks[0]?.id ?? 1;

function statusFor(cook) {
  if (cook._auditStatus === "ok") return "ok";
  if (cook._auditStatus === "fixed") return "ok";
  if (cook.franchiseSearch) return "franchise";
  if (cook.placeholder && /^—/.test(String(cook.address?.es || "").trim())) return "pending";
  return "";
}

function renderList() {
  const okCount = cooks.filter((c) => statusFor(c) === "ok").length;
  els.stats.innerHTML = `
    <span><strong>${cooks.length}</strong> locales</span>
    <span><strong>${okCount}</strong> revisados OK</span>
    <span><a href="../index.html">← Cookz</a></span>
  `;

  els.list.innerHTML = "";
  cooks.forEach((c) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "audit__item";
    btn.setAttribute("aria-current", String(c.id) === String(selectedId) ? "true" : "false");

    const st = statusFor(c);
    let badge = "";
    if (st === "ok") badge = '<span class="audit__badge audit__badge--ok">Revisado</span>';
    else if (st === "franchise") badge = '<span class="audit__badge audit__badge--franchise">Franquicia</span>';
    else if (st === "pending") badge = '<span class="audit__badge audit__badge--pending">Sin sucursal</span>';

    btn.innerHTML = `
      <span class="audit__item-id">#${c.id} · ${c.city?.es || c.city?.en || ""}</span>
      <span class="audit__item-name">${venueLabel(c)}</span>
      ${badge}
    `;
    btn.addEventListener("click", () => {
      selectedId = c.id;
      renderList();
      renderPanel();
    });
    li.appendChild(btn);
    els.list.appendChild(li);
  });
}

function renderTable() {
  const rows = buildExportTable(cooks);
  els.tableBody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td>${r.id}</td>
      <td>${r.name}</td>
      <td>${r.es}</td>
      <td>${r.ja}</td>
      <td><a href="${r.maps}" target="_blank" rel="noopener">${r.maps === "—" ? "—" : "Maps"}</a></td>
      <td>${r.flag}</td>
    </tr>`
    )
    .join("");
}

async function renderPanel() {
  const cook = cooks.find((c) => c.id === selectedId) || cooks[0];
  if (!cook) {
    els.panel.innerHTML = "<p>No hay datos.</p>";
    return;
  }

  const addr = cook.address || {};
  els.panel.innerHTML = `
    <h2 class="audit__title">${venueLabel(cook)}</h2>
    <p class="audit__meta">ID ${cook.id} · ${cook.folder || ""}${cook.franchiseSearch ? " · cadena (ubicación genérica)" : ""}</p>

    <div class="audit__grid">
      <section class="audit__block">
        <h2>Datos en cooks-data.js</h2>
        <dl class="audit__dl">
          <div class="audit__row"><dt>ES</dt><dd>${addr.es || "—"}</dd></div>
          <div class="audit__row"><dt>EN</dt><dd>${addr.en || "—"}</dd></div>
          <div class="audit__row"><dt>JA</dt><dd>${addr.ja || "—"}</dd></div>
          <div class="audit__row"><dt>mapsUrl</dt><dd><a href="${cook.mapsUrl || "#"}" target="_blank" rel="noopener">${cook.mapsUrl || "—"}</a></dd></div>
        </dl>
      </section>
      <section class="audit__block">
        <h2>Nueva dirección</h2>
        <label class="audit__row" for="new-address-line">
          <dt>Pega aquí (texto o enlace de Maps)</dt>
          <input
            type="text"
            id="new-address-line"
            class="audit__line"
            placeholder="Pega la dirección o el enlace maps.app.goo.gl; Tab fuera del campo para ver el mapa"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <p class="audit__hint">No toca los datos hasta «Aplicar borrador». El mapa de la derecha solo se actualiza al salir del campo (Tab o clic fuera).</p>
      </section>
    </div>

    <div class="audit__grid audit__grid--maps" style="margin-top:1rem">
      <section class="audit__block">
        <h2>Mapa · ubicación actual</h2>
        <iframe class="audit__iframe" id="iframe-current" title="Ubicación actual" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <p class="audit__hint" id="current-hint"></p>
      </section>
      <section class="audit__block">
        <h2>Mapa · nueva ubicación</h2>
        <iframe class="audit__iframe" id="iframe-new" title="Nueva ubicación" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </section>
    </div>

    <div class="audit__actions">
      <button type="button" class="audit__btn audit__btn--primary" id="btn-apply">Aplicar borrador (local)</button>
      <button type="button" class="audit__btn" id="btn-ok">Marcar revisado OK (sin cambios)</button>
      <button type="button" class="audit__btn" id="btn-reset">Quitar borrador de este local</button>
    </div>

    <div class="audit__snippet">
      <h2 class="audit__block" style="border:0;padding:0;background:transparent"><span style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted)">Snippet para cooks-data.js (id ${cook.id})</span></h2>
      <textarea id="snippet" readonly></textarea>
    </div>
  `;

  const iframeCurrent = document.getElementById("iframe-current");
  const iframeNew = document.getElementById("iframe-new");
  const hint = document.getElementById("current-hint");
  const snippetEl = document.getElementById("snippet");
  const newLine = document.getElementById("new-address-line");

  const draft = overrides[String(cook.id)];
  newLine.value = draft?.newAddress ?? "";

  snippetEl.value = cookSnippet(cook);

  const currentQuery = await resolveEmbedQuery(cook.mapsUrl, addr.ja || addr.es);
  const currentSrc = currentQuery
    ? embedSrcFromQuery(currentQuery)
    : await mapsEmbedSrc(cook.mapsUrl || "");
  if (currentSrc) {
    iframeCurrent.src = currentSrc;
    hint.textContent = "";
  } else {
    hint.textContent = "No se pudo embeber: abre mapsUrl en otra pestaña para comparar.";
    iframeCurrent.removeAttribute("src");
  }

  const refreshNewMap = async () => {
    const text = newLine.value.trim();
    if (!text) {
      iframeNew.removeAttribute("src");
      return;
    }
    const src = await mapsEmbedSrc(text);
    if (src) iframeNew.src = src;
    else iframeNew.removeAttribute("src");
  };

  newLine.addEventListener("change", refreshNewMap);
  if (newLine.value.trim()) refreshNewMap();

  document.getElementById("btn-apply").addEventListener("click", async () => {
    const line = newLine.value.trim();
    if (!line) return;
    const isUrl = /^https?:\/\//i.test(line);
    const mapsUrl = isUrl ? await mapsUrlFromLineResolved(line) : mapsUrlFromLine(line);
    overrides[String(cook.id)] = {
      newAddress: line,
      mapsUrl,
      address: {
        es: isUrl ? draft?.address?.es ?? addr.es : line,
        en: draft?.address?.en ?? addr.en,
        ja: draft?.address?.ja ?? addr.ja,
      },
      status: "fixed",
    };
    saveOverrides(overrides);
    cooks = COOKS.map((c) => mergeCook(c, overrides));
    renderList();
    renderTable();
    renderExportJson();
    renderPanel();
  });

  document.getElementById("btn-ok").addEventListener("click", () => {
    overrides[String(cook.id)] = { status: "ok" };
    saveOverrides(overrides);
    cooks = COOKS.map((c) => mergeCook(c, overrides));
    renderList();
    renderPanel();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    delete overrides[String(cook.id)];
    saveOverrides(overrides);
    cooks = COOKS.map((c) => mergeCook(c, overrides));
    renderList();
    renderTable();
    renderExportJson();
    renderPanel();
  });
}

function renderExportJson() {
  const payload = cooks.map((c) => ({
    id: c.id,
    venue: venueLabel(c),
    mapsUrl: c.mapsUrl,
    address: c.address,
    franchiseSearch: Boolean(c.franchiseSearch),
    auditStatus: c._auditStatus || null,
  }));
  els.exportJson.value = JSON.stringify(payload, null, 2);
}

function init() {
  if (!cooks.length) {
    els.panel.innerHTML = "<p>Carga <code>data/cooks-data.js</code> antes de este script.</p>";
    return;
  }
  renderList();
  renderTable();
  renderPanel();
  renderExportJson();

  document.getElementById("btn-copy-json")?.addEventListener("click", () => {
    els.exportJson.select();
    document.execCommand("copy");
  });

  document.getElementById("btn-clear-all")?.addEventListener("click", () => {
    if (!window.confirm("¿Borrar todos los borradores guardados en este navegador?")) return;
    overrides = {};
    saveOverrides(overrides);
    cooks = COOKS.map((c) => mergeCook(c, overrides));
    renderList();
    renderTable();
    renderPanel();
    renderExportJson();
  });
}

init();
