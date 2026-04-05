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

// ==================== Area Configuration ====================
const AREAS = [
  {
    name: "Buxtehude",
    zip: "21614",
    ka: "buxtehude/c203l3322",
    kaPages: 2,
    markt: "buxtehude",
    wb: "Buxtehude",
  },
  {
    name: "Neukloster",
    zip: "21614",
    ka: "neukloster/c203",
    kaPages: 2,
    markt: "neukloster",
    wb: "Neukloster",
  },
  {
    name: "Neu Wulmstorf",
    zip: "21629",
    ka: "neu-wulmstorf/c203",
    kaPages: 2,
    markt: "neu+wulmstorf",
    wb: "Neu-Wulmstorf",
  },
];

function isValidArea(text) {
  const lower = (text || "").toLowerCase();
  return /buxtehude|21614|neukloster|neu wulmstorf|neu-wulmstorf|21629/.test(lower);
}

// Check if a title mentions a specific location that is NOT one of our areas
// Patterns: "in Berlin", "von Hamburg", location names in title
function titleHasForeignLocation(title) {
  const lower = (title || "").toLowerCase();
  // If title mentions one of our areas, it's fine
  if (isValidArea(lower)) return false;
  // Check if title contains location patterns like "in [City]" or "von [City]"
  // These indicate the listing is for another city
  const locationPattern = /\b(?:in|von|bei|nahe|nähe)\s+([A-ZÄÖÜa-zäöüß][a-zäöüß]+)/gi;
  let match;
  while ((match = locationPattern.exec(title)) !== null) {
    const city = match[1].toLowerCase();
    // Skip common non-city words
    if (/^(der|die|das|den|dem|des|einer|einem|einen|bester|ruhiger|zentraler|guter|schöner|toller|großer|kleiner|netter)$/.test(city)) continue;
    // If it mentions a city that's not our area, reject
    if (!isValidArea(city)) return true;
  }
  return false;
}

function detectArea(text) {
  const lower = (text || "").toLowerCase();
  if (/neu.?wulmstorf|21629/.test(lower)) return "Neu Wulmstorf";
  if (/neukloster/.test(lower)) return "Neukloster";
  if (/buxtehude|21614/.test(lower)) return "Buxtehude";
  return null;
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

  for (const area of AREAS) {
    for (let page = 1; page <= area.kaPages; page++) {
      const url = page === 1
        ? `https://www.kleinanzeigen.de/s-wohnung-mieten/${area.ka}`
        : `https://www.kleinanzeigen.de/s-wohnung-mieten/${area.ka.replace(/\/c/, `/seite:${page}/c`)}`;

      const html = await fetchPage(url);
      if (!html) break;

      const $ = cheerio.load(html);
      let pageCount = 0;

      $("article.aditem, .ad-listitem, li.ad-listitem").each((_, el) => {
        try {
          const $el = $(el);
          const titleEl = $el.find("a.ellipsis, h2 a, .aditem-main--middle--title a").first();
          const title = titleEl.text().trim() || `Wohnung in ${area.name}`;

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

          // Only keep valid area listings (skip promoted ads from other cities)
          if (!isValidArea(address)) return;
          // Also reject if title mentions a foreign city
          if (titleHasForeignLocation(title)) return;

          const detectedArea = detectArea(address + ' ' + title) || area.name;

          results.push({
            externalId: `kleinanzeigen-${id}`,
            title,
            address: address || area.name,
            price,
            rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
            size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
            source: "Kleinanzeigen",
            url: fullUrl,
            area: detectedArea,
            ...features,
          });
          pageCount++;
        } catch (e) {
          /* skip */
        }
      });

      if (pageCount === 0) break; // No more results
    }
  }

  console.log(`    ✅ Kleinanzeigen: ${results.length} listings`);
  return results;
}

// ==================== Wohnungsbörse ====================
async function scrapeWohnungsboerse() {
  console.log("  📡 Wohnungsbörse...");
  const results = [];
  const seenIds = new Set();

  for (const area of AREAS) {
    const url = `https://www.wohnungsboerse.net/${area.wb}/mieten/wohnungen`;
    const html = await fetchPage(url);
    if (!html) continue;

    const $ = cheerio.load(html);

    $('a[href*="/immodetail/"]').each((_, el) => {
      try {
        const $el = $(el);
        const link = $el.attr("href") || "";
        const fullUrl = link.startsWith("http")
          ? link
          : `https://www.wohnungsboerse.net${link}`;

        const idMatch = link.match(/immodetail\/(\d+)/);
        const id = idMatch ? idMatch[1] : "";
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);

        const allText = $el.text().trim();
        const lines = allText.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const title = lines[0] || `Wohnung in ${area.name}`;

        const priceMatch = allText.match(/Kaltmiete\s*([\d.,]+)\s*€/i);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

        const roomsMatch = allText.match(/Zimmer\s*([\d,]+)/i);
        const sizeMatch = allText.match(/Fläche\s*([\d.,]+)\s*m²/i);

        const addressMatch = allText.match(/(?:Buxtehude|Neukloster|Neu.?Wulmstorf|Stade)[^\n]*/i);
        const address = addressMatch ? addressMatch[0].trim() : area.name;

        const features = detectFeatures(allText);

        if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;
        if (!isValidArea(allText)) return;

        const detectedArea = detectArea(allText) || area.name;

        results.push({
          externalId: `wohnungsboerse-${id}`,
          title,
          address,
          price,
          rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
          size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
          source: "Wohnungsbörse",
          url: fullUrl,
          area: detectedArea,
          ...features,
        });
      } catch (e) {
        /* skip */
      }
    });
  }

  console.log(`    ✅ Wohnungsbörse: ${results.length} listings`);
  return results;
}

// ==================== markt.de ====================
async function scrapeMarktDe() {
  console.log("  📡 markt.de...");
  const results = [];
  const seenIds = new Set();

  for (const area of AREAS) {
    const url = `https://www.markt.de/${area.markt}/immobilien/mietwohnungen/`;
    const html = await fetchPage(url);
    if (!html) continue;

    const $ = cheerio.load(html);

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

        const idMatch = link.match(/\/a\/([a-f0-9]+)/);
        const id = idMatch ? idMatch[1] : "";
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);

        const $card = $h2.parent().parent();
        const allText = $card.text();

        const priceMatch = allText.match(/([\d.,]+)\s*€/i);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

        const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.)/i) || title.match(/([\d,]+)-Zimmer/i);
        const sizeMatch = allText.match(/([\d.,]+)\s*m²/i);

        const features = detectFeatures(allText + " " + title);

        if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;

        // Reject listings mentioning other cities in title
        if (titleHasForeignLocation(title)) return;

        // Extract published date (format: DD.MM.YYYY)
        const dateMatch = allText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        let publishedAt = "";
        if (dateMatch) {
          publishedAt = `${dateMatch[3]}-${dateMatch[2].padStart(2,"0")}-${dateMatch[1].padStart(2,"0")}`;
        }

        results.push({
          externalId: `marktde-${id}`,
          title,
          address: `${area.zip} ${area.name}`,
          price,
          rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
          size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
          source: "markt.de",
          url: fullUrl,
          area: area.name,
          publishedAt,
          ...features,
        });
      } catch (e) {
        /* skip */
      }
    });
  }

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

  // Final safety filter: address must contain valid area AND title must not mention foreign city
  const filtered = allResults.filter(a => {
    if (!isValidArea(a.address)) return false;
    if (titleHasForeignLocation(a.title)) return false;
    return true;
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n✅ Scrape complete in ${elapsed}s: ${filtered.length} listings (${allResults.length - filtered.length} invalid filtered out)`
  );

  return { apartments: filtered, stats: sourceStats };
}

// Fetch publish date from a Kleinanzeigen detail page
async function fetchKleinanzeigenDate(url) {
  try {
    const html = await fetchPage(url);
    if (!html) return "";
    const $ = cheerio.load(html);
    const extraInfo = $("#viewad-extra-info").text();
    const dateMatch = extraInfo.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dateMatch) {
      return `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
    }
    return "";
  } catch (e) {
    console.log(`  ⚠ Failed to fetch KA date for ${url}: ${e.message}`);
    return "";
  }
}

module.exports = { scrapeAll, fetchKleinanzeigenDate };
