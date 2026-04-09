/**
 * Arabic / German UI for index shell + React root (DOM text replacement).
 */
(function () {
  const STORAGE_KEY = "appLang";

  const shell = {
    ar: {
      pageTitle: "شقق بوكستيهودة 2026",
      metaDescription: "تطبيق لتتبع الشقق المتاحة للإيجار في بوكستيهودة، ألمانيا",
      areaLabel: "📍 المنطقة:",
      areaAll: "الكل",
      settingsTelegram: "⚙️ إشعارات التلغرام",
      markSeen: "👁 تم المشاهدة",
      markSeenDone: "✅ تم",
      login: "🔑 تسجيل دخول",
      loginUser: "👤 ",
      deleted: "🗑️ المحذوفة",
      langTitle: "اللغة: Deutsch",
      settingsH3: "📱 إشعارات التلغرام",
      settingsP: "اختر المناطق اللي تريد تتلقى إشعارات تلغرام لها:",
      saveSettings: "💾 حفظ الإعدادات",
      tgSaved: "✅ تم الحفظ! الإشعارات: ",
      tgClosed: "مغلقة",
      tgFail: "❌ فشل الحفظ",
      loginH3: "🔑 تسجيل الدخول",
      loginP: "أدخل إيميلك لحفظ واسترجاع المفضلات والتواصل",
      loginSubmit: "🔑 دخول",
      loginRestore: "🔄 استرجاع البيانات",
      logout: "🚪 تسجيل خروج",
      loginBadEmail: "❌ أدخل إيميل صحيح",
      loginLoading: "⏳ جاري التحميل...",
      loginRestored: "✅ تم استرجاع ",
      loginFav: " مفضلة و ",
      loginContacted: " تواصل",
      loginOk: "✅ تم تسجيل الدخول - سيتم حفظ بياناتك تلقائياً",
      loginFail: "❌ فشل تسجيل الدخول",
      loginNet: "❌ خطأ في الاتصال",
      loginOutMsg: "👋 تم تسجيل الخروج",
      deletedH3: "🗑️ الشقق المحذوفة",
      deletedEmpty: "لا توجد شقق محذوفة",
      reasonUser: "👤 حذفته أنت",
      reasonPlatform: "🏢 حذفته المنصة",
      restore: "↩️ استرجاع",
      permDelete: "❌ حذف نهائي",
      view: "🔗 عرض",
      confirmPerm: "حذف نهائي - لا يمكن التراجع؟",
      notifTitle: "شقق بوكستيهودة 2026",
      notifNewTitle: "🏠 شقق جديدة في بوكستيهودة!",
      notifNewBody: " شقة جديدة متاحة الآن",
      notifPrefix: "🔴 ",
      notifMiddle: " شقة جديدة! - ",
    },
    de: {
      pageTitle: "Buxtehude Wohnungen 2026",
      metaDescription: "Mietwohnungen in Buxtehude und Umgebung verfolgen",
      areaLabel: "📍 Region:",
      areaAll: "Alle",
      settingsTelegram: "⚙️ Telegram-Benachrichtigungen",
      markSeen: "👁 Als gelesen",
      markSeenDone: "✅ OK",
      login: "🔑 Anmelden",
      loginUser: "👤 ",
      deleted: "🗑️ Gelöscht",
      langTitle: "Sprache: العربية",
      settingsH3: "📱 Telegram-Benachrichtigungen",
      settingsP: "Regionen auswählen, für die du Benachrichtigungen erhalten möchtest:",
      saveSettings: "💾 Speichern",
      tgSaved: "✅ Gespeichert. Regionen: ",
      tgClosed: "keine",
      tgFail: "❌ Speichern fehlgeschlagen",
      loginH3: "🔑 Anmelden",
      loginP: "E-Mail eingeben, um Favoriten und „Kontaktiert“ zu sichern und wiederherzustellen.",
      loginSubmit: "🔑 Anmelden",
      loginRestore: "🔄 Daten laden",
      logout: "🚪 Abmelden",
      loginBadEmail: "❌ Bitte gültige E-Mail eingeben",
      loginLoading: "⏳ Wird geladen...",
      loginRestored: "✅ Wiederhergestellt: ",
      loginFav: " Favoriten, ",
      loginContacted: " kontaktiert",
      loginOk: "✅ Angemeldet – Daten werden automatisch gespeichert.",
      loginFail: "❌ Anmeldung fehlgeschlagen",
      loginNet: "❌ Verbindungsfehler",
      loginOutMsg: "👋 Abgemeldet",
      deletedH3: "🗑️ Gelöschte Wohnungen",
      deletedEmpty: "Keine gelöschten Einträge",
      reasonUser: "👤 Von dir gelöscht",
      reasonPlatform: "🏢 Von der Plattform entfernt",
      restore: "↩️ Wiederherstellen",
      permDelete: "❌ Endgültig löschen",
      view: "🔗 Ansehen",
      confirmPerm: "Endgültig löschen? Dies kann nicht rückgängig gemacht werden.",
      notifTitle: "Buxtehude Wohnungen 2026",
      notifNewTitle: "🏠 Neue Wohnungen in Buxtehude!",
      notifNewBody: " neue Wohnung(en) jetzt verfügbar",
      notifPrefix: "🔴 ",
      notifMiddle: " neue Wohnungen! - ",
    },
  };

  const modal = {
    ar: {
      monthlyRent: "الإيجار الشهري",
      rooms: "غرفة",
      size: "المساحة",
      added: "أضيف: ",
      published: "نشر: ",
      viewOn: "عرض على",
      close: "✖ إغلاق",
      noCommission: "بدون عمولة",
      furnished: "مفروشة",
      balcony: "بلكون",
      garden: "حديقة",
      parking: "موقف سيارة",
    },
    de: {
      monthlyRent: "Miete (kalt/warm)",
      rooms: "Zimmer",
      size: "Fläche",
      added: "Hinzugefügt: ",
      published: "Veröffentlicht: ",
      viewOn: "Auf",
      close: "✖ Schließen",
      noCommission: "Ohne Provision",
      furnished: "Möbliert",
      balcony: "Balkon",
      garden: "Garten",
      parking: "Stellplatz",
    },
  };

  const arMonths =
    "يناير_فبراير_مارس_أبريل_مايو_يونيو_يوليو_أغسطس_سبتمبر_أكتوبر_نوفمبر_ديسمبر".split("_");
  const deMonths = "Jan_Feb_Mär_Apr_Mai_Jun_Jul_Aug_Sep_Okt_Nov_Dez".split("_");

  /** Longest-first literal replacements for React-rendered strings */
  const reactLiterals = [
    ["يتجدد تلقائياً كل 10 دقائق · تحقق من التوفر مباشرة على المواقع", "Aktualisiert alle 10 Minuten · Verfügbarkeit direkt auf den Websites prüfen"],
    ["الشقق المتاحة في بوكستيهودة", "Verfügbare Wohnungen in Buxtehude"],
    ["ابحث بالعنوان أو الموقع...", "Nach Adresse oder Ort suchen..."],
    ["لا توجد شقق بهذه المعايير", "Keine Wohnungen mit diesen Filtern"],
    ["7 مواقع · تحديث تلقائي", "7 Quellen · automatische Aktualisierung"],
    ["هل تريد حذف هذه الشقة؟", "Diese Wohnung wirklich löschen?"],
    ["متوسط (701–1050€)", "Mittel (701–1050€)"],
    ["توزيع حسب المصدر:", "Verteilung nach Quelle:"],
    ["السعر: من الأعلى", "Preis: höchster zuerst"],
    [" مساحة أدنى (م²)", " Mindestfläche (m²)"],
    ["السعر: من الأقل", "Preis: niedrigster zuerst"],
    ["المساحة: الأكبر", "Fläche: größte zuerst"],
    [" نطاق السعر (€)", " Preisspanne (€)"],
    [" إحصائيات الشقق", " Wohnungsstatistik"],
    ["اقتصادي (≤700€)", "Günstig (≤700€)"],
    ["خطأ في التحديث", "Fehler beim Aktualisieren"],
    ["شقق بوكستيهودة", "Buxtehude Wohnungen"],
    ["مسح كل الفلاتر", "Alle Filter löschen"],
    ["فاخر (>1050€)", "Premium (>1050€)"],
    ["الأحدث أولاً", "Neueste zuerst"],
    ["الغرف: الأقل", "Zimmer: wenigste zuerst"],
    ["بلكون / تراس", "Balkon / Terrasse"],
    ["إجمالي الشقق", "Wohnungen gesamt"],
    ["متوسط السعر", "Durchschnittspreis"],
    ["مسح الفلاتر", "Filter zurücksetzen"],
    [" عدد الغرف", " Zimmeranzahl"],
    ["بدون عمولة", "Ohne Provision"],
    ["موقف سيارة", "Stellplatz"],
    ["تم التواصل", "Kontaktiert"],
    [" مسح الكل", " Alle löschen"],
    [" إحصائيات", " Statistik"],
    ["جديدة فقط", "Nur neue"],
    ["مثال: 50", "z. B. 50"],
    ["أعلى سعر", "Höchster Preis"],
    [" تواصلت؟", " Kontaktiert?"],
    ["اقتصادي", "Günstig"],
    ["لا جديد", "Nichts Neues"],
    ["جاري...", "Lädt…"],
    ["أقل سعر", "Niedrigster Preis"],
    ["مفضلاتي", "Meine Favoriten"],
    ["الإيجار", "Miete"],
    ["المساحة", "Fläche"],
    [" تواصلت", " Kontaktiert"],
    [" جديدة", " neu"],
    ["تواصلت", "Kontaktiert"],
    ["فلاتر ", "Filter "],
    ["مفروشة", "Möbliert"],
    ["متاح: ", "Verfügbar: "],
    ["متوسط", "Mittel"],
    ["يناير", "Jan"],
    ["فبراير", "Feb"],
    ["مارس", "Mär"],
    ["أبريل", "Apr"],
    ["مايو", "Mai"],
    ["يونيو", "Jun"],
    ["يوليو", "Jul"],
    ["أغسطس", "Aug"],
    ["سبتمبر", "Sep"],
    ["أكتوبر", "Okt"],
    ["نوفمبر", "Nov"],
    ["ديسمبر", "Dez"],
    ["تحديث", "Aktualisierung"],
    ["مفضلة", "Favorit"],
    [" الكل", " Alle"],
    ["حديقة", "Garten"],
    [" جديد", " neu"],
    ["الغرف", "Zimmer"],
    ["بلكون", "Balkon"],
    ["فاخر", "Premium"],
    ["موقف", "Stellplatz"],
    [" عرض", " Öffnen"],
    ["عرض", "Öffnen"],
    ["جديد", "neu"],
    ["جديدة", "neu"],
    ["غرف", "Zimmer"],
    ["غرفة", "Zimmer"],
    ["م²", "m²"],
    ["إلى", "bis"],
    ["حذف", "Löschen"],
    ["من", "von"],
  ];

  // Token-level replacements for dynamic UI strings (cards, filters, chips)
  // Applied after reactLiterals, with simple "non-Arabic boundary" matching.
  const wordTokens = [
    ["الايجار", "Miete"],
    ["الإيجار", "Miete"],
    ["السعر", "Preis"],
    ["الغرف", "Zimmer"],
    ["غرف", "Zimmer"],
    ["غرفة", "Zimmer"],
    ["المساحة", "Fläche"],
    ["الموقع", "Ort"],
    ["العنوان", "Adresse"],
    ["جديد", "neu"],
    ["جديدة", "neu"],
    ["مفضلة", "Favorit"],
    ["مفضلاتي", "Meine Favoriten"],
    ["تواصلت", "Kontaktiert"],
    ["بدون", "Ohne"],
    ["عمولة", "Provision"],
    ["مفروشة", "Möbliert"],
    ["حديقة", "Garten"],
    ["بلكون", "Balkon"],
    ["تراس", "Terrasse"],
    ["موقف", "Stellplatz"],
    ["سيارة", "Auto"],
    ["الكل", "Alle"],
  ];

  function replaceTokenBounded(input, ar, de) {
    // Match ar when surrounded by non-Arabic chars or string boundaries.
    const esc = ar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\u0600-\\u06FF])(${esc})(?=[^\\u0600-\\u06FF]|$)`, "g");
    return input.replace(re, (_m, p1) => `${p1}${de}`);
  }

  function t(key) {
    const lang = getLang();
    return shell[lang][key] ?? shell.ar[key] ?? key;
  }

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) === "de" ? "de" : "ar";
  }

  function translateReactText(text) {
    if (!text || !/[\u0600-\u06FF]/.test(text)) return text;
    let out = text;
    for (const [ar, de] of reactLiterals) {
      if (out.includes(ar)) out = out.split(ar).join(de);
    }
    for (const [ar, de] of wordTokens) {
      out = replaceTokenBounded(out, ar, de);
    }
    // Dynamic cases commonly shown in the UI
    out = out.replace(/الشقق المتاحة في بوكستيهودة\s*(\d+)\s*جديدة/g, "Verfügbare Wohnungen in Buxtehude · $1 neu");
    out = out.replace(/الشقق المتاحة في بوكستيهودة(\d+)\s*جديدة/g, "Verfügbare Wohnungen in Buxtehude · $1 neu");
    out = out.replace(/(\d+)\s*جديدة/g, "$1 neu");
    // Arabic question mark variant
    out = out.replace(/تواصلت\u061F/g, "Kontaktiert?");
    out = out.replace(/^✨\s*(\d+)\s*شقة جديدة!$/, (_, n) => `✨ ${n} neue Wohnung${n === "1" ? "" : "en"}!`);
    out = out.replace(/^لا جديد$/, "Nichts Neues");
    out = out.replace(/^من أصل (\d+) تم فحصها عبر جميع المواقع$/, "Von $1 über alle Quellen geprüft");
    out = out.replace(/^تم فحص (\d+) شقة — لا إضافات$/, "$1 Wohnungen geprüft — keine neuen");
    out = out.replace(/^(\d+) شقة من 4 مواقع موثوقة$/, "$1 Wohnungen von 4 vertrauenswürdigen Quellen");
    out = out.replace(/^(\d+) شقة$/, "$1 Wohnungen");
    out = out.replace(/^(\d+) من (\d+) شقة$/, "$1 von $2 Wohnungen");
    return out;
  }

  function translateAttributes(root) {
    if (!root) return;
    const attrs = ["placeholder", "title", "aria-label", "value"];
    root.querySelectorAll("*").forEach((el) => {
      for (const a of attrs) {
        if (!el.hasAttribute || !el.hasAttribute(a)) continue;
        const v = el.getAttribute(a);
        if (!v || !/[\u0600-\u06FF]/.test(v)) continue;
        const next = translateReactText(v);
        if (next !== v) el.setAttribute(a, next);
      }
    });
  }

  function walkAndTranslate(root) {
    if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const batch = [];
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentNode;
      if (!p || p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "NOSCRIPT") continue;
      if (n.nodeValue && /[\u0600-\u06FF]/.test(n.nodeValue)) batch.push(n);
    }
    batch.forEach((node) => {
      const next = translateReactText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
    translateAttributes(root);
  }

  let mo;
  function observeRoot() {
    const root = document.getElementById("root");
    if (!root) return;
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => {
      if (getLang() !== "de") return;
      walkAndTranslate(root);
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function applyDocumentLang() {
    const lang = getLang();
    document.documentElement.lang = lang === "de" ? "de" : "ar";
    document.documentElement.dir = lang === "de" ? "ltr" : "rtl";
    document.documentElement.classList.toggle("lang-de", lang === "de");
    document.documentElement.classList.toggle("lang-ar", lang !== "de");
    const titleEl = document.querySelector("title");
    if (titleEl) titleEl.textContent = t("pageTitle");
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("metaDescription"));
  }

  function applyShell() {
    applyDocumentLang();
    const L = shell[getLang()];

    const setTxt = (sel, key) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (el && L[key] != null) el.textContent = L[key];
    };

    const areaLabel = document.querySelector("#area-filter-bar label");
    if (areaLabel) areaLabel.textContent = L.areaLabel;

    const allBtn = document.querySelector('#area-filter-bar .area-btn[data-area="all"]');
    if (allBtn) {
      const span = allBtn.querySelector(".area-count");
      allBtn.textContent = "";
      allBtn.appendChild(document.createTextNode(L.areaAll + (span ? " " : "")));
      if (span) allBtn.appendChild(span);
    }

    setTxt("#settings-btn", "settingsTelegram");
    setTxt("#mark-seen-btn", "markSeen");

    const loginBtn = document.getElementById("login-btn");
    const email = localStorage.getItem("userEmail");
    if (loginBtn) {
      if (email) {
        loginBtn.textContent = L.loginUser + email.split("@")[0];
        loginBtn.style.background = "#065f46";
        loginBtn.style.borderColor = "#059669";
      } else {
        loginBtn.textContent = L.login;
        loginBtn.style.background = "#1e3a5f";
        loginBtn.style.borderColor = "#3b82f6";
      }
    }

    const delBtn = document.getElementById("deleted-btn");
    if (delBtn) {
      const cnt = document.getElementById("deleted-count");
      const c = cnt ? cnt.textContent : "0";
      delBtn.innerHTML = "";
      delBtn.appendChild(document.createTextNode(L.deleted + " "));
      const span = document.createElement("span");
      span.id = "deleted-count";
      span.className = "area-count";
      span.textContent = c;
      delBtn.appendChild(span);
    }

    setTxt("#settings-panel h3", "settingsH3");
    const sp = document.querySelector("#settings-panel p");
    if (sp) sp.textContent = L.settingsP;
    setTxt("#save-tg-settings", "saveSettings");

    setTxt("#login-panel h3", "loginH3");
    const lp = document.querySelector("#login-panel p");
    if (lp) lp.textContent = L.loginP;
    setTxt("#login-submit", email ? "loginRestore" : "loginSubmit");
    setTxt("#logout-btn", "logout");
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.style.display = email ? "block" : "none";

    const dh3 = document.querySelector("#deleted-panel h3");
    if (dh3) dh3.textContent = L.deletedH3;
    setTxt("#deleted-empty", "deletedEmpty");

    const langBtn = document.getElementById("lang-toggle");
    if (langBtn) {
      langBtn.textContent = lang === "de" ? "عربي" : "DE";
      langBtn.title = L.langTitle;
    }

    if (getLang() === "de") {
      const root = document.getElementById("root");
      if (root) walkAndTranslate(root);
    }
  }

  function toggleLang() {
    const cur = getLang();
    const next = cur === "de" ? "ar" : "de";
    localStorage.setItem(STORAGE_KEY, next);
    location.reload();
  }

  function formatModalDate(d, isPublished) {
    if (!d) return "";
    try {
      const dt =
        d.length === 10
          ? new Date(d.split("-")[0], d.split("-")[1] - 1, d.split("-")[2])
          : new Date(d.replace(" ", "T") + "Z");
      const months = getLang() === "de" ? deMonths : arMonths;
      return dt.getDate() + " " + months[dt.getMonth()];
    } catch {
      return d;
    }
  }

  function getModalStrings() {
    return modal[getLang()];
  }

  window.I18N = {
    t,
    getLang,
    toggleLang,
    applyShell,
    getModalStrings,
    formatModalDate,
    walkAndTranslate,
    observeRoot,
  };

  document.addEventListener("DOMContentLoaded", () => {
    const lt = document.getElementById("lang-toggle");
    if (lt) lt.addEventListener("click", toggleLang);
    applyShell();
    observeRoot();
    setTimeout(() => {
      if (getLang() === "de") walkAndTranslate(document.getElementById("root"));
    }, 500);
    setTimeout(() => {
      if (getLang() === "de") walkAndTranslate(document.getElementById("root"));
    }, 2500);
  });
})();
