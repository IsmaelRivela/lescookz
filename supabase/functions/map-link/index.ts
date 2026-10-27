const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "content-type": "application/json",
};

const allowed = (host: string) => {
  const name = host.toLowerCase();
  return name === "maps.app.goo.gl" || name === "goo.gl"
    || name === "google.com" || name === "www.google.com"
    || name === "google.co.jp" || name === "www.google.co.jp"
    || name === "google.es" || name === "www.google.es"
    || name === "maps.google.com" || name === "maps.google.co.jp" || name === "maps.google.es";
};

const mapLink = (url: URL) => {
  if (!/^https?:$/.test(url.protocol) || !allowed(url.hostname)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl") return url.pathname.startsWith("/maps");
  if (host.startsWith("maps.")) return true;
  return url.pathname.startsWith("/maps");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const target = new URL(req.url).searchParams.get("url") || "";
  let current = target.trim();
  try {
    const first = new URL(current);
    if (!mapLink(first)) {
      return new Response(JSON.stringify({ url: "" }), { headers: cors });
    }
  } catch {
    return new Response(JSON.stringify({ url: "" }), { headers: cors });
  }
  for (let hop = 0; hop < 5; hop += 1) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
    });
    const next = res.headers.get("location");
    if (!next || res.status < 300 || res.status >= 400) break;
    const landed = new URL(next, current);
    if (!allowed(landed.hostname)) break;
    current = landed.toString();
  }
  return new Response(JSON.stringify({ url: current }), { headers: cors });
});
