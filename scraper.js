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

// ==================== ImmoScout24 ====================
async function scrapeImmoScout24() {
  const url =
    "https://www.immobilienscout24.de/Suche/de/niedersachsen/stade-kreis/buxtehude/wohnung-mieten?enteredFrom=result_list";
  console.log("  📡 ImmoScout24...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $('article[data-item="result"], li.result-list__listing').each((_, el) => {
    try {
      const $el = $(el);
      const titleEl = $el.find(
        'h2 a, [data-go-to-expose-id], .result-list-entry__brand-title, a[title]'
      );
      const title =
        titleEl.text().trim() ||
        $el.find("h5, h2").first().text().trim() ||
        "Wohnung in Buxtehude";

      const link = titleEl.attr("href") || $el.find("a").first().attr("href");
      const fullUrl = link
        ? link.startsWith("http")
          ? link
          : `https://www.immobilienscout24.de${link}`
        : "";

      const id =
        $el.attr("data-go-to-expose-id") ||
        $el.attr("data-id") ||
        (link && link.match(/\/(\d+)/) ? link.match(/\/(\d+)/)[1] : "");

      const priceText = $el
        .find(
          '[data-is24-qa="is24qa-kaltmiete"], .result-list-entry__primary-criterion:first-child dd, .result-list-entry__criteria dd'
        )
        .first()
        .text();
      const price = parsePrice(priceText);

      const sizeText = $el
        .find(
          '[data-is24-qa="is24qa-wohnflaeche"], .result-list-entry__primary-criterion:nth-child(2) dd'
        )
        .text();
      const roomsText = $el
        .find(
          '[data-is24-qa="is24qa-zi"], .result-list-entry__primary-criterion:nth-child(3) dd'
        )
        .text();

      const address = $el
        .find(
          ".result-list-entry__address, [data-is24-qa='is24qa-entryAddress']"
        )
        .text()
        .trim();

      const allText = $el.text();
      const features = detectFeatures(allText);

      if (id && title) {
        results.push({
          externalId: `immoscout24-${id}`,
          title,
          address: address || "Buxtehude",
          price,
          rooms: parseNumber(roomsText),
          size: parseNumber(sizeText),
          source: "ImmoScout24",
          url: fullUrl,
          ...features,
        });
      }
    } catch (e) {
      /* skip bad entries */
    }
  });

  // Also try JSON-LD or script data
  try {
    const scriptContent = $('script[type="application/json"]').text();
    if (scriptContent) {
      const jsonData = JSON.parse(scriptContent);
      // Try to extract from IS24 JSON format
      const items =
        jsonData?.searchResponseModel?.["resultlist.resultlist"]?.[
          "resultlistEntries"
        ]?.[0]?.["resultlistEntry"] || [];
      for (const item of items) {
        const data = item?.["resultlist.realEstate"];
        if (!data) continue;
        const id = data.id || item["@id"];
        const existsAlready = results.some(
          (r) => r.externalId === `immoscout24-${id}`
        );
        if (existsAlready) continue;

        const allText = JSON.stringify(data);
        results.push({
          externalId: `immoscout24-${id}`,
          title: data.title || "Wohnung in Buxtehude",
          address:
            data.address?.description?.text ||
            [data.address?.street, data.address?.city].filter(Boolean).join(", ") ||
            "Buxtehude",
          price: data.price?.value || 0,
          rooms: data.numberOfRooms || null,
          size: data.livingSpace || null,
          source: "ImmoScout24",
          url: `https://www.immobilienscout24.de/expose/${id}`,
          ...detectFeatures(allText),
        });
      }
    }
  } catch (e) {
    /* JSON parsing failed, that's ok */
  }

  console.log(`    ✅ ImmoScout24: ${results.length} listings`);
  return results;
}

// ==================== Immowelt ====================
async function scrapeImmowelt() {
  const url =
    "https://www.immowelt.de/suche/buxtehude/wohnungen/mieten";
  console.log("  📡 Immowelt...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $(
    '[data-test="search-result-listitem"], .EstateItem, .listitem_wrap, div[class*="EstateItem"]'
  ).each((_, el) => {
    try {
      const $el = $(el);
      const titleEl = $el.find("h2, [data-test='title'], a[title]").first();
      const title = titleEl.text().trim() || "Wohnung in Buxtehude";

      const link = $el.find("a").first().attr("href");
      const fullUrl = link
        ? link.startsWith("http")
          ? link
          : `https://www.immowelt.de${link}`
        : "";

      const idMatch = fullUrl.match(/\/(\w+)$/);
      const id = idMatch ? idMatch[1] : "";

      const priceText = $el
        .find('[data-test="price"], .price_value, .hardfact:first-child')
        .first()
        .text();
      const price = parsePrice(priceText);

      const details = $el.find(
        ".hardfact, .hardfacts span, [data-test*='area'], [data-test*='rooms']"
      );
      let rooms = null,
        size = null;
      details.each((__, d) => {
        const t = $(d).text();
        if (/zimmer|zi\./i.test(t)) rooms = parseNumber(t);
        else if (/m²/i.test(t)) size = parseNumber(t);
      });

      const address = $el
        .find('[data-test="location"], .location, .listlocation')
        .text()
        .trim();
      const features = detectFeatures($el.text());

      if (id && title) {
        results.push({
          externalId: `immowelt-${id}`,
          title,
          address: address || "Buxtehude",
          price,
          rooms,
          size,
          source: "Immowelt",
          url: fullUrl,
          ...features,
        });
      }
    } catch (e) {
      /* skip */
    }
  });

  console.log(`    ✅ Immowelt: ${results.length} listings`);
  return results;
}

// ==================== Kleinanzeigen ====================
async function scrapeKleinanzeigen() {
  const url =
    "https://www.kleinanzeigen.de/s-wohnung-mieten/buxtehude/c203l3322";
  console.log("  📡 Kleinanzeigen...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

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

      // Try to extract rooms/size from description
      const roomsMatch = descText.match(/([\d,]+)\s*(?:zimmer|zi\.?|räume)/i);
      const sizeMatch = descText.match(/([\d,]+)\s*m²/i);

      // Skip if it looks like WG
      if (/\bwg\b|wohngemeinschaft|mitbewohner/i.test(descText)) return;

      if (id) {
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
      }
    } catch (e) {
      /* skip */
    }
  });

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

// ==================== ohne-makler.net ====================
async function scrapeOhneMakler() {
  const url =
    "https://www.ohne-makler.net/immobiliensuche/?marketing_type=miete&property_type=wohnung&city=Buxtehude";
  console.log("  📡 ohne-makler.net...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $(".property-listing, .listing-item, article, .property, .result-item").each(
    (_, el) => {
      try {
        const $el = $(el);
        const titleEl = $el.find("h2 a, h3 a, .title a, a.property-link").first();
        const title = titleEl.text().trim();
        if (!title) return;

        const link =
          titleEl.attr("href") || $el.find("a").first().attr("href");
        const fullUrl = link
          ? link.startsWith("http")
            ? link
            : `https://www.ohne-makler.net${link}`
          : "";

        const idMatch = fullUrl.match(/\/(\d+)/);
        const id = idMatch ? idMatch[1] : "";

        const allText = $el.text();
        const priceMatch = allText.match(/([\d.,]+)\s*€/i);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

        const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.)/i);
        const sizeMatch = allText.match(/([\d,]+)\s*m²/i);

        const address = $el.find(".location, .address, .ort, .city").text().trim();
        const features = detectFeatures(allText);
        features.noCommission = true; // ohne-makler = no commission by default

        if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;

        if (id) {
          results.push({
            externalId: `ohnemakler-${id}`,
            title,
            address: address || "Buxtehude",
            price,
            rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
            size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
            source: "ohne-makler.net",
            url: fullUrl,
            ...features,
          });
        }
      } catch (e) {
        /* skip */
      }
    }
  );

  console.log(`    ✅ ohne-makler.net: ${results.length} listings`);
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

// ==================== meinestadt.de ====================
async function scrapeMeineStadt() {
  const url =
    "https://www.meinestadt.de/buxtehude/immobilien/wohnungen?etype=rent";
  console.log("  📡 meinestadt.de...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $('a[href*="/expose/"], [class*="result"], [class*="listing"], article').each((_, el) => {
    try {
      const $el = $(el);
      const link = $el.is("a") ? $el.attr("href") : $el.find("a").first().attr("href");
      if (!link) return;
      const fullUrl = link.startsWith("http")
        ? link
        : `https://www.meinestadt.de${link}`;

      const idMatch = link.match(/expose\/(\d+)/i) || link.match(/\/(\d+)/);
      const id = idMatch ? idMatch[1] : "";
      if (!id) return;

      // Skip duplicate IDs
      if (results.some((r) => r.externalId === `meinestadt-${id}`)) return;

      const allText = $el.text().trim();
      if (!allText || allText.length < 10) return;

      const title = $el.find("h2, h3, [class*='title']").first().text().trim() ||
        allText.split(/\n/)[0]?.trim()?.substring(0, 100) || "Wohnung in Buxtehude";

      const priceMatch = allText.match(/([\d.,]+)\s*€/i);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

      const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.?|Räume)/i);
      const sizeMatch = allText.match(/([\d.,]+)\s*m²/i);

      const features = detectFeatures(allText);
      if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;

      results.push({
        externalId: `meinestadt-${id}`,
        title,
        address: "Buxtehude",
        price,
        rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
        size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
        source: "meinestadt.de",
        url: fullUrl,
        ...features,
      });
    } catch (e) {
      /* skip */
    }
  });

  console.log(`    ✅ meinestadt.de: ${results.length} listings`);
  return results;
}

// ==================== Nestoria ====================
async function scrapeNestoria() {
  const url =
    "https://www.nestoria.de/buxtehude/wohnung/mieten";
  console.log("  📡 Nestoria...");
  const html = await fetchPage(url);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $('a[href*="/detail/"], .result, .listing, [class*="PropertyCard"], [class*="property"]').each((_, el) => {
    try {
      const $el = $(el);
      const link = $el.is("a") ? $el.attr("href") : $el.find("a").first().attr("href");
      if (!link) return;
      const fullUrl = link.startsWith("http")
        ? link
        : `https://www.nestoria.de${link}`;

      const idMatch = link.match(/detail\/(\d+)/i) || link.match(/\/(\d+)/);
      const id = idMatch ? idMatch[1] : "";
      if (!id) return;

      if (results.some((r) => r.externalId === `nestoria-${id}`)) return;

      const allText = $el.text().trim();
      if (!allText || allText.length < 10) return;

      const title = $el.find("h2, h3, [class*='title']").first().text().trim() ||
        allText.split(/\n/)[0]?.trim()?.substring(0, 100) || "Wohnung in Buxtehude";

      const priceMatch = allText.match(/([\d.,]+)\s*€/i);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;

      const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.?)/i);
      const sizeMatch = allText.match(/([\d.,]+)\s*m²/i);

      const features = detectFeatures(allText);
      if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;

      results.push({
        externalId: `nestoria-${id}`,
        title,
        address: "Buxtehude",
        price,
        rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
        size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
        source: "Nestoria",
        url: fullUrl,
        ...features,
      });
    } catch (e) {
      /* skip */
    }
  });

  console.log(`    ✅ Nestoria: ${results.length} listings`);
  return results;
}

// ==================== Main scrape function ====================
async function scrapeAll() {
  console.log("\n🔍 Starting apartment scrape...");
  const startTime = Date.now();

  const scrapers = [
    scrapeImmoScout24,
    scrapeImmowelt,
    scrapeKleinanzeigen,
    scrapeWohnungsboerse,
    scrapeOhneMakler,
    scrapeMarktDe,
    scrapeMeineStadt,
    scrapeNestoria,
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n✅ Scrape complete in ${elapsed}s: ${allResults.length} total listings found`
  );

  return { apartments: allResults, stats: sourceStats };
}

module.exports = { scrapeAll };
