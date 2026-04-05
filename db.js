const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "apartments.db");
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS apartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      externalId TEXT UNIQUE,
      title TEXT NOT NULL,
      address TEXT DEFAULT '',
      price REAL DEFAULT 0,
      rooms REAL,
      size REAL,
      source TEXT NOT NULL,
      category TEXT DEFAULT 'medium',
      url TEXT DEFAULT '',
      isNew INTEGER DEFAULT 1,
      isFavorite INTEGER DEFAULT 0,
      contacted INTEGER DEFAULT 0,
      noCommission INTEGER DEFAULT 0,
      furnished INTEGER DEFAULT 0,
      hasBalcony INTEGER DEFAULT 0,
      hasGarden INTEGER DEFAULT 0,
      hasParking INTEGER DEFAULT 0,
      area TEXT DEFAULT 'Buxtehude',
      addedAt TEXT DEFAULT (datetime('now')),
      notes TEXT DEFAULT ''
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fetch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetchedAt TEXT DEFAULT (datetime('now')),
      totalFound INTEGER DEFAULT 0,
      newCount INTEGER DEFAULT 0,
      sources TEXT DEFAULT '[]'
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);
  
  // Add area column if it doesn't exist (migration)
  try {
    db.run("ALTER TABLE apartments ADD COLUMN area TEXT DEFAULT 'Buxtehude'");
  } catch (e) {
    // Column already exists
  }
  
  // Initialize default settings if not set
  const existing = db.exec("SELECT value FROM settings WHERE key = 'telegramAreas'");
  if (!existing.length || !existing[0].values.length) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ['telegramAreas', JSON.stringify(["Buxtehude"])]);
  }

  // Add publishedAt column if it doesn't exist
  try {
    db.run("ALTER TABLE apartments ADD COLUMN publishedAt TEXT DEFAULT ''");
  } catch (e) {}

  // Soft delete columns
  try { db.run("ALTER TABLE apartments ADD COLUMN isDeleted INTEGER DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE apartments ADD COLUMN deletedBy TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE apartments ADD COLUMN deletedAt TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE apartments ADD COLUMN missedCount INTEGER DEFAULT 0"); } catch (e) {}

  // Image column
  try { db.run("ALTER TABLE apartments ADD COLUMN imageUrl TEXT DEFAULT ''"); } catch (e) {}
  
  // Multiple images column (JSON array)
  try { db.run("ALTER TABLE apartments ADD COLUMN imageUrls TEXT DEFAULT '[]'"); } catch (e) {}
  
  // Fix source name: immowelt -> Immowelt
  try { db.run("UPDATE apartments SET source = 'Immowelt' WHERE source = 'immowelt'"); } catch (e) {}
  
  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function categorize(price) {
  if (!price || price <= 700) return "budget";
  if (price <= 1050) return "medium";
  return "premium";
}

function rowToApartment(row, cols) {
  const obj = {};
  cols.forEach((c, i) => (obj[c] = row[i]));
  obj.isNew = !!obj.isNew;
  obj.isFavorite = !!obj.isFavorite;
  obj.contacted = !!obj.contacted;
  obj.noCommission = !!obj.noCommission;
  obj.furnished = !!obj.furnished;
  obj.hasBalcony = !!obj.hasBalcony;
  obj.hasGarden = !!obj.hasGarden;
  obj.hasParking = !!obj.hasParking;
  obj.isDeleted = !!obj.isDeleted;
  return obj;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  const cols = stmt.getColumnNames();
  while (stmt.step()) {
    rows.push(rowToApartment(stmt.get(), cols));
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let result = null;
  const cols = stmt.getColumnNames();
  if (stmt.step()) {
    result = rowToApartment(stmt.get(), cols);
  }
  stmt.free();
  return result;
}

function getAllApartments(area) {
  if (area && area !== 'all') {
    return queryAll("SELECT * FROM apartments WHERE isDeleted = 0 AND area = ? ORDER BY addedAt DESC", [area]);
  }
  return queryAll("SELECT * FROM apartments WHERE isDeleted = 0 ORDER BY addedAt DESC");
}

function getApartment(id) {
  return queryOne("SELECT * FROM apartments WHERE id = ?", [id]);
}

function upsertApartment(apt) {
  const existing = queryOne(
    "SELECT id, isDeleted, deletedBy FROM apartments WHERE externalId = ?",
    [apt.externalId]
  );

  if (existing) {
    // Reset missedCount since we found it again
    db.run("UPDATE apartments SET missedCount = 0 WHERE id = ?", [existing.id]);
    // If it was platform-deleted and now found again, restore it
    if (existing.isDeleted && existing.deletedBy === 'platform') {
      db.run("UPDATE apartments SET isDeleted = 0, deletedBy = '', deletedAt = '', isNew = 1 WHERE id = ?", [existing.id]);
      saveDb();
      return { inserted: true, id: existing.id, restored: true };
    }
    // Always update images if we have them
    if (apt.imageUrl) {
      db.run("UPDATE apartments SET imageUrl = ? WHERE id = ?", [apt.imageUrl, existing.id]);
    }
    if (apt.imageUrls && apt.imageUrls !== '[]') {
      db.run("UPDATE apartments SET imageUrls = ? WHERE id = ?", [apt.imageUrls, existing.id]);
    }
    return { inserted: false, id: existing.id };
  }

  const category = categorize(apt.price);
  db.run(
    `INSERT INTO apartments (externalId, title, address, price, rooms, size, source, category, url, noCommission, furnished, hasBalcony, hasGarden, hasParking, area, publishedAt, imageUrl, imageUrls)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      apt.externalId,
      apt.title || "بدون عنوان",
      apt.address || "",
      apt.price || 0,
      apt.rooms || null,
      apt.size || null,
      apt.source,
      category,
      apt.url || "",
      apt.noCommission ? 1 : 0,
      apt.furnished ? 1 : 0,
      apt.hasBalcony ? 1 : 0,
      apt.hasGarden ? 1 : 0,
      apt.hasParking ? 1 : 0,
      apt.area || "Buxtehude",
      apt.publishedAt || "",
      apt.imageUrl || "",
      apt.imageUrls || "[]",
    ]
  );

  const lastId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
  saveDb();
  return { inserted: true, id: lastId };
}

function toggleFavorite(id) {
  db.run(
    "UPDATE apartments SET isFavorite = CASE WHEN isFavorite = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [id]
  );
  saveDb();
  return getApartment(id);
}

function toggleContacted(id) {
  db.run(
    "UPDATE apartments SET contacted = CASE WHEN contacted = 1 THEN 0 ELSE 1 END WHERE id = ?",
    [id]
  );
  saveDb();
  return getApartment(id);
}

function deleteApartment(id) {
  db.run("UPDATE apartments SET isDeleted = 1, deletedBy = 'user', deletedAt = datetime('now') WHERE id = ?", [id]);
  saveDb();
}

function getDeletedApartments() {
  return queryAll("SELECT * FROM apartments WHERE isDeleted = 1 ORDER BY deletedAt DESC");
}

function restoreApartment(id) {
  db.run("UPDATE apartments SET isDeleted = 0, deletedBy = '', deletedAt = '' WHERE id = ?", [id]);
  saveDb();
  return getApartment(id);
}

function permanentlyDeleteApartment(id) {
  db.run("DELETE FROM apartments WHERE id = ?", [id]);
  saveDb();
}

function incrementMissedCount(source, foundExternalIds) {
  // For apartments from this source that were NOT found, increment missedCount
  const placeholders = foundExternalIds.map(() => '?').join(',');
  if (foundExternalIds.length > 0) {
    db.run(
      `UPDATE apartments SET missedCount = missedCount + 1 WHERE source = ? AND isDeleted = 0 AND externalId NOT IN (${placeholders})`,
      [source, ...foundExternalIds]
    );
  } else {
    db.run("UPDATE apartments SET missedCount = missedCount + 1 WHERE source = ? AND isDeleted = 0", [source]);
  }
  // Mark as platform-deleted if missed 6+ times (1 hour of 10-min checks)
  db.run(
    "UPDATE apartments SET isDeleted = 1, deletedBy = 'platform', deletedAt = datetime('now') WHERE missedCount >= 6 AND isDeleted = 0 AND deletedBy = ''"
  );
  saveDb();
}

function markAllNotNew() {
  db.run("UPDATE apartments SET isNew = 0 WHERE isNew = 1");
  saveDb();
}

function updatePublishedAt(id, publishedAt) {
  db.run("UPDATE apartments SET publishedAt = ? WHERE id = ?", [publishedAt, id]);
  saveDb();
}

function getKaListingsMissingDate() {
  return queryAll("SELECT id, url FROM apartments WHERE source = 'Kleinanzeigen' AND (publishedAt IS NULL OR publishedAt = '') AND url != ''");
}

function addFetchHistory(totalFound, newCount, sources) {
  db.run(
    "INSERT INTO fetch_history (totalFound, newCount, sources) VALUES (?, ?, ?)",
    [totalFound, newCount, JSON.stringify(sources)]
  );
  saveDb();
}

function getFetchHistory() {
  const result = db.exec(
    "SELECT fetchedAt, totalFound, newCount FROM fetch_history ORDER BY id DESC LIMIT 1"
  );
  if (!result.length || !result[0].values.length) return { last: null };
  const [fetchedAt, totalFound, newCount] = result[0].values[0];
  return { last: { fetchedAt, totalFound, newCount } };
}

function getSetting(key) {
  const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
  if (!result.length || !result[0].values.length) return null;
  return result[0].values[0][0];
}

function setSetting(key, value) {
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  saveDb();
}

module.exports = {
  getDb,
  getAllApartments,
  getApartment,
  upsertApartment,
  toggleFavorite,
  toggleContacted,
  deleteApartment,
  getDeletedApartments,
  restoreApartment,
  permanentlyDeleteApartment,
  incrementMissedCount,
  markAllNotNew,
  updatePublishedAt,
  getKaListingsMissingDate,
  addFetchHistory,
  getFetchHistory,
  getSetting,
  setSetting,
  categorize,
};
