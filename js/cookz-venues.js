/**
 * Cookz list + media paths; addresses/maps from root cooks-data.js (COOKS).
 */
function titleCaseWords(raw) {
  return String(raw || "")
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildCookzVenues(lang = "es") {
  const PENDING = "media/photo/pending.jpg";
  const LIST_NAMES = {
    1: "Gyōkai Sakaba Nakayoshi",
    2: "Naochan_ramen",
    3: "Kakyo",
    4: "Quatre_Patisserie_Française",
    5: "029_Kichijoji_Shokudo",
    6: "Konbini",
    7: "Sukiya",
    8: "Maguro Garage",
    9: "Sammo",
    10: "Daichu",
    11: "Coco Curry",
    12: "Mifuku",
    13: "Menya Musashi Bukotsu Gaiden",
    14: "Knife Shop Koujin",
    15: "Earth_Izakaya",
    16: "Yakiniku_no_Watami_Umeda_Chayamachi",
  };
  const MEDIA = {
    1: {
      hover: "media/photo/gyokai/hover.jpg",
      photos: [
        "media/photo/gyokai/a.jpg",
        "media/photo/gyokai/b.jpg",
        "media/photo/gyokai/c.jpg",
        "media/photo/gyokai/d.jpg",
      ],
    },
    2: {
      hover: "media/photo/naochan/hover.jpg",
      photos: [
        "media/photo/naochan/a.jpg",
        "media/photo/naochan/b.jpg",
        "media/photo/naochan/c.jpg",
        "media/photo/naochan/d.jpg",
      ],
    },
    3: {
      hover: "media/photo/kakyo/hover.jpg",
      photos: [
        "media/photo/kakyo/a.jpg",
        "media/photo/kakyo/b.jpg",
        "media/photo/kakyo/c.jpg",
        "media/photo/kakyo/d.jpg",
      ],
    },
    4: {
      hover: "media/photo/quatre/hover.jpg",
      photos: [
        "media/photo/quatre/a.jpg",
        "media/photo/quatre/b.jpg",
        "media/photo/quatre/c.jpg",
        "media/photo/quatre/d.jpg",
      ],
    },
    5: {
      hover: "media/photo/029/hover.jpg",
      photos: [
        "media/photo/029/a.jpg",
        "media/photo/029/b.jpg",
        "media/photo/029/c.jpg",
        "media/photo/029/d.jpg",
      ],
    },
    6: {
      hover: "media/photo/seven/hover.jpg",
      photos: [
        "media/photo/seven/a.jpg",
        "media/photo/seven/b.jpg",
        "media/photo/seven/c.jpg",
        "media/photo/seven/d.jpg",
      ],
    },
    7: {
      hover: "media/photo/sukiya/hover.jpg",
      photos: [
        "media/photo/sukiya/a.jpg",
        "media/photo/sukiya/b.jpg",
        "media/photo/sukiya/c.jpg",
        "media/photo/sukiya/d.jpg",
      ],
    },
    8: {
      hover: "media/photo/maguro/hover.jpg",
      photos: [
        "media/photo/maguro/a.jpg",
        "media/photo/maguro/b.jpg",
        "media/photo/maguro/c.jpg",
        "media/photo/maguro/d.jpg",
      ],
    },
    9: {
      hover: "media/photo/sammo/hover.jpg",
      photos: ["media/photo/sammo/a.jpg", "media/photo/sammo/b.jpg"],
    },
    10: {
      hover: "media/photo/daichu/hover.jpg",
      photos: [
        "media/photo/daichu/a.jpg",
        "media/photo/daichu/b.jpg",
        "media/photo/daichu/c.jpg",
        "media/photo/daichu/d.jpg",
      ],
    },
    11: {
      hover: "media/photo/coco/hover.jpg",
      photos: [
        "media/photo/coco/a.jpg",
        "media/photo/coco/b.jpg",
        "media/photo/coco/c.jpg",
        "media/photo/coco/d.jpg",
      ],
    },
    12: {
      hover: "media/photo/mifuku/hover.jpg",
      photos: [
        "media/photo/mifuku/a.jpg",
        "media/photo/mifuku/b.jpg",
        "media/photo/mifuku/c.jpg",
        "media/photo/mifuku/d.jpg",
      ],
    },
    13: {
      hover: "media/photo/musashi/hover.jpg",
      photos: [
        "media/photo/musashi/a.jpg",
        "media/photo/musashi/b.jpg",
        "media/photo/musashi/c.jpg",
        "media/photo/musashi/d.jpg",
      ],
    },
    14: {
      hover: "media/photo/koujin/hover.jpg",
      photos: [
        "media/photo/koujin/a.jpg",
        "media/photo/koujin/b.jpg",
        "media/photo/koujin/c.jpg",
        "media/photo/koujin/d.jpg",
      ],
    },
    15: {
      hover: "media/photo/earth/hover.jpg",
      photos: [
        "media/photo/earth/a.jpg",
        "media/photo/earth/b.jpg",
        "media/photo/earth/c.jpg",
        "media/photo/earth/d.jpg",
      ],
    },
    16: {
      hover: "media/photo/watami/hover.jpg",
      photos: [
        "media/photo/watami/ticket.png",
        "media/photo/watami/a.jpg",
        "media/photo/watami/b.jpg",
        "media/photo/watami/c.jpg",
      ],
    },
  };

  if (typeof COOKS === "undefined" || !COOKS.length) return [];

  const L = lang === "ja" ? "ja" : lang === "en" ? "en" : "es";

  function orderBlock(entry, langKey) {
    const orderLine = entry.order?.[langKey] || "";
    const totalLine = entry.total?.[langKey] || "";
    const parts = [];
    if (orderLine && orderLine !== "—") parts.push(orderLine);
    if (totalLine && totalLine !== "¥—") parts.push(`Total: ${totalLine}`);
    return parts.join("\n");
  }

  function addressLine(entry, langKey) {
    const raw = entry.address?.[langKey] || "";
    if (!raw || raw.startsWith("—")) return null;
    return raw;
  }

  return [...COOKS]
    .sort((a, b) => a.id - b.id)
    .map((c) => {
      const m = MEDIA[c.id] || {};
      const rawAddr = c.address?.[L] || c.address?.es || "";
      const hasAddr = rawAddr && !rawAddr.startsWith("—");
      const orderWest = orderBlock(c, L);
      const orderJa = orderBlock(c, "ja");

      const venueJa = c.venue?.ja || "";
      const venueRomajiRaw =
        c.venueRomaji ||
        LIST_NAMES[c.id]?.replace(/_/g, " ") ||
        c.venue?.en ||
        `Cook ${c.id}`;
      const listNameRaw = LIST_NAMES[c.id] || c.venue?.en || `Cook ${c.id}`;

      const pool =
        typeof COOKZ_POOL !== "undefined" && COOKZ_POOL[c.id]?.length
          ? COOKZ_POOL[c.id]
          : (m.photos || []).map((src) => ({ src, name: src.split("/").pop() }));

      return {
        id: c.id,
        name: titleCaseWords(listNameRaw),
        venueJa,
        venueRomaji: titleCaseWords(venueRomajiRaw),
        ja: venueJa,
        addressJa: addressLine(c, "ja"),
        addressLine: hasAddr ? rawAddr : null,
        franchise: Boolean(c.franchiseSearch),
        mapsUrl: c.mapsUrl || "",
        orderJa: orderJa || null,
        order: orderWest || null,
        hover: m.hover || PENDING,
        photos: m.photos?.length ? m.photos : [PENDING],
        pool,
      };
    });
}
