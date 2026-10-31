const allowed = (host) => {
  const name = host.toLowerCase();
  return name === "maps.app.goo.gl" || name === "goo.gl"
    || name === "google.com" || name === "www.google.com"
    || name === "google.co.jp" || name === "www.google.co.jp"
    || name === "google.es" || name === "www.google.es"
    || name === "maps.google.com" || name === "maps.google.co.jp" || name === "maps.google.es";
};

const mapLink = (url) => {
  if (!/^https?:$/.test(url.protocol) || !allowed(url.hostname)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") return url.pathname.startsWith("/maps");
  if (host.startsWith("maps.")) return true;
  return url.pathname.startsWith("/maps");
};

const expand = async (target) => {
  let current = String(target || "").trim();
  let first;
  try { first = new URL(current); } catch { return ""; }
  if (!mapLink(first)) return "";
  for (let hop = 0; hop < 5; hop += 1) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    const next = res.headers.get("location");
    if (!next || res.status < 300 || res.status >= 400) break;
    const landed = new URL(next, current);
    if (!allowed(landed.hostname)) break;
    current = landed.toString();
  }
  return current;
};

const historyFallback = (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/map-link" || url.pathname.includes(".")) return next();
  req.url = "/index.html";
  next();
};

const mapLinkRoute = (req, res, next) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname !== "/map-link") return next();
  expand(url.searchParams.get("url") || "").then((landed) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: landed }));
  }).catch(() => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: "" }));
  });
};

module.exports = {
  server: {
    baseDir: ".",
    middleware: [historyFallback, mapLinkRoute],
  },
  files: [
    "index.html",
    "tools/**/*.html",
    "tools/**/*.css",
    "tools/**/*.js",
    "data/**/*.js",
    "css/**/*.css",
    "js/**/*.js",
    "media/**/*",
  ],
  port: 5178,
  listen: "127.0.0.1",
  open: false,
  notify: false,
  ui: false,
  ghostMode: false,
};
