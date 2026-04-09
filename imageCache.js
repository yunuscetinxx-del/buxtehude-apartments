/**
 * imageCache.js — Download and cache listing images to local disk.
 *
 * Flow:
 *  1. After each scrape: processListingsImages() fetches detail-page images
 *     for listings whose imageUrl is still empty.
 *  2. cacheExistingImages() converts external http:// imageUrl values into
 *     locally stored /images/<hash>.jpg paths so they survive URL expiry.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const IMAGES_DIR = path.join(__dirname, 'images');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DETAIL_DELAY_MS = 1800; // polite delay between detail-page requests

function ensureDir() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/** Convert an external URL to a stable local filename. */
function urlToFilename(url) {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  const extMatch = url.replace(/[?#].*$/, '').match(/\.(jpe?g|png|webp|gif)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  return `${hash}.${ext}`;
}

/**
 * Download an image URL to the local cache.
 * Returns the local path  (/images/<file>)  or null on failure.
 */
async function cacheImage(url) {
  if (!url || !url.startsWith('http')) return null;
  ensureDir();

  const filename = urlToFilename(url);
  const filepath = path.join(IMAGES_DIR, filename);

  // Already on disk and non-trivial size → return immediately
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 500) {
    return `/images/${filename}`;
  }

  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Referer': new URL(url).origin + '/' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(tm);

    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('image/')) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null; // likely placeholder / error image

    fs.writeFileSync(filepath, buf);
    return `/images/${filename}`;
  } catch (_e) {
    return null;
  }
}

/**
 * Scrape a listing detail page and return an array of image URLs.
 * Source-specific logic to maximise image discovery.
 */
async function fetchDetailImages(aptUrl, source) {
  if (!aptUrl || !aptUrl.startsWith('http')) return [];
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(aptUrl, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(tm);
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const imgs = [];

    if (source === 'Kleinanzeigen') {
      // 1) JSON-LD structured data
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const d = JSON.parse($(el).text());
          const arr = Array.isArray(d.image) ? d.image : (d.image ? [d.image] : []);
          arr.forEach(i => {
            const u = typeof i === 'string' ? i : i?.url;
            if (u && u.startsWith('http') && !imgs.includes(u)) imgs.push(u);
          });
        } catch (_e) {}
      });
      // 2) Gallery data-imgsrc attribute
      if (imgs.length === 0) {
        $('img[id*="imagebox"], img[data-imgsrc], #viewad-thumbnails img, .galleryimage-area img').each((_, el) => {
          const raw = $(el).attr('data-imgsrc') || $(el).attr('src') || '';
          if (!raw.startsWith('http')) return;
          // Upgrade to large variant
          const big = raw.replace(/rule=[^&"'\s]+/, 'rule=adimage-1280x960-jpg');
          if (!imgs.includes(big)) imgs.push(big);
        });
      }
      // 3) og:image meta fallback
      if (imgs.length === 0) {
        const og = $('meta[property="og:image"]').attr('content') || '';
        if (og.startsWith('http')) imgs.push(og);
      }

    } else if (source === 'Immowelt') {
      // Next.js JSON payload
      const nm = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nm) {
        const findUris = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) { obj.forEach(findUris); return; }
          if (typeof obj.uri === 'string' && obj.uri.startsWith('http') && !imgs.includes(obj.uri)) imgs.push(obj.uri);
          Object.values(obj).forEach(findUris);
        };
        try { findUris(JSON.parse(nm[1])); } catch (_e) {}
      }
      if (imgs.length === 0) {
        $('img[src*="immowelt"], img[data-src*="immowelt"]').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          if (src.startsWith('http') && !imgs.includes(src)) imgs.push(src);
        });
      }

    } else if (source === 'markt.de') {
      $('img[src*="img.markt.de"], .immo-galerie img, .gallerie img, [class*="gallery"] img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src.startsWith('http') && !imgs.includes(src)) imgs.push(src);
      });
      if (imgs.length === 0) {
        const og = $('meta[property="og:image"]').attr('content') || '';
        if (og.startsWith('http')) imgs.push(og);
      }

    } else if (source === 'Wohnungsbörse') {
      $('img.immo-detail, .gallery-img, .immogalerie img, [class*="gallery"] img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src.startsWith('http') && !imgs.includes(src)) imgs.push(src);
      });

    } else if (source === 'Immonet') {
      $('img[src*="immonet"], .gallery img, .slider-image img, [class*="gallery"] img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src.startsWith('http') && !imgs.includes(src)) imgs.push(src);
      });

    } else {
      // Generic: og:image
      const og = $('meta[property="og:image"]').attr('content') || '';
      if (og.startsWith('http')) imgs.push(og);
    }

    return imgs.slice(0, 12);
  } catch (_e) {
    return [];
  }
}

let _isProcessing = false;

/**
 * Batch-process listings that have no imageUrl yet.
 * Fetches detail pages and caches the first image locally.
 * Respects a polite delay between requests.
 */
async function processListingsImages(dbModule) {
  if (_isProcessing) return;
  _isProcessing = true;
  ensureDir();
  try {
    const listings = dbModule.getListingsNeedingImages(40);
    if (listings.length === 0) { _isProcessing = false; return; }

    console.log(`\n🖼  Fetching images for ${listings.length} listings without images...`);
    let done = 0;

    for (const apt of listings) {
      try {
        const imgs = await fetchDetailImages(apt.url, apt.source);
        if (imgs.length === 0) {
          dbModule.markImageAttempted(apt.id);
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        const localUrl = await cacheImage(imgs[0]);
        // Cache additional images in background (fire-and-forget)
        imgs.slice(1, 5).forEach(u => cacheImage(u).catch(() => {}));

        const allImgs = imgs.filter(u => u && u.startsWith('http'));
        // Keep external URLs in imageUrls; use local path for primary imageUrl
        dbModule.updateImageUrls(apt.id, localUrl || imgs[0], JSON.stringify(allImgs));
        done++;
        console.log(`  🖼  ${apt.externalId}: ${imgs.length} image(s)`);
        await new Promise(r => setTimeout(r, DETAIL_DELAY_MS));
      } catch (e) {
        console.log(`  ⚠  Image error for ${apt.externalId}: ${e.message}`);
      }
    }
    console.log(`🖼  Image processing done: ${done}/${listings.length} updated\n`);
  } finally {
    _isProcessing = false;
  }
}

/**
 * For listings that already have external imageUrl (http://...):
 * download and replace with local /images/... path for persistence.
 */
async function cacheExistingImages(dbModule) {
  ensureDir();
  const listings = dbModule.getListingsWithExternalImages(80);
  if (!listings.length) return;

  console.log(`\n🖼  Caching ${listings.length} existing images locally...`);
  let done = 0;

  for (const apt of listings) {
    try {
      // Parse imageUrls array
      let imgArr = [];
      try { imgArr = JSON.parse(apt.imageUrls || '[]'); } catch (_e) {}
      if (!imgArr.length && apt.imageUrl) imgArr = [apt.imageUrl];
      if (!imgArr.length) continue;

      const firstExternal = imgArr.find(u => u && u.startsWith('http'));
      if (!firstExternal) continue;

      const local = await cacheImage(firstExternal);
      if (local) {
        // Replace position 0 in array with local path; keep rest as external fallback
        imgArr[imgArr.indexOf(firstExternal)] = local;
        dbModule.updateImageUrls(apt.id, local, JSON.stringify(imgArr));
        done++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (_e) {}
  }
  console.log(`🖼  Local cache done: ${done}/${listings.length} images stored\n`);
}

module.exports = { cacheImage, fetchDetailImages, processListingsImages, cacheExistingImages, IMAGES_DIR };
