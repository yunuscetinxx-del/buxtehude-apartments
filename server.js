const express = require("express");
const path = require("path");
const cron = require("node-cron");
const db = require("./db");
const { scrapeAll } = require("./scraper");
const telegram = require("./telegram");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files (the React frontend)
app.use(express.static(__dirname, { index: "index.html" }));

// Health check endpoint (used by keep-alive ping)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ==================== API Routes ====================

// Get all apartments
app.get("/api/apartments", (_req, res) => {
  try {
    const apartments = db.getAllApartments();
    res.json(apartments);
  } catch (err) {
    console.error("Error fetching apartments:", err);
    res.status(500).json({ error: "Failed to fetch apartments" });
  }
});

// Get fetch history
app.get("/api/fetch-history", (_req, res) => {
  try {
    const history = db.getFetchHistory();
    res.json(history);
  } catch (err) {
    console.error("Error fetching history:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Toggle favorite
app.patch("/api/apartments/:id/favorite", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const apt = db.toggleFavorite(id);
    if (!apt) return res.status(404).json({ error: "Apartment not found" });
    res.json(apt);
  } catch (err) {
    console.error("Error toggling favorite:", err);
    res.status(500).json({ error: "Failed to toggle favorite" });
  }
});

// Toggle contacted
app.patch("/api/apartments/:id/contacted", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const apt = db.toggleContacted(id);
    if (!apt) return res.status(404).json({ error: "Apartment not found" });
    res.json(apt);
  } catch (err) {
    console.error("Error toggling contacted:", err);
    res.status(500).json({ error: "Failed to toggle contacted" });
  }
});

// Delete apartment
app.delete("/api/apartments/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    db.deleteApartment(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting apartment:", err);
    res.status(500).json({ error: "Failed to delete apartment" });
  }
});

// Manual fetch trigger
let isFetching = false;

app.post("/api/fetch-now", async (_req, res) => {
  if (isFetching) {
    return res.status(429).json({ error: "Fetch already in progress" });
  }

  try {
    isFetching = true;
    const result = await runFetch();
    res.json(result);
  } catch (err) {
    console.error("Error during manual fetch:", err);
    res.status(500).json({ error: "Fetch failed" });
  } finally {
    isFetching = false;
  }
});

// Mark all apartments as seen (not new)
app.post("/api/mark-all-seen", (_req, res) => {
  try {
    db.markAllNotNew();
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking all seen:", err);
    res.status(500).json({ error: "Failed to mark all as seen" });
  }
});

// SPA fallback - serve index.html for non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==================== Fetch Logic ====================

async function runFetch() {
  console.log("\n🏠 Running apartment fetch...");
  const { apartments, stats } = await scrapeAll();

  let newCount = 0;
  const newApartments = [];
  for (const apt of apartments) {
    try {
      const result = db.upsertApartment(apt);
      if (result.inserted) {
        newCount++;
        newApartments.push(apt);
      }
    } catch (err) {
      console.error(`  Failed to save ${apt.externalId}: ${err.message}`);
    }
  }

  const totalFound = apartments.length;
  db.addFetchHistory(totalFound, newCount, stats);

  // Send Telegram notifications for new apartments
  if (newApartments.length > 0) {
    console.log(`📱 Sending Telegram notifications for ${newApartments.length} new apartments...`);
    await telegram.notifyNewApartments(newApartments);
  }

  console.log(
    `📊 Fetch result: ${totalFound} found, ${newCount} new apartments added\n`
  );

  return { newCount, totalFound };
}

// ==================== Cron Job ====================

// Run every hour
cron.schedule("0 * * * *", () => {
  console.log("⏰ Hourly cron job triggered");
  runFetch().catch((err) => console.error("Cron fetch error:", err));
});

// ==================== Start Server ====================

async function start() {
  // Initialize database first
  await db.getDb();
  console.log("✅ Database initialized");

  // Setup Telegram bot commands
  telegram.setCommandHandler(async (text) => {
    try {
      // جديد / search
      if (text === "جديد" || text === "/جديد" || text === "بحث" || text === "/start" || text === "/search" || text === "/new") {
        await telegram.sendMessage("🔄 <b>جاري البحث عن شقق جديدة...</b>");
        const result = await runFetch();
        if (result.newCount > 0) {
          // Notifications already sent by runFetch
        } else {
          await telegram.sendMessage(
            `✅ <b>لا توجد شقق جديدة</b>\n\nتم فحص ${result.totalFound} شقة من جميع المواقع.`
          );
        }
      // الكل / all
      } else if (text === "الكل" || text === "/الكل" || text === "/all") {
        const apts = db.getAllApartments();
        await telegram.sendMessage(`📋 <b>جميع الشقق (${apts.length})</b>`);
        for (let i = 0; i < apts.length; i++) {
          await telegram.sendMessage(telegram.formatApartment(apts[i]));
          await new Promise((r) => setTimeout(r, 500));
        }
      // رخيصة / cheap
      } else if (text === "رخيصة" || text === "/رخيصة" || text === "/cheap") {
        const apts = db.getAllApartments().filter((a) => a.price > 0 && a.price <= 800);
        if (apts.length === 0) {
          await telegram.sendMessage("❌ لا توجد شقق أقل من 800€");
          return;
        }
        await telegram.sendMessage(`💰 <b>شقق رخيصة أقل من 800€ (${apts.length})</b>`);
        for (let i = 0; i < apts.length; i++) {
          await telegram.sendMessage(telegram.formatApartment(apts[i]));
          await new Promise((r) => setTimeout(r, 500));
        }
      // مفضلة / favorites
      } else if (text === "مفضلة" || text === "/مفضلة" || text === "/favorites" || text === "/fav") {
        const apts = db.getAllApartments().filter((a) => a.isFavorite);
        if (apts.length === 0) {
          await telegram.sendMessage("⭐ لا توجد شقق مفضلة بعد.\nأضف مفضلات من الواجهة: http://localhost:3000");
          return;
        }
        await telegram.sendMessage(`⭐ <b>المفضلة (${apts.length})</b>`);
        for (let i = 0; i < apts.length; i++) {
          await telegram.sendMessage(telegram.formatApartment(apts[i]));
          await new Promise((r) => setTimeout(r, 500));
        }
      // احصائيات / stats
      } else if (text === "احصائيات" || text === "/احصائيات" || text === "/stats" || text === "/status") {
        const apts = db.getAllApartments();
        const sources = {};
        apts.forEach((a) => (sources[a.source] = (sources[a.source] || 0) + 1));
        const prices = apts.filter((a) => a.price > 0).map((a) => a.price);
        const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
        const min = prices.length ? Math.min(...prices) : 0;
        const max = prices.length ? Math.max(...prices) : 0;
        const newCount = apts.filter((a) => a.isNew).length;

        let msg = `📊 <b>إحصائيات</b>\n\n`;
        msg += `🏠 المجموع: ${apts.length} شقة\n`;
        msg += `🆕 جديدة: ${newCount}\n`;
        msg += `💰 الأسعار: ${min}€ - ${max}€\n`;
        msg += `📈 المتوسط: ${avg}€\n\n`;
        msg += `<b>المصادر:</b>\n`;
        Object.entries(sources).forEach(([s, c]) => (msg += `  • ${s}: ${c}\n`));
        const history = db.getFetchHistory();
        if (history.last) msg += `\n⏰ آخر فحص: ${history.last.fetchedAt}`;
        await telegram.sendMessage(msg);
      // آخر / latest
      } else if (text === "آخر" || text === "/آخر" || text === "/latest") {
        const apts = db.getAllApartments().slice(0, 5);
        if (apts.length === 0) {
          await telegram.sendMessage("❌ لا توجد شقق محفوظة");
          return;
        }
        await telegram.sendMessage(`🕐 <b>آخر 5 شقق مضافة:</b>`);
        for (let i = 0; i < apts.length; i++) {
          await telegram.sendMessage(telegram.formatApartment(apts[i]));
          await new Promise((r) => setTimeout(r, 500));
        }
      // مساعدة / help
      } else if (text === "مساعدة" || text === "/مساعدة" || text === "/help" || text === "help") {
        await telegram.sendMessage(
          `🤖 <b>أوامر البوت:</b>\n\n` +
          `🔍 /start - بحث عن شقق جديدة\n` +
          `📋 /all - عرض جميع الشقق\n` +
          `💰 /cheap - شقق أقل من 800€\n` +
          `⭐ /fav - الشقق المفضلة\n` +
          `📊 /status - إحصائيات\n` +
          `🕐 /latest - آخر 5 شقق\n` +
          `❓ /help - هذه القائمة\n\n` +
          `<b>أو اكتب بالعربي:</b>\n` +
          `جديد | الكل | رخيصة | مفضلة | احصائيات | آخر\n\n` +
          `🔄 البحث التلقائي كل ساعة مفعّل`
        );
      }
    } catch (err) {
      console.error("Command error:", err.message);
      await telegram.sendMessage("❌ حدث خطأ، حاول مجدداً");
    }
  });

  telegram.startPolling();

  app.listen(PORT, async () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log("📅 Hourly scraping is active (every hour at :00)");
    console.log("🌐 Frontend served at root /\n");

    // Send startup message to Telegram with commands menu
    await telegram.sendMessage(
      `🟢 <b>السيرفر يعمل!</b>\n\n` +
      `🤖 <b>الأوامر المتاحة:</b>\n\n` +
      `▫️ <b>جديد</b> - بحث عن شقق جديدة الآن\n` +
      `▫️ <b>الكل</b> - عرض جميع الشقق\n` +
      `▫️ <b>رخيصة</b> - شقق أقل من 800€\n` +
      `▫️ <b>مفضلة</b> - الشقق المفضلة\n` +
      `▫️ <b>احصائيات</b> - إحصائيات سريعة\n` +
      `▫️ <b>مساعدة</b> - عرض الأوامر\n\n` +
      `🔄 البحث التلقائي كل ساعة مفعّل\n` +
      `🌐 الواجهة: http://localhost:${PORT}`
    );

    // Keep-alive: self-ping every 10 minutes to prevent Render from sleeping
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_URL) {
      setInterval(async () => {
        try {
          const res = await fetch(`${RENDER_URL}/api/health`);
          const data = await res.json();
          console.log(`💓 Keep-alive ping OK (uptime: ${Math.round(data.uptime)}s)`);
        } catch (err) {
          console.log(`⚠ Keep-alive ping failed: ${err.message}`);
        }
      }, 10 * 60 * 1000); // every 10 minutes

      // Telegram heartbeat every 10 minutes
      setInterval(async () => {
        try {
          const apts = db.getAllApartments();
          const uptime = Math.round(process.uptime() / 60);
          await telegram.sendMessage(
            `💓 <b>السيرفر شغال</b> | ⏱ ${uptime} دقيقة | 🏠 ${apts.length} شقة`
          );
        } catch (err) {
          console.log(`⚠ Heartbeat message failed: ${err.message}`);
        }
      }, 10 * 60 * 1000); // every 10 minutes

      console.log("💓 Keep-alive enabled (ping + Telegram every 10 min)");
    }

    // Run initial fetch on start
    console.log("🔄 Running initial fetch...");
    runFetch().catch((err) => console.error("Initial fetch error:", err));
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
