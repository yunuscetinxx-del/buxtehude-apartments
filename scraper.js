const cheerio = require("cheerio");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
  "Cache-Control": "no-cache",
};

async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`  ⚠ HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.log(`  ⚠ Fetch error for ${url}: ${err.message}`);
    return null;
  }
}

function parsePrice(text) {
  if (!text) return 0;
  const match = text.replace(/\./g, "").match(/([\d,]+)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(",", ".")) || 0;
}

function parseNumber(text) {
  if (!text) return null;
  const match = text.replace(/\./g, "").match(/([\d,]+)/);
  if (!match) return null;
  return parseFloat(match[1].replace(",", ".")) || null;
}

function isBuxtehude(text) {
  const lower = (text || "").toLowerCase();
  return /buxtehude|21614/.test(lower);
}

function detectFeatures(text) {
  const lower = (text || "").toLowerCase();
  return {
    noCommission:
      /provisionsfrei|keine provision|ohne provision|ohne makler/i.test(lower),
    furnished: /möbliert|furnished/i.test(lower),
    hasBalcony: /balkon|terrasse|loggia/i.test(lower),
    hasGarden: /garten|garden/i.test(lower),
    hasParking:
      /stellplatz|garage|parkplatz|tiefgarage|carport|parking/i.test(lower),
  };
}

// ==================== Kleinanzeigen ====================
async function scrapeKleinanzeigen() {
  console.log("  📡 Kleinanzeigen...");
  const results = [];
  const seenIds = new Set();

  // Scrape pages 1-2 for more results
  for (let page = 1; page <= 2; page++) {
    const url = page === 1
      ? "https://www.kleinanzeigen.de/s-wohnung-mieten/buxtehude/c203l3322"
      : `https://www.kleinanzeigen.de/s-wohnung-mieten/buxtehude/seite:${page}/c203l3322`;

    const html = await fetchPage(url);
    if (!html) break;

    const $ = cheerio.load(html);
    let pageCount = 0;

    $("article.aditem, .ad-listitem, li.ad-listitem").each((_, el) => {
      try {
        const $el = $(el);
        const titleEl = $el.find("a.ellipsis, h2 a, .aditem-main--middle--title a").first();
        const title = titleEl.text().trim() || "Wohnung in Buxtehude";

        const link = titleEl.attr("href") || $el.find("a").first().attr("href");
        const fullUrl = link
          ? link.startsWith("http")
            ? link
            : `https://www.kleinanzeigen.de${link}`
          : "";

        const id = $el.attr("data-adid") || $el.attr("data-id") || "";
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);

        const priceText = $el
          .find(".aditem-main--middle--price-shipping--price, .aditem-main--middle--price, .price-shipping--price")
          .first()
          .text();
        const price = parsePrice(priceText);

        const address = $el
          .find(".aditem-main--top--left, .aditem-details--location")
          .text()
          .trim();

        const descText = $el.text();
        const features = detectFeatures(descText);

        const roomsMatch = descText.match(/([\d,]+)\s*(?:zimmer|zi\.?|räume)/i);
        const sizeMatch = descText.match(/([\d,]+)\s*m²/i);

        if (/\bwg\b|wohngemeinschaft|mitbewohner/i.test(descText)) return;

        // Only keep Buxtehude listings (skip promoted ads from other cities)
        if (!isBuxtehude(address + ' ' + title)) return;

        results.push({
          externalId: `kleinanzeigen-${id}`,
          title,
          address: address || "Buxtehude",
          price,
          rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
          size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
          source: "Kleinanzeigen",
          url: fullUrl,
          ...features,
        });
        pageCount++;
      } catch (e) {
        /* skip */
      }
    });

    if (pageCount === 0) break; // No more results
  }

  console.log(`    ✅ Kleinanzeigen: ${results.length} listings`);
  return results;
}

// ==================== Wohnungsbörse ====================
async function scrapeWohnungsboerse() {
  const url =
    "https://www.wohnungsboerse.net/Buxtehude/mieten/wohnungen";
  console.log("  📡 Wohnungsbörse...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  // Links are like: /immodetail/XXXXX with text like "Title\nBuxtehude Kaltmiete 1.200 € Zimmer 3 Fläche 100 m²"
  $('a[href*="/immodetail/"]').each((_, el) => {
    try {
      const $el = $(el);
      const link = $el.attr("href") || "";
      const fullUrl = link.startsWith("http")
        ? link
        : `https://www.wohnungsboerse.net${link}`;

      const idMatch = link.match(/immodetail\/(\d+)/);
      const id = idMatch ? idMatch[1] : "";
      if (!id) return;

      const allText = $el.text().trim();
      const lines = allText.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const title = lines[0] || "Wohnung in Buxtehude";

      const priceMatch = allText.match(/Kaltmiete\s*([\d.,]+)\s*€/i);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

      const roomsMatch = allText.match(/Zimmer\s*([\d,]+)/i);
      const sizeMatch = allText.match(/Fläche\s*([\d.,]+)\s*m²/i);

      const addressMatch = allText.match(/(?:Buxtehude|Stade)[^\n]*/i);
      const address = addressMatch ? addressMatch[0].trim() : "Buxtehude";

      const features = detectFeatures(allText);

      if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;
      if (!isBuxtehude(allText)) return;

      results.push({
        externalId: `wohnungsboerse-${id}`,
        title,
        address,
        price,
        rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
        size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
        source: "Wohnungsbörse",
        url: fullUrl,
        ...features,
      });
    } catch (e) {
      /* skip */
    }
  });

  console.log(`    ✅ Wohnungsbörse: ${results.length} listings`);
  return results;
}

// ==================== markt.de ====================
async function scrapeMarktDe() {
  const url =
    "https://www.markt.de/buxtehude/immobilien/mietwohnungen/";
  console.log("  📡 markt.de...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  // Each listing is an h2 with a link, followed by description and price
  $("h2").each((_, el) => {
    try {
      const $h2 = $(el);
      const $a = $h2.find("a").first();
      const title = $a.text().trim();
      if (!title) return;

      const link = $a.attr("href") || "";
      if (!link.includes("markt.de")) return;
      const fullUrl = link.startsWith("http")
        ? link.split("?")[0]
        : `https://www.markt.de${link.split("?")[0]}`;

      // Extract ID from URL like /a/0c62f610/
      const idMatch = link.match(/\/a\/([a-f0-9]+)/);
      const id = idMatch ? idMatch[1] : "";
      if (!id) return;

      // Get the surrounding text for price/details
      const $parent = $h2.parent();
      const allText = $parent.text();

      const priceMatch = allText.match(/([\d.,]+)\s*€\s*Nettokaltmiete/i);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

      const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.)/i) || title.match(/([\d,]+)-Zimmer/i);
      const sizeMatch = allText.match(/([\d.,]+)\s*m²/i);

      const features = detectFeatures(allText + " " + title);

      if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;

      results.push({
        externalId: `marktde-${id}`,
        title,
        address: "21614 Buxtehude",
        price,
        rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
        size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
        source: "markt.de",
        url: fullUrl,
        ...features,
      });
    } catch (e) {
      /* skip */
    }
  });

  console.log(`    ✅ markt.de: ${results.length} listings`);
  return results;
}

// ==================== Main scrape function ====================
async function scrapeAll() {
  console.log("\n🔍 Starting apartment scrape...");
  const startTime = Date.now();

  const scrapers = [
    scrapeKleinanzeigen,
    scrapeWohnungsboerse,
    scrapeMarktDe,
  ];

  const allResults = [];
  const sourceStats = [];

  for (const scraper of scrapers) {
    try {
      const results = await scraper();
      allResults.push(...results);
      sourceStats.push({
        source: scraper.name.replace("scrape", ""),
        count: results.length,
      });
    } catch (err) {
      console.error(`  ❌ Scraper error: ${err.message}`);
      sourceStats.push({
        source: scraper.name.replace("scrape", ""),
        count: 0,
        error: err.message,
      });
    }
  }

  // Final safety filter: only Buxtehude apartments
  const filtered = allResults.filter(a =>
    isBuxtehude(a.title + ' ' + a.address)
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n✅ Scrape complete in ${elapsed}s: ${filtered.length} Buxtehude listings (${allResults.length - filtered.length} non-Buxtehude filtered out)`
  );

  return { apartments: filtered, stats: sourceStats };
}

module.exports = { scrapeAll };
