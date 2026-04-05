const BOT_TOKEN = process.env.BOT_TOKEN || "8697634207:AAEm3KTCVP_RTf6g8Or_WLlP7lLGugrvxpE";
const CHAT_ID = process.env.CHAT_ID || "7234864229";

const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(text) {
  try {
    const res = await fetch(`${API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.log(`  ⚠ Telegram error: ${res.status}`);
    }
  } catch (err) {
    console.log(`  ⚠ Telegram send failed: ${err.message}`);
  }
}

function formatApartment(apt) {
  const price = apt.price ? `${apt.price}€` : "غير محدد";
  const rooms = apt.rooms ? `${apt.rooms} غرف` : "";
  const size = apt.size ? `${apt.size}m²` : "";
  const details = [rooms, size].filter(Boolean).join(" | ");

  const features = [];
  if (apt.noCommission) features.push("✅ بدون عمولة");
  if (apt.hasBalcony) features.push("🌿 بلكون");
  if (apt.hasGarden) features.push("🌳 حديقة");
  if (apt.hasParking) features.push("🅿️ موقف");
  if (apt.furnished) features.push("🛋 مفروشة");

  let msg = `🏠 <b>${apt.title}</b>\n`;
  msg += `💰 ${price}`;
  if (details) msg += ` | ${details}`;
  msg += `\n📍 ${apt.address || "Buxtehude"}`;
  msg += `\n📌 ${apt.source}`;
  if (features.length) msg += `\n${features.join(" ")}`;
  if (apt.url) msg += `\n\n🔗 <a href="${apt.url}">فتح الإعلان</a>`;

  return msg;
}

async function notifyNewApartments(apartments) {
  if (!apartments.length) return;

  // Summary message
  await sendMessage(`🔔 <b>${apartments.length} شقة جديدة!</b>\n\nالتفاصيل تأتي...`);

  // Send each apartment (with delay to avoid rate limit)
  for (let i = 0; i < apartments.length; i++) {
    await sendMessage(formatApartment(apartments[i]));
    if (i < apartments.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function notifyFetchComplete(totalFound, newCount) {
  if (newCount === 0) return; // Only notify when there are new ones
  await sendMessage(
    `✅ تم الفحص: ${totalFound} شقة، منها <b>${newCount} جديدة</b>`
  );
}

// ==================== Bot Commands Listener ====================
let lastUpdateId = 0;
let commandHandler = null;

function setCommandHandler(handler) {
  commandHandler = handler;
}

async function pollUpdates() {
  try {
    const res = await fetch(
      `${API_URL}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !data.result) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg || !msg.text) continue;
      if (String(msg.chat.id) !== CHAT_ID) continue;

      const text = msg.text.trim().toLowerCase();
      if (commandHandler) {
        await commandHandler(text);
      }
    }
  } catch (err) {
    // Silently retry on network errors
  }
}

function startPolling() {
  console.log("🤖 Telegram bot listening for commands...");
  setInterval(pollUpdates, 3000);
  // Register commands menu
  fetch(`${API_URL}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "بحث عن شقق جديدة 🔍" },
        { command: "all", description: "عرض جميع الشقق المحفوظة 📋" },
        { command: "cheap", description: "شقق أقل من 800€ 💰" },
        { command: "fav", description: "الشقق المفضلة ⭐" },
        { command: "status", description: "إحصائيات 📊" },
        { command: "latest", description: "آخر 5 شقق مضافة 🕐" },
        { command: "help", description: "عرض الأوامر المتاحة ❓" },
      ],
    }),
  }).catch(() => {});
}

module.exports = {
  sendMessage,
  formatApartment,
  notifyNewApartments,
  notifyFetchComplete,
  setCommandHandler,
  startPolling,
  CHAT_ID,
};
