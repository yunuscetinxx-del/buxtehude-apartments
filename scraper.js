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
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
      redirect: "follow",
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

// ==================== Dynamic City Search ====================
// Module-level search context (swapped for dynamic searches)
let _validator = isValidArea;
let _foreignCheck = titleHasForeignLocation;
let _detectArea = detectArea;

function buildCityConfig(cityName) {
  const lower = cityName.toLowerCase().trim();
  // Convert German umlauts/special chars for URL slugs
  const slug = lower
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const capitalized = cityName.trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
  return {
    name: cityName.trim(),
    zip: '',
    ka: `${slug}/c203`,
    kaPages: 2,
    markt: slug,
    wb: capitalized,
    iw: slug,
  };
}

function createCityValidator(cityName) {
  const lower = cityName.toLowerCase().trim();
  // Also build a umlaut-free variant (München → muenchen) as fallback pattern
  const slugified = lower
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const escape = s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const pat1 = new RegExp(escape(lower).replace(/[\s-]+/g, '[\\s-]?'), 'i');
  const pat2 = slugified !== lower
    ? new RegExp(escape(slugified).replace(/[\s-]+/g, '[\\s-]?'), 'i')
    : null;
  return (text) => pat1.test(text || '') || (pat2 ? pat2.test(text || '') : false);
}

function setSearchContext(cityName) {
  // Use city name validator for accuracy (filters promoted ads from other cities)
  _validator = createCityValidator(cityName);
  _foreignCheck = () => false;
  _detectArea = () => cityName;
}

function resetSearchContext() {
  _validator = isValidArea;
  _foreignCheck = titleHasForeignLocation;
  _detectArea = detectArea;
}

// KA location IDs for major German cities.
// These are stable IDs used by Kleinanzeigen for geographic search.
// Using these ensures results are geographically precise (not national promoted ads).
const KA_LOCATION_IDS = {
  'hamburg': '9409',
  'berlin': '3331',
  'muenchen': '6411',
  'koeln': '161',
  'frankfurt': '6385',
  'frankfurt-am-main': '6385',
  'stuttgart': '151',
  'duesseldorf': '219',
  'dortmund': '4437',
  'essen': '4443',
  'leipzig': '6211',
  'nuernberg': '4217',
  'bremen': '1',
  'hannover': '5473',
  'dresden': '7777',
  'duisburg': '4438',
  'bochum': '4439',
  'wuppertal': '4440',
  'bielefeld': '59',
  'mannheim': '161',
  'bonn': '162',
  'karlsruhe': '7970',
  'muenster': '1',
  'augsburg': '6411',
  'freiburg': '7970',
  'freiburg-im-breisgau': '7970',
  'aachen': '163',
  'kiel': '9410',
  'luebeck': '9411',
  'rostock': '8197',
  'halle': '6212',
  'magdeburg': '8190',
  'erfurt': '8198',
  'kassel': '5474',
  'mainz': '6386',
  'stade': '9412',
  'buxtehude': '3322',
  'jork': '3322r15',          // Jork is near Buxtehude — search l3322 with 15km radius
  'harburg': '9414',
  'lueneburg': '9415',
  'tostedt': '3322r20',
  'rosengarten': '3322r20',
  'neu-wulmstorf': '3323',
  'neukloster': '3322r10',
  'winsen': '9416',
  'buchholz': '9417',
  'seevetal': '9418',
};

// Discover KA geographic location ID — checks hardcoded table first,
// then tries several KA URL patterns to extract location ID from page.
async function discoverKaLocationId(citySlug) {
  // Check hardcoded table first (fast, reliable)
  const tableEntry = KA_LOCATION_IDS[citySlug];
  if (tableEntry) return tableEntry; // may be 'id' or 'idRradius' string

  // Try multiple KA URLs to find location ID
  const urlsToTry = [
    `https://www.kleinanzeigen.de/s-wohnung-mieten/${citySlug}/c203`,
    `https://www.kleinanzeigen.de/s-${citySlug}/zimmer-wohnung/k0`,
    `https://www.kleinanzeigen.de/s-${citySlug}/c203`,
  ];

  for (const url of urlsToTry) {
    try {
      const html = await fetchPage(url);
      if (!html || html.length < 2000) continue;
      const $ = cheerio.load(html);
      let lid = null;
      // Pattern 1: /c203l{id} or /c203l{id}r{radius} in any href
      $('a, link').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/c(?:203)?l(\d+(?:r\d+)?)/);
        if (m) { lid = m[1]; return false; }
      });
      if (lid) return lid;
      // Pattern 2: k0l{id}
      $('a[href*="k0l"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/k0l(\d+)/);
        if (m) { lid = m[1]; return false; }
      });
      if (lid) return lid;
    } catch (e) { continue; }
  }
  return null;
}

// ==================== Kleinanzeigen ====================
async function scrapeKleinanzeigen(customAreas) {
  console.log("  📡 Kleinanzeigen...");
  const results = [];
  const seenIds = new Set();

  for (const area of (customAreas || AREAS)) {
    const pagesToScrape = area.kaPages || 2;
    let gotResults = false;

    for (let page = 1; page <= pagesToScrape; page++) {
      let url;
      if (page === 1) {
        url = `https://www.kleinanzeigen.de/s-wohnung-mieten/${area.ka}`;
      } else {
        // Insert seite:{n} before the category segment  
        url = `https://www.kleinanzeigen.de/s-wohnung-mieten/${area.ka.replace(/\/c/, `/seite:${page}/c`)}`;
      }

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
          const priceType = /warmmiete/i.test(priceText) ? 'Warmmiete' : /kaltmiete/i.test(priceText) ? 'Kaltmiete' : '';

          const address = $el
            .find(".aditem-main--top--left, .aditem-details--location")
            .text()
            .trim();

          const descText = $el.text();
          const features = detectFeatures(descText);

          const roomsMatch = descText.match(/([\d,]+)\s*(?:zimmer|zi\.?|räume)/i);
          const sizeMatch = descText.match(/([\d,]+)\s*m²/i);

          if (/\bwg\b|wohngemeinschaft|mitbewohner/i.test(descText)) return;

          // For location ID-based searches, KA URL guarantees geographic accuracy.
          // Only validate for name-based fallback searches (no location ID).
          if (!area.hasLocationId) {
            if (!_validator(address) && !_validator(descText)) return;
          }
          // Also reject if title mentions a foreign city
          if (_foreignCheck(title)) return;

          const detectedArea = _detectArea(address + ' ' + title) || area.name;

          // Extract images — KA uses data-imgsrc for lazy-loaded thumbnails
          const images = [];
          $el.find(".aditem-image img, .imagebox img, img[data-imgsrc], img").each((_, img) => {
            const $img = $el.find(img);
            const src = $img.attr("data-imgsrc") || $img.attr("data-src") || $img.attr("src") || "";
            if (!src.startsWith("http")) return;
            // Upgrade to a larger variant if possible
            const big = src.replace(/rule=[^&"'\s]+/, 'rule=adimage-750x562-jpg');
            if (!images.includes(big)) images.push(big);
          });

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
            imageUrl: images[0] || "",
            imageUrls: JSON.stringify(images),
            priceType,
            ...features,
          });
          pageCount++;
        } catch (e) {
          /* skip */
        }
      });

      if (pageCount > 0) gotResults = true;
      if (pageCount === 0) break; // No more results on this page
    }

    // Keyword-search fallback: if no results from location URL and no location ID,
    // try KA text search for the city name (catches small towns not indexed by category)
    if (!gotResults && !area.hasLocationId && area.kaKeyword !== false) {
      const citySlug = area.ka.split('/')[0];
      const kwUrl = `https://www.kleinanzeigen.de/s-wohnung-mieten/q-${citySlug}-wohnung/k0`;
      console.log(`    ⤷ KA keyword fallback: ${kwUrl}`);
      const kwHtml = await fetchPage(kwUrl);
      if (kwHtml) {
        const $kw = cheerio.load(kwHtml);
        $kw("article.aditem, .ad-listitem, li.ad-listitem").each((_, el) => {
          try {
            const $el = $kw(el);
            const titleEl = $el.find("a.ellipsis, h2 a, .aditem-main--middle--title a").first();
            const title = titleEl.text().trim();
            if (!title) return;
            const link = titleEl.attr("href") || $el.find("a").first().attr("href");
            const fullUrl = link ? (link.startsWith("http") ? link : `https://www.kleinanzeigen.de${link}`) : "";
            const id = $el.attr("data-adid") || $el.attr("data-id") || "";
            if (!id || seenIds.has(id)) return;
            seenIds.add(id);
            const priceText = $el.find(".aditem-main--middle--price-shipping--price,.aditem-main--middle--price,.price-shipping--price").first().text();
            const price = parsePrice(priceText);
            const priceType = /warmmiete/i.test(priceText) ? 'Warmmiete' : /kaltmiete/i.test(priceText) ? 'Kaltmiete' : '';
            const address = $el.find(".aditem-main--top--left,.aditem-details--location").text().trim();
            const descText = $el.text();
            // Must mention city name in text to be relevant
            if (!_validator(address) && !_validator(descText)) return;
            if (_foreignCheck(title)) return;
            if (/\bwg\b|wohngemeinschaft|mitbewohner/i.test(descText)) return;
            const features = detectFeatures(descText);
            const roomsMatch = descText.match(/([\d,]+)\s*(?:zimmer|zi\.?|räume)/i);
            const sizeMatch = descText.match(/([\d,]+)\s*m²/i);
            const images = [];
            $el.find(".aditem-image img,.imagebox img,img[data-imgsrc],img").each((_, img) => {
              const $img = $kw(img);
              const src = $img.attr("data-imgsrc") || $img.attr("data-src") || $img.attr("src") || "";
              if (!src.startsWith("http")) return;
              const big = src.replace(/rule=[^&"'\s]+/, 'rule=adimage-750x562-jpg');
              if (!images.includes(big)) images.push(big);
            });
            results.push({
              externalId: `kleinanzeigen-${id}`,
              title,
              address: address || area.name,
              price,
              rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
              size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
              source: "Kleinanzeigen",
              url: fullUrl,
              area: _detectArea(address + ' ' + title) || area.name,
              imageUrl: images[0] || "",
              imageUrls: JSON.stringify(images),
              priceType,
              ...features,
            });
          } catch (e) { /* skip */ }
        });
      }
    }
  }

  console.log(`    ✅ Kleinanzeigen: ${results.length} listings`);
  return results;
}

// ==================== Wohnungsbörse ====================
async function scrapeWohnungsboerse(customAreas) {
  console.log("  📡 Wohnungsbörse...");
  const results = [];
  const seenIds = new Set();

  for (const area of (customAreas || AREAS)) {
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
        const warmMatch = allText.match(/Warmmiete\s*([\d.,]+)\s*€/i);
        const price = warmMatch ? parsePrice(warmMatch[1]) : (priceMatch ? parsePrice(priceMatch[1]) : 0);
        const wbPriceType = warmMatch ? 'Warmmiete' : (priceMatch ? 'Kaltmiete' : '');

        const roomsMatch = allText.match(/Zimmer\s*([\d,]+)/i);
        const sizeMatch = allText.match(/Fläche\s*([\d.,]+)\s*m²/i);

        const addressMatch = allText.match(/(?:Buxtehude|Neukloster|Neu.?Wulmstorf|Stade)[^\n]*/i);
        const address = addressMatch ? addressMatch[0].trim() : area.name;

        const features = detectFeatures(allText);

        if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;
        if (!_validator(allText)) return;

        const detectedArea = _detectArea(allText) || area.name;

        // Extract image
        const wbImg = $el.find("img").first();
        const wbImageUrl = wbImg.attr("src") || wbImg.attr("data-src") || "";

        results.push({
          externalId: `wohnungsboerse-${id}`,
          title,
          address,
          price,
          rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
          size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
          source: "Wohnungsb\u00f6rse",
          url: fullUrl,
          area: detectedArea,
          imageUrl: wbImageUrl.startsWith("http") ? wbImageUrl : "",
          imageUrls: wbImageUrl.startsWith("http") ? JSON.stringify([wbImageUrl]) : "[]",
          priceType: wbPriceType,
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
async function scrapeMarktDe(customAreas) {
  console.log("  📡 markt.de...");
  const results = [];
  const seenIds = new Set();

  for (const area of (customAreas || AREAS)) {
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
        const marktPriceType = /warmmiete/i.test(allText) ? 'Warmmiete' : /kaltmiete/i.test(allText) ? 'Kaltmiete' : '';

        const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.)/i) || title.match(/([\d,]+)-Zimmer/i);
        const sizeMatch = allText.match(/([\d.,]+)\s*m²/i);

        const features = detectFeatures(allText + " " + title);

        if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;

        // Validate area: card text or title must mention our areas
        if (!_validator(allText) && !_validator(title)) return;
        // Reject listings mentioning other cities in title
        if (_foreignCheck(title)) return;

        // Try to extract real address from card text
        const addressMatch = allText.match(/\b(\d{5})\s+([A-ZÄÖÜa-zäöüß][\w\s-]+)/);
        const realAddress = addressMatch ? `${addressMatch[1]} ${addressMatch[2].trim()}` : `${area.zip} ${area.name}`;
        const detectedArea = _detectArea(allText + ' ' + title) || area.name;

        // Extract published date (format: DD.MM.YYYY)
        const dateMatch = allText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        let publishedAt = "";
        if (dateMatch) {
          publishedAt = `${dateMatch[3]}-${dateMatch[2].padStart(2,"0")}-${dateMatch[1].padStart(2,"0")}`;
        }

        // Extract listing image (skip user profile/avatar images)
        let marktImageUrl = '';
        $card.find('img').each((_, img) => {
          const $img = $(img);
          const src = $img.attr('src') || $img.attr('data-src') || '';
          if (!src.startsWith('http')) return;
          // Collect all class names up the DOM tree
          const allCls = [$img.attr('class') || ''];
          $img.parents('[class]').each((_, p) => { allCls.push($(p).attr('class') || ''); });
          const cls = allCls.join(' ').toLowerCase();
          // Skip if element or ancestor has avatar/profile/user/seller/contact/icon hint
          if (/avatar|profile|user-img|seller|member|contact|user-photo|icon/i.test(cls)) return;
          // Skip if image URL path looks like a profile picture
          if (/\/user\/|\/avatar\/|\/seller\/|\/profile\/|\/member\/|user_/i.test(src)) return;
          marktImageUrl = src;
          return false; // break .each()
        });

        results.push({
          externalId: `marktde-${id}`,
          title,
          address: realAddress,
          price,
          rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
          size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
          source: "markt.de",
          url: fullUrl,
          area: detectedArea,
          publishedAt,
          imageUrl: marktImageUrl.startsWith("http") ? marktImageUrl : "",
          imageUrls: marktImageUrl.startsWith("http") ? JSON.stringify([marktImageUrl]) : "[]",
          priceType: marktPriceType,
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

// ==================== immowelt.de ====================
async function scrapeImmowelt(customAreas) {
  console.log("  📡 immowelt.de...");
  const results = [];
  const seenIds = new Set();

  for (const area of (customAreas || AREAS)) {
    const iwSlug = area.iw || area.markt;
    const url = `https://www.immowelt.de/liste/${iwSlug}/wohnungen/mieten`;
    const html = await fetchPage(url);
    if (!html) continue;

    const $ = cheerio.load(html);

    // Each listing card has data-testid="serp-core-classified-card-testid"
    $('[data-testid="serp-core-classified-card-testid"]').each((_, el) => {
      try {
        const $card = $(el);

        // Get expose link and ID
        const $link = $card.find('a[href*="/expose/"]').first();
        const link = $link.attr("href") || "";
        const idMatch = link.match(/\/expose\/([a-z0-9-]+)/i);
        if (!idMatch) return;
        const id = idMatch[1];
        if (seenIds.has(id)) return;
        seenIds.add(id);

        const fullUrl = link.startsWith("http")
          ? link.split("?")[0].split("#")[0]
          : `https://www.immowelt.de${link.split("?")[0].split("#")[0]}`;

        // Price from dedicated element: "945 €Kaltmiete" or "1.900 €Warmmiete"
        const priceText = $card.find('[data-testid="cardmfe-price-testid"]').text().trim();
        const priceMatch = priceText.match(/([\d.,]+)\s*€/);
        const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
        const iwPriceType = /warmmiete/i.test(priceText) ? 'Warmmiete' : /kaltmiete/i.test(priceText) ? 'Kaltmiete' : '';

        // Key facts: "3 Zimmer·72,3 m²·EG" or "4 Zimmer·142,2 m²·frei ab 01.08.2026"
        const factsText = $card.find('[data-testid="cardmfe-keyfacts-testid"]').text().trim();
        const roomsMatch = factsText.match(/([\d,]+)\s*Zimmer/i);
        const sizeMatch = factsText.match(/([\d.,]+)\s*m²/i);

        // Address from dedicated element
        const address = $card.find('[data-testid="cardmfe-description-box-address"]').text().trim() || area.name;

        // Title from description box: "1.900 €KaltmieteWohnung zur Miete3 Zimmer..."
        const descBox = $card.find('[data-testid="cardmfe-description-box-text-test-id"]').text().trim();
        const titleMatch = descBox.match(/(?:€\s*(?:Kalt|Warm)?miete\s*)((?:Wohnung|Studio|Maisonette|Penthouse|Terrassenwohnung|Etagenwohnung|Erdgeschosswohnung|Dachgeschosswohnung|Apartment|Souterrainwohnung)(?:\s+zur\s+Miete)?(?:\s*-\s*[^\d€]+)?)/i);
        const title = titleMatch ? titleMatch[1].trim() : "Wohnung zur Miete";

        // Skip WG
        if (/\bwg\b|wg-zimmer|wohngemeinschaft/i.test(descBox)) return;

        // Validate area
        if (!_validator(address) && !_validator(descBox)) return;
        if (_foreignCheck(title)) return;

        const detectedArea = _detectArea(address + " " + descBox) || area.name;
        const features = detectFeatures(descBox);

        // Extract all images
        const images = [];
        $card.find("img").each((_, img) => {
          const src = $(img).attr("src") || $(img).attr("data-src") || "";
          if (src.startsWith("http") && src.includes("immowelt") && !images.includes(src)) images.push(src);
        });

        results.push({
          externalId: `immowelt-${id}`,
          title,
          address,
          price,
          rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
          size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
          source: "Immowelt",
          url: fullUrl,
          area: detectedArea,
          imageUrl: images[0] || "",
          imageUrls: JSON.stringify(images),
          priceType: iwPriceType,
          ...features,
        });
      } catch (e) {
        /* skip */
      }
    });
  }

  console.log(`    ✅ Immowelt: ${results.length} listings`);
  return results;
}

// ==================== Immonet.de ====================
async function scrapeImmonetDe(customAreas) {
  console.log("  📡 Immonet.de...");
  const results = [];
  const seenIds = new Set();

  for (const area of (customAreas || AREAS)) {
    const slug = (area.iw || area.markt || '').toLowerCase();
    // Try multiple URL formats — immonet has changed structure over the years
    const urlsToTry = [
      `https://www.immonet.de/wohnungssuche/sus-miete-haus-wohnung-stadtort-${slug}.html`,
      `https://www.immonet.de/miete/wohnungen-in-${slug}.html`,
      `https://www.immonet.de/wohnungssuche/sus-miete-wohnung-stadtort-${slug}.html`,
    ];

    let html = null;
    let usedUrl = '';
    for (const url of urlsToTry) {
      const h = await fetchPage(url);
      if (h && h.length > 3000) { html = h; usedUrl = url; break; }
    }
    if (!html) continue;
    console.log(`    ⤷ Immonet URL OK: ${usedUrl}`);

    const $ = cheerio.load(html);

    // Immonet listing items: div#list-entry-{id}, or .listitem-wrap, or article.listitem
    const selectors = [
      '[id^="list-entry-"]',
      '.listitem-wrap',
      'article.listitem',
      '[class*="expose-list-item"]',
      '.ImmoscoutListItem',
    ];

    let found = false;
    for (const sel of selectors) {
      const $items = $(sel);
      if ($items.length > 0) {
        $items.each((_, el) => {
          try {
            const $el = $(el);

            // Extract ID from element ID attribute or link
            let idNum = '';
            const elId = $(el).attr('id') || '';
            const idFromEl = elId.replace(/\D+/g, '');
            if (idFromEl) {
              idNum = idFromEl;
            } else {
              const $linkEl = $el.find('a[href*="/expose/"]').first();
              const href = $linkEl.attr('href') || '';
              const m = href.match(/\/expose\/(\d+)/);
              if (m) idNum = m[1];
            }
            if (!idNum || seenIds.has(idNum)) return;
            seenIds.add(idNum);

            // Title
            const title = $el.find('h2,h3,[class*="title"],[class*="headline"]').first().text().trim();
            if (!title) return;

            // URL
            const $linkEl = $el.find('a[href*="/expose/"]').first();
            const link = $linkEl.attr('href') || '';
            const fullUrl = link.startsWith('http') ? link : `https://www.immonet.de${link}`;

            // Price
            const priceEl = $el.find('[class*="price"],[class*="Price"],[class*="miete"]').first();
            const priceText = priceEl.text().trim();
            const price = parsePrice(priceText);
            const priceType = /warm/i.test(priceText) ? 'Warmmiete' : /kalt/i.test(priceText) ? 'Kaltmiete' : '';

            const allText = $el.text();
            const roomsMatch = allText.match(/([\d,]+)\s*(?:Zimmer|Zi\.)/i);
            const sizeMatch = allText.match(/([\d.,]+)\s*m²/i);

            // Address
            const addrEl = $el.find('[class*="address"],[class*="location"],[class*="city"],[class*="ort"]').first();
            const address = addrEl.text().trim() || area.name;

            if (/\bwg\b|wohngemeinschaft/i.test(allText)) return;
            if (!_validator(allText) && !_validator(address)) return;
            if (_foreignCheck(title)) return;

            const detectedArea = _detectArea(address + ' ' + allText) || area.name;
            const features = detectFeatures(allText);

            // Image
            const imgEl = $el.find('img').first();
            const imgSrc = imgEl.attr('src') || imgEl.attr('data-src') || '';

            results.push({
              externalId: `immonet-${idNum}`,
              title,
              address,
              price,
              rooms: roomsMatch ? parseNumber(roomsMatch[1]) : null,
              size: sizeMatch ? parseNumber(sizeMatch[1]) : null,
              source: 'Immonet',
              url: fullUrl,
              area: detectedArea,
              imageUrl: imgSrc.startsWith('http') ? imgSrc : '',
              imageUrls: imgSrc.startsWith('http') ? JSON.stringify([imgSrc]) : '[]',
              priceType,
              ...features,
            });
            found = true;
          } catch (e) { /* skip */ }
        });
        if (found) break; // Found items with this selector, no need to try others
      }
    }
  }

  console.log(`    ✅ Immonet: ${results.length} listings`);
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
    scrapeImmowelt,
    scrapeImmonetDe,
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
    if (!_validator(a.address)) return false;
    if (_foreignCheck(a.title)) return false;
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

// ==================== Dynamic City Search ====================
async function scrapeCity(cityName) {
  console.log(`\n🔍 Searching apartments in ${cityName}...`);
  const startTime = Date.now();
  const cityConfig = [buildCityConfig(cityName)];

  // Discover KA location ID for precise geographic search
  const kaSlug = cityConfig[0].markt;
  const kaLocationId = await discoverKaLocationId(kaSlug);
  if (kaLocationId) {
    // kaLocationId may be a plain ID ('9409') or ID+radius ('3322r15')
    cityConfig[0].ka = `${kaSlug}/c203l${kaLocationId}`;
    cityConfig[0].kaPages = 3;
    cityConfig[0].hasLocationId = true;
    console.log(`  📍 KA location ID for ${cityName}: l${kaLocationId}`);
  } else {
    console.log(`  ⚠ No KA location ID for ${cityName} — will use keyword fallback if needed`);
    cityConfig[0].kaKeyword = true; // enable keyword fallback in scrapeKleinanzeigen
  }

  // Switch to dynamic search context
  setSearchContext(cityName);

  const allResults = [];
  const sourceStats = [];

  const scrapers = [
    { fn: scrapeKleinanzeigen, name: 'Kleinanzeigen' },
    { fn: scrapeWohnungsboerse, name: 'Wohnungsbörse' },
    { fn: scrapeMarktDe, name: 'markt.de' },
    { fn: scrapeImmowelt, name: 'Immowelt' },
    { fn: scrapeImmonetDe, name: 'Immonet' },
  ];

  for (const { fn, name } of scrapers) {
    try {
      const results = await fn(cityConfig);
      allResults.push(...results);
      sourceStats.push({ source: name, count: results.length });
    } catch (err) {
      console.error(`  ❌ ${name} error: ${err.message}`);
      sourceStats.push({ source: name, count: 0, error: err.message });
    }
  }

  // Reset context back to default (Buxtehude)
  resetSearchContext();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ City search complete in ${elapsed}s: ${allResults.length} listings`);

  return { apartments: allResults, stats: sourceStats };
}

module.exports = { scrapeAll, scrapeCity, fetchKleinanzeigenDate };
