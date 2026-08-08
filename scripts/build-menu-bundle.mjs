/**
 * Unpacks the "AI Menu" design artifact into files this repo can serve.
 *
 * The artifact ships as a single self-extracting HTML file: a manifest of
 * gzipped assets plus a page template written in the `<x-dc>` template dialect
 * (`{{ }}` bindings, `<sc-if>`, `<sc-for>`). Rather than hand-porting the design
 * we keep it verbatim and swap only two things:
 *
 *   - asset URLs, so fonts and the runtime load from /menu-app instead of blobs
 *   - the hard-coded demo dishes, so the page reads window.__FROQ_MENU__
 *
 * Run after dropping in a new artifact export:
 *   node scripts/build-menu-bundle.mjs "~/Downloads/AI Menu.html"
 */

import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public", "menu-app");
const GENERATED = join(ROOT, "src", "lib", "menu", "guest-app", "bundle.generated.ts");

const REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";

/** Demo constants in the artifact's script that real menu data replaces. */
const DATA_CONSTANTS = {
  MENU: "menu",
  FEATURED: "featured",
  DIET: "diet",
  ALLERGENS: "allergens",
  KCAL: "kcal",
  SIGNAL: "signal",
  SERVER: "server",
  VOICE_SAMPLES: "voiceSamples",
  // Hand-written answers about the demo's dishes. Left unbound they would offer
  // a real guest dishes this kitchen has never served.
  REPLIES: "replies",
};

function readBundlerBlocks(src) {
  const blocks = {};
  const open = /<script type="__bundler\/([a-z_]+)"[^>]*>/g;
  let match;
  while ((match = open.exec(src))) {
    const start = match.index + match[0].length;
    const end = src.indexOf("</script>", start);
    blocks[match[1]] = src.slice(start, end);
  }
  return blocks;
}

function decodeAssets(manifest) {
  const assets = {};
  for (const [uuid, entry] of Object.entries(manifest)) {
    const raw = Buffer.from(entry.data, "base64");
    assets[uuid] = { mime: entry.mime, bytes: entry.compressed ? gunzipSync(raw) : raw };
  }
  return assets;
}

/**
 * The artifact references assets by bare uuid. Give each one a stable public
 * path so the served page is plain static HTML with no blob plumbing.
 */
function planAssetPaths(assets, extResources, template) {
  const external = new Map(extResources.map((entry) => [entry.uuid, entry.id]));
  const paths = {};
  for (const [uuid, asset] of Object.entries(assets)) {
    const url = external.get(uuid);
    if (url === REACT_URL) paths[uuid] = "react.js";
    else if (url === REACT_DOM_URL) paths[uuid] = "react-dom.js";
    else if (asset.mime.startsWith("font/")) paths[uuid] = `fonts/${uuid}.woff2`;
    // The one script the template loads directly is the template runtime.
    else if (template.includes(uuid)) paths[uuid] = "runtime.js";
    else paths[uuid] = `${uuid}.bin`;
  }
  return paths;
}

/**
 * Point each `const X = <demo data>` at window.__FROQ_MENU__ while leaving the
 * literal behind as the fallback, so the artifact still runs standalone.
 */
function bindScriptToLiveData(script) {
  let out = script;
  for (const [name, key] of Object.entries(DATA_CONSTANTS)) {
    const pattern = new RegExp(`^const ${name} = `, "m");
    if (!pattern.test(out)) throw new Error(`artifact script has no "const ${name} =" to bind`);
    out = out.replace(pattern, `const ${name} = __FROQ ? __FROQ.${key} : `);
  }
  // No check-in / table session — guests land straight on the menu.
  const state = /^ {2}state = \{/m;
  if (!state.test(out)) throw new Error("artifact script has no component state to seed");
  out = out.replace(state, "  state = {\n    formTable: null,\n    session: true,");

  // The artifact gates the check-in sheet on session !== true; keep it shut.
  const loginOpen = "loginOpen: this.state.session !== true,";
  if (out.includes(loginOpen)) out = out.replace(loginOpen, "loginOpen: false,");

  // Featured rail is Chef's choice — kitchen picks, not live order heat.
  const popularLabel =
    "popular: { EN: 'Popular right now', HI: 'अभी लोकप्रिय', MR: 'आत्ता लोकप्रिय', BN: 'এখন জনপ্রিয়', TA: 'இப்போது பிரபலம்' },";
  const signalLabel =
    "signal: { EN: '{n} ordered in the last hour', HI: 'पिछले घंटे में {n} ऑर्डर', MR: 'गेल्या तासात {n} ऑर्डर', BN: 'গত এক ঘণ্টায় {n} অর্ডার', TA: 'கடந்த ஒரு மணியில் {n} ஆர்டர்' },";
  if (!out.includes(popularLabel)) throw new Error("artifact script has no popular label");
  if (!out.includes(signalLabel)) throw new Error("artifact script has no signal label");
  out = out.replace(
    popularLabel,
    "popular: { EN: \"Chef's choice\", HI: 'शेफ की पसंद', MR: 'शेफची निवड', BN: 'শেফের পছন্দ', TA: 'செஃப் தேர்வு' },",
  );
  out = out.replace(
    signalLabel,
    "signal: { EN: \"Chef's pick\", HI: 'शेफ की पसंद', MR: 'शेफची निवड', BN: 'শেফের পছন্দ', TA: 'செஃப் பிக்' },",
  );
  // Section pill reads "Picks" (was "Live") — keep TXT.live as the bound label.
  const liveLabel =
    "live: { EN: 'Live', HI: 'लाइव', MR: 'लाइव्ह', BN: 'লাইভ', TA: 'நேரலை' },";
  if (out.includes(liveLabel)) {
    out = out.replace(
      liveLabel,
      "live: { EN: 'Picks', HI: 'पसंद', MR: 'पिक्स', BN: 'পিক্স', TA: 'பிக்ஸ்' },",
    );
  }

  // The artifact opens the thread by boasting about what the assistant knows.
  // Lead with the guest's decision instead, and name the three things they can
  // actually steer by, so the first tap is an informed one.
  const greetings = [
    [
      'text: "I know every dish here — heat levels, allergens, what the kitchen is proud of tonight. What are you after?"',
      'text: "Looking for something delicious? I can help you choose based on your taste, spice level, or dietary preferences."',
    ],
    [
      "greeting: 'मैं यहाँ का हर व्यंजन जानता हूँ — तीखापन, एलर्जी, और आज रसोई किस पर गर्व करती है। आपका मन क्या है?'",
      "greeting: 'कुछ स्वादिष्ट ढूँढ रहे हैं? मैं आपके स्वाद, तीखेपन या डाइट के हिसाब से चुनने में मदद कर सकता हूँ।'",
    ],
    [
      "greeting: 'मला येथील प्रत्येक पदार्थ माहीत आहे — तिखटपणा, अ‍ॅलर्जी आणि आज स्वयंपाकघराला कशाचा अभिमान आहे. तुम्हाला काय आवडेल?'",
      "greeting: 'काहीतरी चविष्ट शोधताय? तुमच्या चवीनुसार, तिखटपणानुसार किंवा आहारानुसार निवडायला मी मदत करेन.'",
    ],
    [
      "greeting: 'আমি এখানের প্রতিটি পদ জানি — ঝাল, অ্যালার্জি, আর আজ রান্নাঘর কী নিয়ে গর্বিত। আপনার কী খেতে ইচ্ছে?'",
      "greeting: 'সুস্বাদু কিছু খুঁজছেন? আপনার পছন্দ, ঝালের মাত্রা বা ডায়েট অনুযায়ী বেছে নিতে আমি সাহায্য করতে পারি।'",
    ],
    [
      "greeting: 'இங்குள்ள ஒவ்வொரு உணவும் எனக்குத் தெரியும் — காரம், ஒவ்வாமை, இன்று சமையலறை எதில் பெருமை கொள்கிறது. உங்களுக்கு என்ன வேண்டும்?'",
      "greeting: 'சுவையான ஏதாவது தேடுகிறீர்களா? உங்கள் ரசனை, காரத்தின் அளவு அல்லது உணவுப் பழக்கத்திற்கு ஏற்பத் தேர்ந்தெடுக்க உதவுகிறேன்.'",
    ],
  ];
  for (const [from, to] of greetings) {
    if (!out.includes(from)) throw new Error("artifact script has no assistant greeting");
    out = out.replace(from, to);
  }

  // Non-EN packs render m.greeting via U.greeting (chrome u:greeting). Without
  // the flag, OR/AS/… keep the hardcoded English seed text.
  const greetingSeed =
    "messages: [{ role: 'ai', text: \"Looking for something delicious? I can help you choose based on your taste, spice level, or dietary preferences.\", recs: [] }]";
  const greetingSeedFlagged =
    "messages: [{ role: 'ai', greeting: true, text: \"Looking for something delicious? I can help you choose based on your taste, spice level, or dietary preferences.\", recs: [] }]";
  if (!out.includes(greetingSeed)) {
    throw new Error("artifact script has no English greeting seed to flag");
  }
  out = out.replace(greetingSeed, greetingSeedFlagged);

  // Diet chips shipped without Non-veg — add the chip + match rule.
  out = bindNonvegFilter(out);

  // The suggestion and follow-up chips name demo dishes ("the short rib") and
  // lean on canned answers, so the caller supplies ones this menu can answer.
  for (const [name, key] of [
    ["chips", "chips"],
    ["followups", "followups"],
  ]) {
    const line = new RegExp(`^(\\s*)const ${name} = \\[(.+)\\];$`, "m");
    const found = out.match(line);
    if (!found) throw new Error(`artifact script has no "${name}" chip list`);
    out = out.replace(
      line,
      `$1const ${name} = (__FROQ ? __FROQ.${key} : [${found[2]
        .split("chip(")
        .slice(1)
        .map((part) => part.slice(0, part.lastIndexOf(")")))
        .join(", ")}]).map(chip);`,
    );
  }

  // The cart offers "a free lava cake over ₹999" — a promise no merchant here
  // has made. Hide the banner until a real reward is passed in.
  const rewardCard = `      rewardCardStyle: (() => {\n        const on =`;
  if (!out.includes(rewardCard)) throw new Error("artifact script has no reward card style");
  out = out.replace(
    rewardCard,
    `      rewardCardStyle: (() => {\n        if (__FROQ && !__FROQ.reward) return { display: 'none' };\n        const on =`,
  );

  // Meal planning walks five category ids the demo happened to use. A real menu
  // names its sections anything, so fall back to pricing the whole menu.
  const planPools =
    "const order = [pick('mains'), pick('starters'), pick('sides'), pick('drinks'), pick('sweet')];";
  if (!out.includes(planPools)) throw new Error("artifact script has no meal-plan pools");
  out = out.replace(
    planPools,
    planPools.replace("const order =", "let order =") +
      "\n    if (!order.some(p => p.length)) order = [MENU.reduce((a, c) => a.concat(c.items), []).sort((a, b) => a.price - b.price)];",
  );

  // Featured rail is already "Chef's choice" — hide the redundant "Chef's pick"
  // tag under each card name (star next to the title stays).
  const signal = "signal: (TXT.signal[lang] || TXT.signal.EN).replace('{n}', SIGNAL[f.name] || 12),";
  if (!out.includes(signal)) throw new Error("artifact script has no featured signal binding");
  out = out.replace(signal, "signal: '',");

  // The cart's calorie readout has no data behind it yet, and "~0 kcal" reads
  // as a measurement rather than a blank. Drop the row until it means something.
  const kcalRow =
    "{ isKcal: true, short: w('kcalShort'), value: '~' + Math.round(kcal / 10) * 10 + ' kcal' },";
  if (!out.includes(kcalRow)) throw new Error("artifact script has no kcal insight row");
  out = out.replace(kcalRow, `...(kcal > 0 ? [${kcalRow.replace(/,$/, "")}] : []),`);

  // Dish cards, chat recommendations and the cart suggestion all reserve a box
  // the demo left empty. Hand each view model a background-image so real photos
  // land in the slots the design already drew; dishes without one keep the hatch.
  const fields = (dish) => `photo: __photoBg(${dish}), noPhoto: !__photoUrl(${dish}),`;
  const photoPatches = [
    ["          num: String(n).padStart(2, '0'),", (a) => `${a}\n          ${fields("it")}`],
    ["featured: FEATURED.map(f => ({ name:", (a) => a.replace("({ name:", `({ ${fields("f")} name:`)],
    ["recs: (m.recs || []).map(r => ({ name:", (a) => a.replace("({ name:", `({ ${fields("r[0]")} name:`)],
    [
      "          name: dish(s.item.name) ? dish(s.item.name)[0] : s.item.name,",
      (a) => `${a}\n          ${fields("s.item")}`,
    ],
  ];
  for (const [anchor, build] of photoPatches) {
    if (!out.includes(anchor)) throw new Error(`artifact script has no "${anchor.trim()}"`);
    out = out.replace(anchor, () => build(anchor));
  }

  out = dropCartNote(
    bindCartTaxBreakdown(bindRealVoice(bindServedEta(bindServerCalls(out)))),
  );
  out = bindBrandHeader(out);
  out = bindMenuOpenedEvent(out);
  out = bindOnceTips(out);
  out = bindAssistantBubbles(out);
  out = bindRichRecCards(bindHeroPhoto(bindDietSpiceFlags(out)));
  out = bindFollowUs(bindOffersFlow(bindGuestFeatureGates(out)));
  out = bindFroqUiI18n(out);

  const preamble = [
    "",
    "const __FROQ = (typeof window !== 'undefined' && window.__FROQ_MENU__) || null;",
    "const __PHOTOS = (__FROQ && __FROQ.photos) || {};",
    // Heat levels keyed by dish name — the design never shipped a spice map of
    // its own, so this is always empty when the page is opened from disk.
    "const SPICE = (__FROQ && __FROQ.spice) || {};",
    "const __HERO = (__FROQ && __FROQ.heroPhoto) || '';",
    "const __HATCH = 'repeating-linear-gradient(135deg, rgba(12,26,20,0.055) 0 6px, transparent 6px 12px)';",
    "const __photoUrl = d => __PHOTOS[(d && d.name) || d] || '';",
    "const __photoBg = d => { const u = __photoUrl(d); return u ? 'url(\"' + u + '\")' : __HATCH; };",
    "const __spiceOf = name => Number(SPICE[name]) || 0;",
    "const __spiceFlags = name => { const n = __spiceOf(name); return { spice: n > 0, spice1: n >= 1, spice2: n >= 2, spice3: n >= 3 }; };",
    "const __itemOf = name => {",
    "  for (let c = 0; c < MENU.length; c++) {",
    "    const hit = MENU[c].items.find(i => i.name === name);",
    "    if (hit) return hit;",
    "  }",
    "  return null;",
    "};",
    "// First clause of the description, trimmed for a chip — never invents a list.",
    "const __ingredients = it => {",
    "  if (!it || !it.desc) return '';",
    "  let t = String(it.desc).replace(/\\s+/g, ' ').trim();",
    "  const stop = t.search(/[.!?](\\s|$)/);",
    "  if (stop > 12) t = t.slice(0, stop);",
    "  if (t.length > 34) t = t.slice(0, 32).replace(/\\s+\\S*$/, '') + '…';",
    "  return t;",
    "};",
    "const __why = it => {",
    "  if (!it || !it.desc) return '';",
    "  let t = String(it.desc).replace(/\\s+/g, ' ').trim();",
    "  if (t.length > 78) t = t.slice(0, 76).replace(/\\s+\\S*$/, '') + '…';",
    "  return t;",
    "};",
    "const __money = n => '₹' + Number(n).toLocaleString('en-IN');",
    "// Tax and service charge are the merchant's, not the template's. A rate of 0",
    "// means they removed that row, so the cart must drop the line rather than",
    "// print a zero the guest has to reason about.",
    "const __TAX = (() => {",
    "  const t = (__FROQ && __FROQ.tax) || null;",
    "  const pct = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(100, n) : 0; };",
    "  return t",
    "    ? { cgst: pct(t.cgstPercent), sgst: pct(t.sgstPercent), service: pct(t.servicePercent) }",
    "    : { cgst: 2.5, sgst: 2.5, service: 5 };",
    "})();",
    "// Allergen wording is the one thing on the card a guest may be reading for",
    "// medical reasons, so it is translated rather than left in English.",
    "const __LANG = (__FROQ && __FROQ.lang) || 'EN';",
    "const __txt = (key, fallback) => {",
    "  const row = (typeof TXT !== 'undefined' && TXT[key]) || null;",
    "  return (row && (row[__LANG] || row.EN)) || fallback;",
    "};",
    "const __ALLERGEN_KEYS = { nuts: 'alNuts', dairy: 'alDairy', gluten: 'alGluten', shellfish: 'alShellfish', egg: 'alEgg', fish: 'alFish' };",
    "const __allergenLabel = a => __txt(__ALLERGEN_KEYS[a], { nuts: 'Nuts', dairy: 'Dairy', gluten: 'Gluten', shellfish: 'Shellfish', egg: 'Egg', fish: 'Fish' }[a] || a);",
    "const __allergensOf = name => ((typeof ALLERGENS !== 'undefined' && ALLERGENS[name]) || []).map(__allergenLabel);",
    "// 'Contains' carries the whole meaning: without it the chip could be read as",
    "// a promise that the dish is free of these.",
    "const __containsLabel = list => (list && list.length) ? __txt('contains', 'Contains {a}').replace('{a}', list.join(' · ')) : '';",
    "const __kcalOf = name => {",
    "  const n = Number((typeof KCAL !== 'undefined' && KCAL[name]) || 0);",
    "  return n > 0 ? '~' + Math.round(n / 10) * 10 : '';",
    "};",
    "// Cook time and calories answer the same question — what am I in for — so",
    "// they share one chip instead of competing for room in a row that already",
    "// wraps on a narrow phone. One tilde covers both: the chip is an estimate.",
    "const __timeKcal = (mins, name) => {",
    "  const out = [];",
    "  if (mins) out.push('~' + mins + ' min');",
    "  const kcal = __kcalOf(name);",
    "  if (kcal) out.push(kcal.replace('~', '') + ' kcal');",
    "  return out.join(' · ');",
    "};",
    "const __recMeta = (name, note) => {",
    "  const it = __itemOf(name);",
    "  const diets = (typeof DIET !== 'undefined' && DIET[name]) || [];",
    "  const ingredients = __ingredients(it);",
    "  const why = __why(it) || note || '';",
    "  const kcal = __kcalOf(name);",
    "  const allergens = __allergensOf(name);",
    "  const priceN = it && it.price != null ? Number(it.price) : 0;",
    "  return Object.assign({",
    "    mins: it && it.mins ? '~' + it.mins + ' min' : '',",
    "    hasMins: !!(it && it.mins),",
    "    timeKcal: __timeKcal(it && it.mins, name),",
    "    hasTimeKcal: !!__timeKcal(it && it.mins, name),",
    "    ingredients: ingredients,",
    "    hasIngredients: !!ingredients,",
    "    why: why,",
    "    hasWhy: !!why,",
    "    kcal: kcal,",
    "    hasKcal: !!kcal,",
    "    price: priceN > 0 ? __money(priceN) : '',",
    "    hasPrice: priceN > 0,",
    "    priceN: priceN,",
    "    allergens: allergens,",
    "    allergenLabel: __containsLabel(allergens),",
    "    hasAllergens: allergens.length > 0,",
    "    isVeg: diets.indexOf('veg') > -1,",
    "    isVegan: diets.indexOf('vegan') > -1,",
    "    isNonveg: diets.indexOf('nonveg') > -1,",
    "    isGf: diets.indexOf('gf') > -1,",
    "  }, __spiceFlags(name));",
    "};",
    "// The design animates the mic bars on a CSS loop, which moves whether or not",
    "// anyone is talking. Drive them off the real input level instead. The bars are",
    "// written to directly rather than through state: this component renders the",
    "// whole menu, and re-rendering it per animation frame would drop frames.",
    "const __wave = { raf: 0, ctx: null, stream: null };",
    "const __stopWave = () => {",
    "  if (__wave.raf) cancelAnimationFrame(__wave.raf);",
    "  __wave.raf = 0;",
    "  if (__wave.stream) { try { __wave.stream.getTracks().forEach(t => t.stop()); } catch (e) {} }",
    "  if (__wave.ctx) { try { __wave.ctx.close(); } catch (e) {} }",
    "  __wave.stream = null; __wave.ctx = null;",
    "};",
    "const __waveBars = () => {",
    "  const row = document.getElementById('froq-voice-bars');",
    "  if (!row) return null;",
    "  let bars = row.children;",
    "  if (bars.length === 1 && bars[0].children.length > 1) bars = bars[0].children;",
    "  return bars.length ? bars : null;",
    "};",
    "const __startWave = () => {",
    "  const media = navigator.mediaDevices;",
    "  const Ctx = window.AudioContext || window.webkitAudioContext;",
    "  if (!media || !media.getUserMedia || !Ctx) return;",
    "  media.getUserMedia({ audio: true }).then(stream => {",
    "    if (!__waveBars()) { try { stream.getTracks().forEach(t => t.stop()); } catch (e) {} return; }",
    "    __stopWave();",
    "    __wave.stream = stream;",
    "    const ctx = new Ctx();",
    "    __wave.ctx = ctx;",
    "    const analyser = ctx.createAnalyser();",
    "    analyser.fftSize = 1024;",
    "    analyser.smoothingTimeConstant = 0.6;",
    "    ctx.createMediaStreamSource(stream).connect(analyser);",
    "    const samples = new Uint8Array(analyser.fftSize);",
    "    const tick = () => {",
    "      const bars = __waveBars();",
    "      if (!bars) { __stopWave(); return; }",
    "      analyser.getByteTimeDomainData(samples);",
    "      const span = Math.floor(samples.length / bars.length);",
    "      for (let i = 0; i < bars.length; i++) {",
    "        let peak = 0;",
    "        for (let j = i * span; j < (i + 1) * span; j++) {",
    "          const swing = Math.abs(samples[j] - 128);",
    "          if (swing > peak) peak = swing;",
    "        }",
    "        const level = Math.max(0.14, Math.min(1, (peak / 128) * 2.6));",
    "        const bar = bars[i];",
    "        bar.style.animation = 'none';",
    "        bar.style.transform = 'scaleY(' + level.toFixed(3) + ')';",
    "      }",
    "      __wave.raf = requestAnimationFrame(tick);",
    "    };",
    "    __wave.raf = requestAnimationFrame(tick);",
    "  }).catch(() => {});",
    "};",
    "const __OFFERS = (__FROQ && Array.isArray(__FROQ.offers)) ? __FROQ.offers : [];",
    "// An answer about offers reads as a wall of bullets, and the one thing the",
    "// guest wants from it (the deal) is buried mid-sentence. When the reply names",
    "// a real offer we draw that offer's own card instead, from the merchant's",
    "// data rather than the model's prose, so the terms on screen are always the",
    "// terms the kitchen honours.",
    "const __offerNamed = (line, offer) => {",
    "  const hay = line.toLowerCase();",
    "  const badge = String(offer.badge || '').trim().toLowerCase();",
    "  const title = String(offer.title || '').trim().toLowerCase();",
    "  return (!!badge && hay.indexOf(badge) > -1) || (!!title && hay.indexOf(title) > -1);",
    "};",
    "const __offersInReply = (text) => {",
    "  const body = String(text || '').replace(/\\*\\*/g, '');",
    "  if (!body || !__OFFERS.length) return [];",
    "  return __OFFERS.filter(o => __offerNamed(body, o));",
    "};",
    "// Only the lines that were purely the offer restated go; a sentence that",
    "// mentions an offer while saying something else is left alone.",
    "const __stripOfferLines = (text, offers) => {",
    "  if (!offers.length) return String(text || '');",
    "  const kept = String(text || '').split('\\n').filter(line => {",
    "    const bare = line.replace(/\\*\\*/g, '').replace(/^\\s*[\\u2022\\-\\*]\\s*/, '').trim();",
    "    if (!bare) return true;",
    "    const isBullet = /^\\s*[\\u2022\\-\\*]\\s+/.test(line);",
    "    return !(isBullet && offers.some(o => __offerNamed(bare, o)));",
    "  });",
    "  return kept.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();",
    "};",
    "// One cart, one call. The signature covers dish, quantity and language, so",
    "// reopening the sheet on an unchanged cart costs nothing and changing it by",
    "// one dish is what earns a fresh read.",
    "const __cartSignature = (cart, lang) => {",
    "  const counts = {};",
    "  (cart || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });",
    "  return Object.keys(counts).sort().map(n => n + '\\u00d7' + counts[n]).join('|') + '@' + lang;",
    "};",
    "const __cartLines = (cart) => {",
    "  const counts = {};",
    "  (cart || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });",
    "  return Object.keys(counts).map(name => ({ name: name, qty: counts[name] }));",
    "};",
    "const __ADDED_WORD = { EN: 'Added', HI: 'जोड़ा', MR: 'जोडले', BN: 'যোগ হয়েছে', TA: 'சேர்த்தாச்சு' };",
    "const __addedWord = (lang) => __ADDED_WORD[lang] || __ADDED_WORD.EN;",
    "// Sits inline at the end of the chip row, matching the list card's action",
    "// control. It turns green on tap because the cart badge that normally",
    "// confirms an add is hidden behind the chat sheet.",
    "const __addStyle = (added, extra) => Object.assign({",
    "  flex: 'none', height: 30, padding: '0 12px', borderRadius: 10,",
    "  background: added ? '#1B7A4B' : '#0C1A14', color: '#fff',",
    "  fontSize: 12, fontWeight: 700, letterSpacing: '-0.1px',",
    "  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,",
    "  cursor: 'pointer', transition: 'background .18s ease',",
    "}, extra || {});",
    "const __YES_NO = { EN: ['Yes', 'No'], HI: ['हाँ', 'नहीं'], MR: ['होय', 'नाही'], BN: ['হ্যাঁ', 'না'], TA: ['ஆம்', 'இல்லை'] };",
    "// A reply that closes on a yes/no question earns Yes / No buttons. A question",
    "// offering a choice ('tea or coffee?') is not one, and neither is an open",
    "// 'what / how' question — both need words the guest has to type.",
    "const __yesNoQuestion = (text) => {",
    "  const body = String(text || '').replace(/\\*\\*/g, '').trim();",
    "  if (!body.endsWith('?')) return false;",
    "  const ask = (body.match(/[^.!?\\n]*\\?$/) || [''])[0].trim();",
    "  if (!ask || / or /i.test(ask)) return false;",
    "  return /^(would|do|does|did|are|is|was|were|can|could|shall|should|will|have|has|may|want)\\b/i.test(ask);",
    "};",
    "const __chatExtras = (recs, askFn, text, lang, offers) => {",
    "  const words = __YES_NO[lang] || __YES_NO.EN;",
    "  const quick = __yesNoQuestion(text)",
    "    ? words.map(w => ({ label: w, onClick: () => askFn(w) }))",
    "    : [];",
    "  const names = (recs || []).map(r => r[0]);",
    "  const allergenSet = [];",
    "  names.forEach(n => __allergensOf(n).forEach(a => { if (allergenSet.indexOf(a) < 0) allergenSet.push(a); }));",
    "  const coupons = offers || [];",
    "  return {",
    "    hasAllergenNote: allergenSet.length > 0,",
    "    allergenNote: allergenSet.length ? __txt('allergenNote', 'The menu lists {a} in these dishes. Our kitchen will gladly confirm for you.').replace('{a}', allergenSet.join(', ')) : '',",
    "    hasQuick: quick.length > 0,",
    "    quick: quick,",
    "    hasOffers: coupons.length > 0,",
    "    offers: coupons,",
    "  };",
    "};",
    "",
    "// Which menu is open — assistant + cart insights post against this.",
    "const __CTX = (__FROQ && __FROQ.context) || null;",
    // Cart stays on for browsing; there is no Send order CTA / kitchen path.
    "const __ORDERING = true;",
    "",
    "function __post(path, body) {",
    "  return fetch(path, {",
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json' },",
    "    body: JSON.stringify(Object.assign({ slug: __CTX.slug, branch: __CTX.branch }, body))",
    "  }).then(r => r.json()).catch(() => null);",
    "}",
    "",
    // A visit, not a person. Random per tab so page views count visits rather
    // than reloads, and sessionStorage forgets it the moment the tab closes.
    "const __visitKey = (() => {",
    "  try {",
    "    const found = sessionStorage.getItem('froq-menu-visit');",
    "    if (found) return found;",
    "    const next = 'v' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);",
    "    sessionStorage.setItem('froq-menu-visit', next);",
    "    return next;",
    "  } catch (e) { return null; }",
    "})();",
    "",
    // Analytics must never cost the guest a frame. Actions queue, coalesce into
    // one beacon, and go out via sendBeacon so a closing tab still delivers.
    "let __trackQueue = [];",
    "let __trackTimer = null;",
    "function __flushTrack() {",
    "  clearTimeout(__trackTimer);",
    "  __trackTimer = null;",
    "  if (!__trackQueue.length || !__CTX || !__CTX.slug) { __trackQueue = []; return; }",
    "  const events = __trackQueue.slice(0, 20);",
    "  __trackQueue = [];",
    "  const body = JSON.stringify({ slug: __CTX.slug, branch: __CTX.branch, events: events });",
    "  try {",
    "    const blob = new Blob([body], { type: 'application/json' });",
    "    if (navigator.sendBeacon && navigator.sendBeacon('/api/menu/events', blob)) return;",
    "  } catch (e) {}",
    "  try {",
    "    fetch('/api/menu/events', { method: 'POST', body: body, keepalive: true }).catch(() => {});",
    "  } catch (e) {}",
    "}",
    "function __track(event, extra) {",
    "  if (!__CTX || !__CTX.slug) return;",
    "  __trackQueue.push(Object.assign({ event: event, sessionKey: __visitKey }, extra || {}));",
    "  if (__trackTimer) return;",
    "  __trackTimer = setTimeout(__flushTrack, 1200);",
    "}",
    // A guest who taps once and leaves is still a page view, so anything still
    // queued when the tab hides goes out immediately.
    "try {",
    "  addEventListener('pagehide', __flushTrack);",
    "  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') __flushTrack(); });",
    "} catch (e) {}",
    "",
    "function __chatLang(component) {",
    "  try { return LANGS[(component.state.langIndex || 0) % LANGS.length] || 'EN'; } catch (e) { return 'EN'; }",
    "}",
    "",
    "// The model answers follow-ups like 'something milder' only when it can see",
    "// what was already said, so the last few turns ride along with the question.",
    "function __chatHistory(messages, question) {",
    "  const turns = [];",
    "  (messages || []).forEach(m => {",
    "    if (!m || m.streaming) return;",
    "    // Prefer marked AI text so follow-ups keep dish names; fall back to plain.",
    "    const raw = String((m.marked && String(m.marked).replace(/\\*\\*/g, '')) || m.text || '').trim();",
    "    if (!raw) return;",
    "    turns.push({ role: m.role === 'me' ? 'user' : 'model', text: raw.slice(0, 420) });",
    "  });",
    "  const last = turns[turns.length - 1];",
    "  if (last && last.role === 'user' && last.text === String(question || '').trim()) turns.pop();",
    "  return turns.slice(-12);",
    "}",
    "",
    // Cart names as the guest sees them may be translated; wait estimates look
    // dishes up in the English catalogue the kitchen typed.
    "const __EN_NAMES = (__FROQ && __FROQ.englishNames) || {};",
    "const __enName = (name) => __EN_NAMES[name] || name;",
    "",
    "function __askAssistant(question, history, lang, cart) {",
    "  const lines = [];",
    "  (cart || []).forEach(name => { const en = __enName(name); if (en) lines.push(en); });",
    // The route records the question itself, and it can only credit it to a
    // visit if the page says which visit it was.
    "  return __post('/api/menu/assistant', { question: question, history: history || [], lang: lang || 'EN', cart: lines, session: __visitKey })",
    "    .then(r => (r && r.ok && (r.text || r.fallback)) ? { text: r.text || '', recs: r.recs || [], fallback: !!r.fallback } : null);",
    "}",
    "",
    "function __scrollChat() {",
    "  try {",
    "    const el = document.getElementById('froq-chat-scroll');",
    "    if (el) el.scrollTop = el.scrollHeight;",
    "  } catch (e) {}",
    "}",
    "",
    "// Keep toast page-dots in sync as the guest swipes between requests.",
    "function __bindCalledRail(component) {",
    "  try {",
    "    const el = document.getElementById('froq-called-rail');",
    "    if (!el || el._froqBound) return;",
    "    el._froqBound = true;",
    "    let ticking = false;",
    "    el.addEventListener('scroll', () => {",
    "      if (ticking) return;",
    "      ticking = true;",
    "      requestAnimationFrame(() => {",
    "        ticking = false;",
    "        const w = el.clientWidth || 1;",
    "        const i = Math.max(0, Math.round(el.scrollLeft / w));",
    "        if (i !== (component.state.calledSlide || 0)) component.setState({ calledSlide: i });",
    "      });",
    "    }, { passive: true });",
    "  } catch (e) {}",
    "}",
    "",
    "function __partsFromMarked(marked) {",
    "  const parts = [];",
    "  const re = /\\*\\*(.+?)\\*\\*/g;",
    "  let last = 0, match;",
    "  while ((match = re.exec(marked))) {",
    "    if (match.index > last) parts.push({ text: marked.slice(last, match.index), bold: false, plain: true });",
    "    parts.push({ text: match[1], bold: true, plain: false });",
    "    last = match.index + match[0].length;",
    "  }",
    "  if (last < marked.length) parts.push({ text: marked.slice(last), bold: false, plain: true });",
    "  if (!parts.length && marked) parts.push({ text: marked, bold: false, plain: true });",
    "  return parts;",
    "}",
    "",
    "function __markedPrefix(marked, plainLen) {",
    "  let plain = 0, i = 0;",
    "  while (i < marked.length && plain < plainLen) {",
    "    if (marked[i] === '*' && marked[i + 1] === '*') { i += 2; continue; }",
    "    i += 1;",
    "    plain += 1;",
    "  }",
    "  let out = marked.slice(0, i);",
    "  const opens = (out.match(/\\*\\*/g) || []).length;",
    "  if (opens % 2 === 1) out += '**';",
    "  return out;",
    "}",
    "",
    "function __emphasizeLocal(text, recs) {",
    "  let out = String(text || '');",
    "  out = out.replace(/\\b([0-9]{1,5})\\s*rupees?\\b/gi, '₹$1');",
    "  out = out.replace(/\\b(?:rs\\.?|inr)\\s*([0-9]{1,5})\\b/gi, '₹$1');",
    "  const names = [];",
    "  (recs || []).forEach(r => { if (r && r[0]) names.push(r[0]); });",
    "  if (typeof MENU !== 'undefined') MENU.forEach(c => c.items.forEach(it => names.push(it.name)));",
    "  names.sort((a, b) => b.length - a.length);",
    "  names.forEach(name => {",
    "    if (!name || out.indexOf('**' + name + '**') >= 0) return;",
    "    const escaped = name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');",
    "    out = out.replace(new RegExp('(' + escaped + ')', 'gi'), (match, _g, offset, src) => {",
    "      if (src.slice(offset - 2, offset) === '**') return match;",
    "      const before = offset > 0 ? src[offset - 1] : '';",
    "      const after = src[offset + match.length] || '';",
    "      if (before && /[\\w*]/.test(before)) return match;",
    "      if (after && /[\\w*]/.test(after)) return match;",
    "      return '**' + match + '**';",
    "    });",
    "  });",
    "  out = out.replace(/₹[0-9]{1,5}/g, (m, offset, src) => src.slice(offset - 2, offset) === '**' ? m : ('**' + m + '**'));",
    "  return out;",
    "}",
    "",
    "function __streamAiReply(component, opts) {",
    "  clearTimeout(component._streamTimer);",
    "  const marked = opts.marked || '';",
    "  const plain = marked.replace(/\\*\\*/g, '');",
    "  const total = plain.length;",
    "  let shown = 0;",
    "  const tick = () => {",
    "    const step = Math.max(3, Math.ceil(total / 36));",
    "    shown = Math.min(total, shown + step);",
    "    const prefix = __markedPrefix(marked, shown);",
    "    const done = shown >= total;",
    "    component.setState(s => ({",
    "      messages: s.messages.map(m => m.id === opts.id ? Object.assign({}, m, {",
    "        text: prefix.replace(/\\*\\*/g, ''),",
    "        marked: prefix,",
    "        parts: __partsFromMarked(prefix),",
    "        recs: done ? opts.recs : [],",
    "        offers: done ? (opts.offers || []) : [],",
    "        fallback: done ? !!opts.fallback : false,",
    "        streaming: !done,",
    "      }) : m)",
    "    }));",
    "    __scrollChat();",
    "    if (!done) component._streamTimer = setTimeout(tick, 20);",
    "  };",
    "  tick();",
    "}",
    "",
  ].join("\n");
  return preamble + out;
}

/**
 * Points the assistant at Gemini. Without `__CTX` — the artifact opened
 * straight from disk — replies stay local.
 */
function bindServerCalls(script) {
  let out = script;

  // The demo pauses 1.1s to look like it is thinking. A real call already takes
  // longer than that, so the typing indicator no longer needs padding.
  const delay = "this._typing = setTimeout(() => this.reply(q), 1100);";
  if (!out.includes(delay)) throw new Error("artifact script has no assistant typing delay");
  out = out.replace(delay, delay.replace("1100", "__CTX ? 120 : 1100"));

  // Budget / party asks used a local meal-plan builder + canned "plan that fits"
  // copy. On a live menu, skip that and let Gemini answer from the real catalogue.
  const planShort =
    "    const p = this.parsePlan(q);\n" +
    "    if (p) {\n" +
    "      const plan = this.buildPlan(p.budget, p.party);\n" +
    "      this.setState(s => ({\n" +
    "        typing: false,\n" +
    "        messages: s.messages.concat([{ role: 'ai', key: q, planText: true, text: '', recs: [], plan }])\n" +
    "      }));\n" +
    "      return;\n" +
    "    }";
  if (!out.includes(planShort)) throw new Error("artifact script has no parsePlan short-circuit");
  out = out.replace(
    planShort,
    "    if (!__CTX) {\n" +
      "      const p = this.parsePlan(q);\n" +
      "      if (p) {\n" +
      "        const plan = this.buildPlan(p.budget, p.party);\n" +
      "        this.setState(s => ({\n" +
      "          typing: false,\n" +
      "          messages: s.messages.concat([{ role: 'ai', key: q, planText: true, text: '', recs: [], plan }])\n" +
      "        }));\n" +
      "        return;\n" +
      "      }\n" +
      "    }",
  );

  // reply() picks a canned answer and renders it in one breath. Split those so
  // the render can happen later, when the model has actually answered.
  const start = out.indexOf("    const hit = REPLIES[q]");
  const tail = "    }));\n";
  const end = out.indexOf(tail, start);
  if (start === -1 || end === -1) throw new Error("artifact script has no assistant reply block");
  const original = out.slice(start, end + tail.length);
  const local = original
    .slice(0, original.indexOf(" || { fallback: true"))
    .replace("const hit = REPLIES[q]", "const local = REPLIES[q]");
  out =
    out.slice(0, start) +
    [
      `${local};`,
      "    const blank = { fallback: true, text: '', recs: [] };",
      "    const show = hit => {",
      "      const id = 'm' + Date.now();",
      "      const answer = (hit && hit.text) || '';",
      // The offer becomes a card below the bubble, so its bullet line comes out
      // of the prose rather than being said twice.
      "      const offers = __offersInReply(answer);",
      "      const raw = __stripOfferLines(answer, offers);",
      "      const recs = (hit && hit.recs) || [];",
      "      const handoff = !!(hit && hit.fallback) || /\\b(call (a )?server|server over|notify staff|need something|check (that |with .+ )?for you|cannot tell you|can't tell you|do not have access|don't have access|ask (a )?server|staff (can|will) check)\\b/i.test(raw);",
      "      const fallback = handoff;",
      // Handoffs use canned T('fallback') (no Call staff — that feature is retired).
      "      const marked = fallback ? '' : (raw.indexOf('**') >= 0 ? raw : __emphasizeLocal(raw, recs));",
      "      this.setState(s => ({",
      "        typing: false,",
      "        messages: s.messages.concat([{ role: 'ai', key: q, text: '', marked: '', parts: [], recs: [], fallback: false, id: id, streaming: true }])",
      "      }));",
      "      __scrollChat();",
      "      if (!marked) {",
      "        this.setState(s => ({",
      "          messages: s.messages.map(m => m.id === id ? Object.assign({}, m, { text: '', parts: [], recs: [], offers: offers, fallback: fallback, streaming: false }) : m)",
      "        }));",
      "        return;",
      "      }",
      "      __streamAiReply(this, { id: id, marked: marked, recs: recs, offers: offers, fallback: false });",
      "    };",
      "    if (__CTX) {",
      "      // A dish the guest named is answered locally either way, so a model",
      "      // that is slow, rate-limited or down still leaves them better off.",
      "      const history = __chatHistory(this.state.messages, q);",
      "      __askAssistant(q, history, __chatLang(this), this.state.cart).then(r => show(r || local || blank)).catch(() => show(local || blank));",
      "      return;",
      "    }",
      "    show(local || blank);\n",
    ].join("\n") +
    out.slice(end + tail.length);

  return out;
}

/**
 * Post-order ETA / serve tracking is retired with table ordering. The artifact
 * still has a demo startService(); leave it untouched for offline previews.
 */
function bindServedEta(script) {
  return script;
}

/**
 * The design fakes voice with a random sample after 3s. Wire the mic to the
 * Web Speech API so guests actually dictate their question.
 */
function bindRealVoice(script) {
  const demo =
    "startVoice: () => {\n" +
    "        clearTimeout(this._voice);\n" +
    "        this.setState({ chatOpen: true, recording: true });\n" +
    "        this._voice = setTimeout(() => {\n" +
    "          this.setState({ recording: false });\n" +
    "          this.ask(VOICE_SAMPLES[Math.floor(Math.random() * VOICE_SAMPLES.length)]);\n" +
    "        }, 3200);\n" +
    "      },\n" +
    "      stopVoice: () => {\n" +
    "        clearTimeout(this._voice);\n" +
    "        this.setState({ recording: false });\n" +
    "        this.ask(VOICE_SAMPLES[Math.floor(Math.random() * VOICE_SAMPLES.length)]);\n" +
    "      },";
  if (!script.includes(demo)) throw new Error("artifact script has no demo startVoice/stopVoice");

  const real = [
    "startVoice: () => {",
    "        clearTimeout(this._voice);",
    "        try { if (this._recog) { this._recog.onend = null; this._recog.abort(); } } catch (e) {}",
    "        this._recog = null;",
    "        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;",
    "        if (!SR) {",
    "          this.setState({ chatOpen: true, recording: false });",
    "          this.ask('What do you recommend?');",
    "          return;",
    "        }",
    "        const recog = new SR();",
    "        this._recog = recog;",
    "        const langMap = { EN: 'en-IN', HI: 'hi-IN', MR: 'mr-IN', BN: 'bn-IN', TA: 'ta-IN' };",
    "        recog.lang = langMap[__chatLang(this)] || 'en-IN';",
    "        recog.interimResults = true;",
    "        recog.continuous = false;",
    "        recog.maxAlternatives = 1;",
    "        let finalText = '';",
    "        recog.onstart = () => {",
    "          this.setState({ chatOpen: true, recording: true });",
    "          setTimeout(__startWave, 60);",
    "        };",
    "        recog.onresult = (event) => {",
    "          let interim = '';",
    "          for (let i = event.resultIndex; i < event.results.length; i++) {",
    "            const piece = event.results[i][0].transcript;",
    "            if (event.results[i].isFinal) finalText += (finalText ? ' ' : '') + piece;",
    "            else interim += piece;",
    "          }",
    "          const shown = (finalText || interim).trim();",
    "          if (shown) this.setState({ draft: shown });",
    "        };",
    "        recog.onerror = () => {",
    "          this._recog = null;",
    "          __stopWave();",
    "          this.setState({ recording: false });",
    "        };",
    "        recog.onend = () => {",
    "          this._recog = null;",
    "          __stopWave();",
    "          const q = (finalText || (this.state.draft || '')).trim();",
    "          this.setState({ recording: false });",
    "          if (q) this.ask(q);",
    "        };",
    "        try { recog.start(); }",
    "        catch (e) { this._recog = null; __stopWave(); this.setState({ recording: false }); }",
    "      },",
    "      stopVoice: () => {",
    "        clearTimeout(this._voice);",
    "        __stopWave();",
    "        try { if (this._recog) this._recog.stop(); else this.setState({ recording: false }); }",
    "        catch (e) { this.setState({ recording: false }); }",
    "      },",
  ].join("\n");

  return script.replace(demo, real);
}

/**
 * Check-in table picker uses this branch's dining_tables (same inventory as
 * Waitlist / Reservations), not a hard-coded 1–18 list.
 */
function bindBranchTables(script) {
  const demo =
    "tableOptions: [{ value: '', label: T('pickTable') }].concat(Array.from({ length: 18 }, (_, i) => ({ value: String(i + 1), label: T('tableN').replace('{n}', i + 1) }))),";
  if (!script.includes(demo)) {
    throw new Error("artifact script has no demo tableOptions list");
  }
  const live = [
    "tableOptions: [{ value: '', label: T('pickTable') }].concat((() => {",
    "        const rows = (__FROQ && Array.isArray(__FROQ.tables) && __FROQ.tables.length)",
    "          ? __FROQ.tables",
    "          : (__FROQ ? [] : Array.from({ length: 18 }, (_, i) => ({ number: i + 1, label: null })));",
    "        return rows.map(t => ({",
    "          value: String(t.number),",
    "          label: (t.label && String(t.label).trim())",
    "            ? String(t.label).trim()",
    "            : ('T' + t.number),",
    "        }));",
    "      })()),",
  ].join("\n");
  return script.replace(demo, live);
}

/**
 * Cart stays available for browsing (add / qty / sheet). There is no Send
 * order CTA — that button is stripped in bindCartTaxBreakdown.
 */
function bindGuestFeatureGates(script) {
  let out = script;

  const cart = "hasCart: total > 0,";
  if (!out.includes(cart)) throw new Error("artifact script has no hasCart");
  out = out.replace(
    cart,
    ["hasCart: total > 0,", "showOrdering: true,", "cartCount: total,"].join("\n      "),
  );

  // List + featured dish rows already carry diet flags; tag whether + is shown.
  const listFlags = "            hasKcal: !!__kcalOf(it.name),";
  if (!out.includes(listFlags)) throw new Error("artifact script has no list hasKcal");
  out = out.replace(
    listFlags,
    [listFlags, "            showAdd: true,"].join("\n"),
  );

  const featured =
    "isVeg: (DIET[f.name] || []).indexOf('veg') > -1, isVegan: (DIET[f.name] || []).indexOf('vegan') > -1, isGf: (DIET[f.name] || []).indexOf('gf') > -1, isNonveg: (DIET[f.name] || []).indexOf('nonveg') > -1, ...__spiceFlags(f.name),";
  if (!out.includes(featured)) throw new Error("artifact script has no featured flags for showAdd");
  out = out.replace(featured, `${featured} showAdd: true,`);

  return out;
}

/** Add Non-veg + per-chip icon flags to the guest diet filter row. */
function bindNonvegFilter(script) {
  let out = script;

  const veganLabel = "  fVegan: { EN: 'Vegan',";
  if (!out.includes(veganLabel)) throw new Error("artifact script has no fVegan label");
  if (!out.includes("fNonveg:")) {
    out = out.replace(
      veganLabel,
      "  fNonveg: { EN: 'Non-veg', HI: 'नॉन-वेज', MR: 'नॉन-व्हेज', BN: 'নন-ভেজ', TA: 'நான்-வெஜ்' },\n" +
        veganLabel,
    );
  }

  const filters =
    "filters: [['all', T('fAll')], ['veg', T('fVeg')], ['vegan', T('fVegan')], ['gf', T('fGf')], ['quick', T('fQuick')], ['picks', T('fPicks')]].map(([id, label]) => {\n" +
    "        const on = diet === id;\n" +
    "        return {\n" +
    "          label,\n" +
    "          onClick: () => this.refresh({ diet: id }),\n" +
    "          style: {\n" +
    "            flex: 'none', padding: '9px 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',\n" +
    "            fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.1px',\n" +
    "            background: on ? accentSoft : '#fff', color: on ? accent : '#41564A',\n" +
    "            border: '1px solid ' + (on ? accent : '#E1E9E4')\n" +
    "          }\n" +
    "        };\n" +
    "      }),";
  if (!out.includes(filters)) throw new Error("artifact script has no diet filters list");
  out = out.replace(
    filters,
    "filters: [['all', T('fAll')], ['veg', T('fVeg')], ['nonveg', T('fNonveg')], ['vegan', T('fVegan')], ['gf', T('fGf')], ['quick', T('fQuick')], ['picks', T('fPicks')]].map(([id, label]) => {\n" +
      "        const on = diet === id;\n" +
      "        return {\n" +
      "          label,\n" +
      "          onClick: () => this.refresh({ diet: id }),\n" +
      "          isAll: id === 'all',\n" +
      "          isVeg: id === 'veg',\n" +
      "          isNonveg: id === 'nonveg',\n" +
      "          isVegan: id === 'vegan',\n" +
      "          isGf: id === 'gf',\n" +
      "          isQuick: id === 'quick',\n" +
      "          isPicks: id === 'picks',\n" +
      "          style: {\n" +
      "            flex: 'none', display: 'inline-flex', alignItems: 'center', gap: '7px',\n" +
      "            padding: '8px 13px 8px 10px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',\n" +
      "            fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.1px',\n" +
      "            background: on ? accentSoft : '#fff', color: on ? accent : '#41564A',\n" +
      "            border: '1px solid ' + (on ? accent : '#E1E9E4')\n" +
      "          }\n" +
      "        };\n" +
      "      }),",
  );

  const match =
    "if ((diet === 'veg' || diet === 'vegan' || diet === 'gf')) {\n" +
    "        const d = dietsOf(it);\n" +
    "        if (diet === 'veg' ? !(d.indexOf('veg') > -1 || d.indexOf('vegan') > -1) : d.indexOf(diet) < 0) return false;\n" +
    "      }";
  if (!out.includes(match)) throw new Error("artifact script has no diet match rule");
  out = out.replace(
    match,
    "if ((diet === 'veg' || diet === 'vegan' || diet === 'gf' || diet === 'nonveg')) {\n" +
      "        const d = dietsOf(it);\n" +
      "        if (diet === 'veg' ? !(d.indexOf('veg') > -1 || d.indexOf('vegan') > -1) : d.indexOf(diet) < 0) return false;\n" +
      "      }",
  );

  return out;
}

/**
 * One-tap "Need something?" sheet: compact icon rows, instant submit with a
 * brief loading state, then a success line and auto-dismiss. Replaces the old
 * pick-a-reason + confirm button flow.
 */
function bindNeedSomethingFlow(script) {
  let out = script;

  const state = "chatOpen: false, callOpen: false, called: false, calledReason: '',";
  if (!out.includes(state)) throw new Error("artifact script has no call sheet state");
  out = out.replace(
    state,
    "chatOpen: false, callOpen: false, called: false, calledReason: '', calledRequests: [], calledSlide: 0, callSending: null, callDone: null,",
  );

  if (!out.includes("const reasonDefs = [")) throw new Error("artifact script has no reasonDefs");
  // Match from reasonDefs through ready — the exact whitespace may vary; use index slice.
  const defsStart = out.indexOf("    const reasonDefs = [");
  const readyLine = "    const ready = !!this.state.reason;";
  const readyAt = out.indexOf(readyLine, defsStart);
  if (defsStart === -1 || readyAt === -1) throw new Error("artifact script reason block moved");

  const replacement = [
    "    const CALL_DONE = {",
    "      'Ready to order': 'Ready to order noted',",
    "      'Water refill': 'Water requested',",
    "      'Request bill': 'Bill requested',",
    "      'Extra cutlery': 'Cutlery requested',",
    "      'Report an issue': 'Issue reported',",
    "      'Other request': 'Server notified',",
    "    };",
    "    const reasonDefs = [",
    "      { key: 'Ready to order', label: 'Ready to order', hint: 'A server will take your order', eta: '~2 min', group: 'quick', kind: 'order' },",
    "      { key: 'Water refill', label: 'Water refill', hint: 'Fresh water for the table', eta: '~3 min', group: 'quick', kind: 'water' },",
    "      { key: 'Request bill', label: 'Request bill', hint: 'Card, UPI or split', eta: '~2 min', group: 'quick', kind: 'bill' },",
    "      { key: 'Extra cutlery', label: 'Extra cutlery', hint: 'Napkins, plates, spoons', eta: '', group: 'quick', kind: 'cutlery' },",
    "      { key: 'Report an issue', label: 'Report an issue', hint: 'Something with the food or table', eta: '', group: 'help', kind: 'issue' },",
    "      { key: 'Other request', label: 'Other request', hint: 'Anything else we can help with', eta: '', group: 'help', kind: 'other' },",
    "    ];",
    "    const mapReason = def => {",
    "      const sending = this.state.callSending === def.key;",
    "      const done = !!this.state.callDone;",
    "      const busy = !!this.state.callSending || done;",
    "      const on = sending;",
    "      const sub = def.eta || def.hint;",
    "      return {",
    "        key: def.key,",
    "        label: def.label,",
    "        hint: sub,",
    "        isOrder: def.kind === 'order',",
    "        isWater: def.kind === 'water',",
    "        isBill: def.kind === 'bill',",
    "        isCutlery: def.kind === 'cutlery',",
    "        isIssue: def.kind === 'issue',",
    "        isOther: def.kind === 'other',",
    "        isSending: sending,",
    "        showIcon: !sending,",
    "        onClick: () => this.requestStaff(def.key),",
    "        style: {",
    "          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',",
    "          gap: '10px', minHeight: 108, cursor: busy && !sending ? 'default' : 'pointer',",
    "          padding: '14px 10px', borderRadius: 18, textAlign: 'center',",
    "          background: on ? accent : '#F7FAF8', color: on ? '#fff' : '#25392F',",
    "          border: on ? '1px solid ' + accent : '1px solid #E1EAE4',",
    "          boxShadow: on ? '0 8px 18px -14px rgba(8,22,16,0.55)' : 'none',",
    "          opacity: busy && !sending ? 0.55 : 1,",
    "          pointerEvents: busy && !sending ? 'none' : 'auto',",
    "          transition: 'background .18s ease, border-color .18s ease, opacity .18s ease, transform .12s ease',",
    "        },",
    "        iconWrap: {",
    "          width: 40, height: 40, borderRadius: 13, flex: 'none',",
    "          display: 'flex', alignItems: 'center', justifyContent: 'center',",
    "          background: on ? 'rgba(255,255,255,0.18)' : '#EEF4F0',",
    "          color: on ? '#fff' : accent,",
    "        },",
    "      };",
    "    };",
    "    const quickRequests = reasonDefs.filter(d => d.group === 'quick').map(mapReason);",
    "    const helpRequests = reasonDefs.filter(d => d.group === 'help').map(mapReason);",
    "    const ready = false;",
  ].join("\n");

  out = out.slice(0, defsStart) + replacement + out.slice(readyAt + readyLine.length);

  // Inject requestStaff on the component class.
  const askMethod = "  ask(q) {";
  if (!out.includes(askMethod)) throw new Error("artifact script has no ask() to hang requestStaff on");
  out = out.replace(
    askMethod,
    [
      "  requestStaff(key) {",
      "    if (this.state.callSending || this.state.callDone) return;",
      "    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}",
      "    clearTimeout(this._callTimer);",
      "    this.setState({ callSending: key, reason: key, callDone: null });",
      "    const doneMap = {",
      "      'Ready to order': 'Ready to order noted',",
      "      'Water refill': 'Water requested',",
      "      'Request bill': 'Bill requested',",
      "      'Extra cutlery': 'Cutlery requested',",
      "      'Report an issue': 'Issue reported',",
      "      'Other request': 'Server notified',",
      "    };",
      "    const finish = (ok) => {",
      "      const doneLabel = ok ? (doneMap[key] || 'Server notified') : 'Could not reach staff, please try again';",
      "      this.setState({ callSending: null, callDone: doneLabel });",
      "      this._callTimer = setTimeout(() => {",
      "        this.setState(s => {",
      "          if (!ok) return { callOpen: false, callDone: null };",
      "          const time = (() => { try { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();",
      "          const entry = { id: String(Date.now()) + '-' + key, key, label: key, time, note: 'staff notified · under 2 min' };",
      "          const calledRequests = [entry].concat(Array.isArray(s.calledRequests) ? s.calledRequests : []);",
      "          return { callOpen: false, callDone: null, called: true, calledReason: key, calledRequests, calledSlide: 0 };",
      "        });",
      "        setTimeout(() => { try { const el = document.getElementById('froq-called-rail'); if (el) el.scrollLeft = 0; } catch (e) {} }, 40);",
      "      }, 1400);",
      "    };",
      "    if (__CTX && __CTX.slug) {",
      "      __post('/api/menu/request', { reason: key, sessionId: __session, table: __CTX.table })",
      "        .then(r => finish(!!(r && r.ok)))",
      "        .catch(() => finish(false));",
      "    } else {",
      "      this._callTimer = setTimeout(() => finish(true), 650);",
      "    }",
      "  }",
      "",
      "  ask(q) {",
    ].join("\n"),
  );

  const openCall = "openCall: () => this.setState({ callOpen: true, reason: '' }),";
  if (!out.includes(openCall)) throw new Error("artifact script has no openCall");
  out = out.replace(
    openCall,
    "openCall: () => this.setState({ callOpen: true, reason: '', callSending: null, callDone: null }),",
  );

  const titles =
    "callTitle: hi ? U.callTitle : 'Call a server',\n" +
    "      callSub: hi ? U.callSub : 'Pick a reason so the right person comes over.',";
  if (!out.includes(titles)) throw new Error("artifact script has no call titles");
  out = out.replace(
    titles,
    [
      "callTitle: 'Need something?',",
      "      callSub: \"We'll notify the right staff member.\",",
      "      quickLabel: 'Quick requests',",
      "      helpLabel: 'Help',",
      "      quickRequests,",
      "      helpRequests,",
      "      callDone: this.state.callDone,",
      "      callDoneLabel: this.state.callDone ? ('✓  ' + this.state.callDone) : '',",
      "      hasCallDone: !!this.state.callDone,",
      "      showCallList: !this.state.callDone,",
    ].join("\n"),
  );

  const callLabel =
    "callLabel: this.state.called ? (hi ? U.notified : 'Server notified') : (hi ? U.callServer : 'Call server'),";
  if (!out.includes(callLabel)) throw new Error("artifact script has no callLabel");
  out = out.replace(callLabel, "callLabel: 'Need something?',");

  out = out.replace(
    "callServerLabel: T('callServerAction'),",
    "callServerLabel: 'Need something?',",
  );

  // Keep the dock on Need something? after notify — toast carries the status.
  const callBtn =
    "background: this.state.called ? '#fff' : '#0C1A14',\n" +
    "        color: this.state.called ? '#22362C' : '#fff',\n" +
    "        border: this.state.called ? '1px solid #DFE8E2' : '1px solid transparent',\n" +
    "        boxShadow: this.state.called ? 'none' : '0 18px 34px -18px rgba(8,22,16,0.75)'";
  if (!out.includes(callBtn)) throw new Error("artifact script has no callBtnStyle toggles");
  out = out.replace(
    callBtn,
    "background: '#0C1A14',\n" +
      "        color: '#fff',\n" +
      "        border: '1px solid transparent',\n" +
      "        boxShadow: '0 18px 34px -18px rgba(8,22,16,0.75)'",
  );
  out = out.replace(
    "callDotStyle: { width: 9, height: 9, borderRadius: 999, background: this.state.called ? '#2FA36B' : '#7DE7AC', animation: 'pulseDot 1.6s ease-in-out infinite' },",
    "callDotStyle: { width: 9, height: 9, borderRadius: 999, background: '#7DE7AC', animation: 'pulseDot 1.6s ease-in-out infinite' },",
  );

  const calledLineNeedle =
    "calledLine: (this.state.calledReason === 'Server called to confirm your order' ? T('confirmToast') : (L && L.reasons[this.state.calledReason] ? L.reasons[this.state.calledReason][0] : this.state.calledReason)) + ' · ' + (hi ? U.under2 : 'usually under 2 min'),";
  if (!out.includes(calledLineNeedle)) throw new Error("artifact script has no calledLine");
  out = out.replace(
    calledLineNeedle,
    [
      "calledRequests: Array.isArray(this.state.calledRequests) ? this.state.calledRequests : [],",
      "      calledCount: Array.isArray(this.state.calledRequests) ? this.state.calledRequests.length : 0,",
      "      calledDots: (() => {",
      "        const list = Array.isArray(this.state.calledRequests) ? this.state.calledRequests : [];",
      "        const slide = Math.max(0, Math.min(this.state.calledSlide || 0, Math.max(0, list.length - 1)));",
      "        return list.map((_, i) => ({",
      "          key: 'd' + i,",
      "          on: i === slide,",
      "          off: i !== slide,",
      "          go: () => {",
      "            this.setState({ calledSlide: i });",
      "            try {",
      "              const el = document.getElementById('froq-called-rail');",
      "              if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });",
      "            } catch (e) {}",
      "          },",
      "        }));",
      "      })(),",
      "      hasCalledDots: Array.isArray(this.state.calledRequests) && this.state.calledRequests.length > 1,",
      "      bindCalledRail: (() => { setTimeout(() => __bindCalledRail(this), 0); return true; })(),",
      "      calledLine: '',",
    ].join("\n"),
  );

  const onWay =
    "onWayLabel: hi ? U.onWay : 'Server on the way',";
  if (!out.includes(onWay)) throw new Error("artifact script has no onWayLabel");
  out = out.replace(
    onWay,
    "onWayLabel: (Array.isArray(this.state.calledRequests) && this.state.calledRequests.length > 1) ? 'Requests sent' : 'Server on the way',",
  );

  out = out.replace(
    "closeFollow: () => this.setState({ closeStage: null, ordered: null, servedIndex: -1, rating: 0, rateTags: [], called: false }),",
    "closeFollow: () => this.setState({ closeStage: null, ordered: null, servedIndex: -1, rating: 0, rateTags: [], called: false, calledReason: '', calledRequests: [], calledSlide: 0 }),",
  );

  // Drop the confirm button bindings — template no longer uses them.
  const confirmCall =
    "confirmCall: () => { if (ready) this.setState(s => ({ callOpen: false, called: true, calledReason: s.reason })); },";
  if (out.includes(confirmCall)) {
    out = out.replace(confirmCall, "confirmCall: () => {},");
  }

  // Return object still spreads the old reasons list — point it at quick requests
  // so leftover bindings stay harmless.
  out = out.replace(
    "      reasons,\n",
    "      reasons: quickRequests,\n",
  );

  out = out.replace(
    "reason: 'Just a question', actionsDone: m.id",
    "reason: 'Other request', actionsDone: m.id",
  );

  // Seed logo from merchant props when the live menu hands one over.
  const initials =
    "initials: brand.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(),";
  if (!out.includes(initials)) throw new Error("artifact script has no initials");
  out = out.replace(
    initials,
    [
      initials,
      "      logoUrl: (typeof this.props.logoUrl === 'string' && this.props.logoUrl) ? this.props.logoUrl : '',",
      "      hasLogo: !!(typeof this.props.logoUrl === 'string' && this.props.logoUrl),",
      "      showInitials: !(typeof this.props.logoUrl === 'string' && this.props.logoUrl),",
      "      hoursLabel: (typeof this.props.hoursLabel === 'string' && this.props.hoursLabel) ? this.props.hoursLabel : '',",
      "      hasHours: !!(typeof this.props.hoursLabel === 'string' && this.props.hoursLabel),",
    ].join("\n"),
  );

  // Topbar shows table (+ hours below) — drop the "Dine-in" service note.
  const tagline =
    "tagline: table + ' · ' + (hi ? U.service : (typeof this.props.serviceNote === 'string' ? this.props.serviceNote : 'Dine-in · Table service')),";
  if (!out.includes(tagline)) throw new Error("artifact script has no tagline");
  out = out.replace(tagline, "tagline: table,");

  return out;
}

/**
 * Rewrites the two "dish photo" boxes so their background comes from the view
 * model. Without a photo the expression yields the artifact's own hatch, so the
 * placeholder still looks exactly as designed.
 */
function bindPhotoSlots(template) {
  // Each box hatches at its own scale. The two 5px ones are replaced in
  // document order: the chat recommendation comes before the cart suggestion.
  const boxes = [
    { scope: "f", hatch: "rgba(12,26,20,0.055) 0 7px, transparent 7px 14px" },
    { scope: "item", hatch: "rgba(12,26,20,0.055) 0 6px, transparent 6px 12px" },
    { scope: "rec", hatch: "rgba(12,26,20,0.055) 0 5px, transparent 5px 10px" },
    { scope: "suggestion", hatch: "rgba(12,26,20,0.055) 0 5px, transparent 5px 10px" },
  ];
  let out = template;
  for (const { scope, hatch } of boxes) {
    const fill = `background-image: repeating-linear-gradient(135deg, ${hatch});`;
    if (!out.includes(fill)) throw new Error(`artifact template has no ${scope} photo box`);
    out = out.replace(
      fill,
      `background-image: {{ ${scope}.photo }}; background-size: cover; background-position: center;`,
    );
  }

  // Only the two dish cards caption their box, and that caption belongs on a
  // box that stayed empty. The smaller thumbnails carry no label.
  const captioned = ["f", "item"];
  let seen = 0;
  out = out.replace(/<span[^>]*>dish photo<\/span>/g, (span) => {
    const scope = captioned[seen++];
    return scope ? `<sc-if value="{{ ${scope}.noPhoto }}">${span}</sc-if>` : span;
  });
  if (seen !== captioned.length) throw new Error("artifact template photo captions moved");
  return out;
}

/**
 * Softer chat bubbles — AI reads as paper, guest as ink, with less chrome.
 * Also retires the "call a server" handoff copy now that Need something? is gone.
 */
function bindAssistantBubbles(script) {
  const row =
    "      rowStyle: { display: 'flex', flexDirection: 'column', alignItems: m.role === 'me' ? 'flex-end' : 'flex-start', gap: 8 },";
  const bubble =
    "      bubbleStyle: {\n" +
    "        maxWidth: '86%', padding: '13px 15px', fontSize: 14, fontWeight: 500, lineHeight: 1.55, textWrap: 'pretty',\n" +
    "        borderRadius: m.role === 'me' ? '18px 18px 6px 18px' : '18px 18px 18px 6px',\n" +
    "        background: m.role === 'me' ? '#0C1A14' : '#fff',\n" +
    "        color: m.role === 'me' ? '#fff' : '#22362C',\n" +
    "        border: m.role === 'me' ? 'none' : '1px solid #E9EFEB',\n" +
    "        boxShadow: m.role === 'me' ? '0 10px 22px -16px rgba(8,22,16,0.9)' : '0 6px 18px -14px rgba(8,22,16,0.5)'\n" +
    "      }";
  if (!script.includes(bubble)) throw new Error("artifact script has no chat bubbleStyle");
  let out = script;

  const fallback =
    'fallback: { EN: "I can\'t answer that one on my own — should I call a server over to help?", HI: \'यह मैं खुद नहीं बता सकता — क्या मैं किसी सर्वर को बुला दूँ?\', MR: \'हे मला स्वतः सांगता येत नाही — मी सर्व्हरला बोलावू का?\', BN: \'এটি আমি নিজে বলতে পারছি না — একজন সার্ভারকে ডাকব?\', TA: \'இதற்கு என்னால் பதில் சொல்ல முடியவில்லை — சர்வரை அழைக்கவா?\' },';
  if (!out.includes(fallback)) throw new Error("artifact script has no fallback locale block");
  out = out.replace(
    fallback,
    "fallback: { EN: \"I can't answer that from this menu. Please ask someone on the floor to confirm.\", HI: 'यह मैं मेन्यू से नहीं बता सकता। कृपया फ़्लोर पर किसी से पूछ लें।', MR: 'हे मी मेनूमधून सांगू शकत नाही. कृपया फ्लोअरवरील कोणाला तरी विचारा.', BN: 'এটি আমি মেনু থেকে বলতে পারছি না। দয়া করে ফ্লোরে কাউকে জিজ্ঞাসা করুন।', TA: 'இதை இந்த மெனுவில் இருந்து சொல்ல முடியாது. தயவுசெய்து ஃப்ளோரில் உள்ள ஒருவரிடம் கேளுங்கள்.' },",
  );

  const fallbackAck =
    "fallbackAck: { EN: 'No problem — ask me anything else about the menu.', HI: 'ठीक है — मेन्यू के बारे में कुछ और पूछिए।', MR: 'ठीक आहे — मेनूबद्दल दुसरे काही विचारा.', BN: 'ঠিক আছে — মেনু নিয়ে অন্য কিছু জিজ্ঞাসা করুন।', TA: 'சரி — மெனுவைப் பற்றி வேறு எதையும் கேளுங்கள்.' },";
  if (!out.includes(fallbackAck)) throw new Error("artifact script has no fallbackAck locale block");
  out = out.replace(
    fallbackAck,
    "fallbackAck: { EN: 'No problem. Ask me anything else about the menu.', HI: 'ठीक है। मेन्यू के बारे में कुछ और पूछिए।', MR: 'ठीक आहे. मेनूबद्दल दुसरे काही विचारा.', BN: 'ঠিক আছে। মেনু নিয়ে অন্য কিছু জিজ্ঞাসা করুন।', TA: 'சரி. மெனுவைப் பற்றி வேறு எதையும் கேளுங்கள்.' },",
  );
  if (out.includes(row)) {
    out = out.replace(
      row,
      "      rowStyle: { display: 'flex', flexDirection: 'column', alignItems: m.role === 'me' ? 'flex-end' : 'flex-start', gap: 8, width: '100%' },",
    );
  }

  // Starter keyword chips live in chat until the guest sends their first message.
  const chipProps = "chips, followups, tabs, cats, messages,";
  if (!out.includes(chipProps)) throw new Error("artifact script has no chips/followups render props");
  out = out.replace(
    chipProps,
    [
      "chips, followups, tabs, cats, messages,",
      "      showStarterChips: !(this.state.messages || []).some(m => m.role === 'me'),",
      "      showFollowupChips: (this.state.messages || []).some(m => m.role === 'me'),",
    ].join("\n"),
  );

  return out.replace(
    bubble,
    [
      "      bubbleStyle: {",
      "        maxWidth: m.role === 'me' ? '82%' : '90%',",
      "        padding: m.role === 'me' ? '12px 15px' : '13px 16px',",
      "        fontSize: 14.5,",
      "        fontWeight: 500,",
      "        lineHeight: 1.5,",
      "        letterSpacing: '-0.1px',",
      "        textWrap: 'pretty',",
      "        borderRadius: m.role === 'me' ? '20px 20px 6px 20px' : '20px 20px 20px 6px',",
      "        background: m.role === 'me' ? '#0C1A14' : '#FFFFFF',",
      "        color: m.role === 'me' ? '#fff' : '#1A2C24',",
      "        border: m.role === 'me' ? 'none' : '1px solid rgba(12,26,20,0.06)',",
      "        boxShadow: m.role === 'me' ? '0 12px 24px -18px rgba(8,22,16,0.85)' : '0 8px 20px -18px rgba(8,22,16,0.45)'",
      "      }",
    ].join("\n"),
  );
}

/**
 * Feeds the merchant logo and opening hours into the header.
 *
 * The template already binds these, and the route already sends them as props,
 * but the only code seeding them into the view model lives in
 * bindNeedSomethingFlow, which the pipeline never calls — so the header fell
 * back to initials with no hours. Kept separate from that function so the
 * header does not depend on the unshipped staff-call sheet.
 */
function bindBrandHeader(script) {
  const initials =
    "initials: brand.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(),";
  if (!script.includes(initials)) throw new Error("artifact script has no initials to seed the logo beside");
  const prop = (name) => `(typeof this.props.${name} === 'string' && this.props.${name}) ? this.props.${name} : ''`;
  return script.replace(
    initials,
    [
      initials,
      `      logoUrl: ${prop("logoUrl")},`,
      "      hasLogo: !!(typeof this.props.logoUrl === 'string' && this.props.logoUrl),",
      "      showInitials: !(typeof this.props.logoUrl === 'string' && this.props.logoUrl),",
      `      hoursLabel: ${prop("hoursLabel")},`,
      "      hasHours: !!(typeof this.props.hoursLabel === 'string' && this.props.hoursLabel),",
    ].join("\n"),
  );
}

/**
 * Counts the visit.
 *
 * Deliberately its own transform rather than a line inside bindLiveKitchenWait:
 * that function patches the same method but is never called from the pipeline,
 * so anything added there is silently dropped from the build.
 */
function bindMenuOpenedEvent(script) {
  const didMount = "  componentDidMount() {\n    this._tip = setTimeout(() => {";
  if (!script.includes(didMount)) {
    throw new Error("artifact script has no componentDidMount to count the visit in");
  }
  return script.replace(
    didMount,
    [
      "  componentDidMount() {",
      "    __track('menu_opened', { lang: __chatLang(this) });",
      "    this._tip = setTimeout(() => {",
    ].join("\n"),
  );
}

/**
 * Coaching tips (language, ask-AI, "tap again to add") only fire once per
 * browser — not on every reload or every third Add tap.
 */
function bindOnceTips(script) {
  let out = script;

  const addTip =
    "this.setState(s => ({ cart: s.cart.concat([name]), qtyTip: (s.qtyTipCount || 0) < 3 ? name : null, qtyTipCount: (s.qtyTipCount || 0) + 1 }));";
  if (!out.includes(addTip)) throw new Error("artifact script has no qty tip add()");
  out = out.replace(
    addTip,
    [
      "const __qtySeen = (() => { try { return localStorage.getItem('froq-menu-tip-qty') === '1'; } catch (e) { return false; } })();",
      // Every route into the cart lands here, including the AI panel's add
      // button, so this is the one place cart adds need counting.
      "    __track('cart_add', { itemName: name, lang: __chatLang(this) });",
      "    this.setState(s => {",
      "      const show = !__qtySeen && !s.qtyTipSeen;",
      "      if (show) { try { localStorage.setItem('froq-menu-tip-qty', '1'); } catch (e) {} }",
      "      return { cart: s.cart.concat([name]), qtyTip: show ? name : null, qtyTipSeen: true };",
      "    });",
    ].join("\n"),
  );

  const langTip = "this.setState({ langTip: true });";
  if (!out.includes(langTip)) throw new Error("artifact script has no lang tip");
  out = out.replace(
    langTip,
    [
      "if (!(() => { try { return localStorage.getItem('froq-menu-tip-lang') === '1'; } catch (e) { return false; } })()) {",
      "      try { localStorage.setItem('froq-menu-tip-lang', '1'); } catch (e) {}",
      "      this.setState({ langTip: true });",
      "    }",
    ].join("\n"),
  );

  const askTip = "this.setState(s => (s.langTip ? { langTip: false, askTip: true } : {})), 9000);";
  if (out.includes(askTip)) {
    out = out.replace(
      askTip,
      [
        "this.setState(s => {",
        "        if (!s.langTip) return {};",
        "        const askSeen = (() => { try { return localStorage.getItem('froq-menu-tip-ask') === '1'; } catch (e) { return false; } })();",
        "        if (!askSeen) { try { localStorage.setItem('froq-menu-tip-ask', '1'); } catch (e) {} }",
        "        return { langTip: false, askTip: !askSeen };",
        "      }), 9000);",
      ].join("\n"),
    );
  }

  return out;
}

/**
 * Top-bar kitchen wait: poll live floor pulse so "~15 min" tracks the kitchen
 * instead of a static catalogue prep time baked into the page.
 */
function bindLiveKitchenWait(script) {
  let out = script;

  const waitTime =
    "waitTime: '~' + (this.props.kitchenWait ?? 18) + ' ' + (TXT.mins[lang] || TXT.mins.EN),";
  if (!out.includes(waitTime)) throw new Error("artifact script has no waitTime binding");
  out = out.replace(
    waitTime,
    "waitTime: '~' + (this.state.liveWait ?? this.props.kitchenWait ?? 18) + ' ' + (TXT.mins[lang] || TXT.mins.EN),",
  );

  const staffCount = "staffCount: String(this.props.staffOnFloor ?? 6),";
  if (out.includes(staffCount)) {
    out = out.replace(
      staffCount,
      "staffCount: String(this.state.liveStaff ?? this.props.staffOnFloor ?? 6),",
    );
  }

  const sentEta = "sentEta').replace('{n}', (this.props.kitchenWait ?? 18)),";
  if (out.includes(sentEta)) {
    out = out.replace(
      sentEta,
      "sentEta').replace('{n}', (this.state.liveWait ?? this.props.kitchenWait ?? 18)),",
    );
  }

  const didMount =
    "  componentDidMount() {\n    if (__CTX && this.state.session === true) {\n      __resumeVisit(() => this.setState({ session: false }));\n    }\n    this._tip = setTimeout(() => {";
  if (!out.includes(didMount)) throw new Error("artifact script has no patched componentDidMount for wait poll");
  out = out.replace(
    didMount,
    [
      "  componentDidMount() {",
      "    if (__CTX && this.state.session === true) {",
      "      __resumeVisit(() => this.setState({ session: false }));",
      "    }",
      "    if (__CTX && __CTX.slug) {",
      "      const pullWait = () => {",
      "        const q = new URLSearchParams({ slug: __CTX.slug });",
      "        if (__CTX.branch) q.set('b', __CTX.branch);",
      "        fetch('/api/menu/wait?' + q.toString())",
      "          .then(r => r.json())",
      "          .then(data => {",
      "            if (!data || !data.ok) return;",
      "            const next = {};",
      "            if (Number.isFinite(data.kitchenWait)) next.liveWait = data.kitchenWait;",
      "            if (Number.isFinite(data.staffOnFloor)) next.liveStaff = data.staffOnFloor;",
      "            if (Object.keys(next).length) this.setState(next);",
      "          })",
      "          .catch(() => {});",
      "      };",
      "      pullWait();",
      "      clearInterval(this._waitTick);",
      "      this._waitTick = setInterval(pullWait, 30000);",
      "    }",
      "    this._tip = setTimeout(() => {",
    ].join("\n"),
  );

  return out;
}

/**
 * Cart tip used to be a fixed demo line. Live tips are built in
 * `bindCartTaxBreakdown` now — keep this hook so call sites stay stable.
 */
function dropCartNote(script) {
  return script;
}

/**
 * Cart totals: item subtotal + CGST 2.5% + SGST 2.5% + service charge 5%.
 * Shown as an estimate — kitchen/POS figures can differ.
 */
function bindCartTaxBreakdown(script) {
  let out = script;

  const totalLabel = "totalLabel: hi ? U.total : 'Total · tax included',";
  if (!out.includes(totalLabel)) throw new Error("artifact script has no totalLabel");
  out = out.replace(totalLabel, "totalLabel: hi ? U.total : 'Total',");

  const footerNote =
    "footerNote: hi ? U.footer : 'Prices include tax · Ask the assistant about any allergen',";
  if (!out.includes(footerNote)) throw new Error("artifact script has no footerNote");
  out = out.replace(footerNote, "footerNote: '',");

  const orderTotal =
    "orderTotal: this.money(this.state.cart.reduce((a, n) => a + (PRICES[n] || 0), 0)),";
  if (!out.includes(orderTotal)) throw new Error("artifact script has no orderTotal");
  out = out.replace(
    orderTotal,
    [
      "...(() => {",
      "        const sub = this.state.cart.reduce((a, n) => a + (PRICES[n] || 0), 0);",
      // Each line rounds on its own and the total sums the rounded lines, so the
      // rows a guest adds up always reach the figure they are asked to pay.
      "        const cgst = Math.round(sub * __TAX.cgst / 100);",
      "        const sgst = Math.round(sub * __TAX.sgst / 100);",
      "        const service = Math.round(sub * __TAX.service / 100);",
      "        return {",
      "          cartSubtotal: this.money(sub),",
      "          cartCgst: this.money(cgst),",
      "          cartSgst: this.money(sgst),",
      "          cartService: this.money(service),",
      "          showCgst: __TAX.cgst > 0,",
      "          showSgst: __TAX.sgst > 0,",
      "          showService: __TAX.service > 0,",
      "          orderTotal: this.money(sub + cgst + sgst + service),",
      "        };",
      "      })(),",
    ].join("\n"),
  );

  // Richer cart AI insights — kitchen, serves, heat, diet + a short tip.
  // Match either the original kcal row or the stripped two-chip form.
  const insightsBlock =
    "insights: (() => {\n" +
    "        const c = this.state.cart;\n" +
    "        const prep = c.length ? Math.max.apply(null, c.map(x => MINS[x] || 10)) + Math.round(c.length * 1.5) : 0;\n" +
    "        const kcal = c.reduce((a, x) => a + (KCAL[x] || 0), 0);\n" +
    "        const serves = Math.max(1, Math.round(c.length / 1.6));\n" +
    "        const w = k => TXT[k][lang] || TXT[k].EN;\n" +
    "        return [\n" +
    "          { isPrep: true, short: w('prepShort'), value: '~' + prep + ' ' + w('mins') },\n" +
    "          ...(kcal > 0 ? [{ isKcal: true, short: w('kcalShort'), value: '~' + Math.round(kcal / 10) * 10 + ' kcal' }] : []),\n" +
    "          { isServes: true, short: w('servesShort'), value: serves + ' ' + (serves === 1 ? w('person') : w('people')) }\n" +
    "        ];\n" +
    "      })(),";
  const insightsStripped =
    "insights: (() => {\n" +
    "        const c = this.state.cart;\n" +
    "        const prep = c.length ? Math.max.apply(null, c.map(x => MINS[x] || 10)) + Math.round(c.length * 1.5) : 0;\n" +
    "        const kcal = c.reduce((a, x) => a + (KCAL[x] || 0), 0);\n" +
    "        const serves = Math.max(1, Math.round(c.length / 1.6));\n" +
    "        const w = k => TXT[k][lang] || TXT[k].EN;\n" +
    "        return [\n" +
    "          { isPrep: true, short: w('prepShort'), value: '~' + prep + ' ' + w('mins') },\n" +
    "          \n" +
    "          { isServes: true, short: w('servesShort'), value: serves + ' ' + (serves === 1 ? w('person') : w('people')) }\n" +
    "        ];\n" +
    "      })(),";
  // The panel used to restate the cart back at the guest: how many minutes, how
  // many people, how hot, veg or not. All four are things they chose, so none of
  // them was worth reading. It now carries what the assistant makes of the
  // order — see src/lib/menu/cart-insights.ts for what it is allowed to say.
  const insightsRich = [
    "insights: (this.state.cartAi || []).map(row => {",
    "        const dish = (row && row.dish) ? String(row.dish) : '';",
    "        const added = !!dish && this.state.recAdded === dish;",
    "        const kind = (row && row.kind) || 'balance';",
    "        const price = (row && row.price != null) ? this.money(row.price) : '';",
    "        return {",
    "          title: (row && row.title) || '',",
    "          body: (row && row.body) || '',",
    "          isOffer: kind === 'offer',",
    "          isHeat: kind === 'heat',",
    "          isLoyalty: kind === 'loyalty',",
    "          isPairing: kind === 'pairing',",
    "          isTip: ['offer', 'heat', 'loyalty', 'pairing'].indexOf(kind) < 0,",
    "          hasDish: !!dish,",
    "          justAdded: added,",
    "          notAdded: !added,",
    "          addLabel: added ? __addedWord(__chatLang(this)) : (F('aiAdd') + ' ' + dish),",
    "          addPrice: added ? '' : price,",
    "          addStyle: __addStyle(added, { marginTop: 7, alignSelf: 'flex-start', maxWidth: '100%' }),",
    "          onAdd: () => this.addRec(dish)",
    "        };",
    "      }),",
    "      aiLoading: !!this.state.cartAiLoading,",
    "      // Nothing to say is a valid outcome: an order the kitchen would not",
    "      // change earns silence rather than a filler line.",
    "      hasInsights: !!this.state.cartAiLoading || (this.state.cartAi || []).length > 0,",
    "      insightsThinking: F('aiThinking'),",
  ].join("\n");

  if (out.includes(insightsBlock)) {
    out = out.replace(insightsBlock, insightsRich);
  } else if (out.includes(insightsStripped)) {
    out = out.replace(insightsStripped, insightsRich);
  } else {
    // Fallback: replace from insights IIFE through insightNote line.
    const start = out.indexOf("insights: (() => {");
    const noteAt = out.indexOf("insightNote:", start);
    if (start === -1 || noteAt === -1) {
      throw new Error("artifact script has no cart insights IIFE");
    }
    const noteEnd = out.indexOf("\n", noteAt);
    out = out.slice(0, start) + insightsRich + out.slice(noteEnd + 1);
  }

  // Never surface the cart upsell card.
  const hasSuggestion = "hasSuggestion: !!this.suggest(),";
  if (out.includes(hasSuggestion)) {
    out = out.replace(hasSuggestion, "hasSuggestion: false,");
  }

  // The artifact set insightNote a second time, later in the same object, so
  // this static sentence quietly won over everything computed above it and
  // every guest read the same line. Nothing binds insightNote now.
  const deadNote = "insightNote: TXT.note[lang] || TXT.note.EN,";
  if (out.includes(deadNote)) out = out.replace(deadNote, "");

  // Opening the cart is what asks for a reading of it.
  const openOrder = "openOrder: () => this.setState({ orderOpen: true }),";
  if (!out.includes(openOrder)) throw new Error("artifact script has no openOrder handler");
  out = out.replace(
    openOrder,
    "openOrder: () => { this.setState({ orderOpen: true }); this.loadCartAi(); },",
  );

  return out;
}

/**
 * Cleaner cart sheet: quiet line items, AI insights panel, tax estimate,
 * no server-confirm CTA / upsell card.
 */
function useCartTaxBreakdown(template) {
  let out = template;

  // Line items — hairline separators, less vertical noise.
  const linesWrap =
    '<div style="display: flex; flex-direction: column; gap: 4px; padding: 18px 0 4px;">\n' +
    '          <sc-for list="{{ orderLines }}" as="line" hint-placeholder-count="2">\n' +
    '            <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0;">';
  if (!out.includes(linesWrap)) throw new Error("artifact template has no cart line list");
  out = out.replace(
    linesWrap,
    '<div style="display: flex; flex-direction: column; padding: 8px 0 2px;">\n' +
      '          <sc-for list="{{ orderLines }}" as="line" hint-placeholder-count="2">\n' +
      '            <div style="display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid #F0F4F1;">',
  );

  // AI Insights: labelled panel with tiles + a short cart tip.
  const insightsOpen =
    '<div style="margin: 14px 0 2px; display: flex; flex-direction: column; gap: 9px;">\n' +
    '            <div style="display: flex; align-items: center; gap: 7px;">';
  const insightsAt = out.indexOf(insightsOpen);
  if (insightsAt === -1) throw new Error("artifact template has no cart insights block");
  // Original block ends with an outer </div> before </sc-if>. Our replacement
  // already closes itself — skip that leftover </div> or the sheet body closes early
  // and the tax rows float outside the white card.
  const insightsTail =
    '</div>\n        </sc-if>\n        <sc-if value="{{ hasSuggestion }}"';
  const insightsEnd = out.indexOf(insightsTail, insightsAt);
  if (insightsEnd === -1) throw new Error("artifact template cart insights end moved");
  // One row per insight: a mark, a headline, the reasoning, and where the
  // advice is "add this", the dish itself with its price so the guest never has
  // to go back and hunt for it. The whole panel hides when there is nothing
  // worth saying — an empty state beats a filler line.
  const insightIcon = (flag, path, filled) =>
    [
      `<sc-if value="{{ ins.${flag} }}" hint-placeholder-val="{{ false }}">`,
      `<svg width="14" height="14" sc-camel-view-box="0 0 24 24" ${
        filled
          ? 'fill="{{ accent }}"'
          : 'fill="none" stroke="{{ accent }}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"'
      } style="display:block;">${path}</svg>`,
      "</sc-if>",
    ].join("");

  // Grey bars promise rows that may never come — the model is allowed to find
  // nothing worth saying. Three dots say "reading" without shaping the answer,
  // and they reuse the chat typing indicator so it is the same gesture twice.
  const thinkingDot = (delay) =>
    '<span style="width: 6px; height: 6px; border-radius: 999px; background: {{ accent }};' +
    ` animation: typingDot 1.1s ease-in-out ${delay} infinite;"></span>`;

  const thinkingRow = [
    '<div style="display: flex; align-items: center; gap: 10px; padding: 2px 0 4px;">',
    '<span style="display: inline-flex; align-items: center; gap: 5px; flex: none;">',
    thinkingDot("0s"),
    thinkingDot(".15s"),
    thinkingDot(".3s"),
    "</span>",
    '<span style="font-size: 12.5px; font-weight: 600; color: #7C8F84; letter-spacing: -0.1px;">{{ insightsThinking }}</span>',
    "</div>",
  ].join("");

  const insightsClean = [
    '<sc-if value="{{ hasInsights }}" hint-placeholder-val="{{ true }}">',
    // 18px clear of the hairline above and the tax rule below, matching the
    // 18px the breakdown already keeps off its own border.
    '<div style="margin: 18px 0; padding: 13px 14px 14px; border-radius: 18px; background: linear-gradient(180deg, {{ accentSoft }} 0%, #F8FBF9 78%); border: 1px solid #E5ECE7; display: flex; flex-direction: column; gap: 12px;">',

    // Header.
    '<div style="display: flex; align-items: center; gap: 8px;">',
    '<div style="width: 22px; height: 22px; border-radius: 8px; background: {{ accent }}; display: flex; align-items: center; justify-content: center; flex: none;">',
    '<svg width="12" height="12" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" style="display:block;"><path d="M12 3l1.4 4.2L18 9l-4.2 1.4L12 15l-1.4-4.6L6 9l4.6-1.8L12 3z"></path><path d="M18.5 14.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z"></path></svg>',
    "</div>",
    '<span style="font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: {{ accent }};">{{ insightsLabel }}</span>',
    "</div>",

    // Reading state. It sits where the rows will land so the panel settles in
    // place instead of growing a second indicator in the header.
    '<sc-if value="{{ aiLoading }}" hint-placeholder-val="{{ false }}">',
    thinkingRow,
    "</sc-if>",

    // The insights themselves.
    '<sc-for list="{{ insights }}" as="ins" hint-placeholder-count="2">',
    '<div style="display: flex; align-items: flex-start; gap: 10px; animation: froqInsightIn .34s ease both;">',
    '<div style="width: 26px; height: 26px; border-radius: 9px; flex: none; background: rgba(255,255,255,0.9); border: 1px solid rgba(12,26,20,0.07); display: flex; align-items: center; justify-content: center; margin-top: 1px;">',
    insightIcon(
      "isOffer",
      '<path d="M20.5 13.3 13.3 20.5a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12V4.5A1.5 1.5 0 0 1 4.5 3H12a2 2 0 0 1 1.4.6l7.1 7.1a2 2 0 0 1 0 2.6z"></path><circle cx="7.8" cy="7.8" r="1.4"></circle>',
    ),
    insightIcon(
      "isHeat",
      '<path d="M12 2.2c-.7 2.6-2.3 3.9-3.7 5.6A7.9 7.9 0 0 0 6.3 13a5.7 5.7 0 0 0 11.4 0c0-2.3-1.1-4-2.3-5.5-1.2-1.5-2.7-2.8-3.4-5.3z"></path>',
      true,
    ),
    insightIcon(
      "isLoyalty",
      '<path d="m12 3.4 2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.6l5.9-.9L12 3.4z"></path>',
    ),
    insightIcon(
      "isPairing",
      '<path d="M6 3v7a4 4 0 0 0 4 4v7"></path><path d="M14 3v7"></path><path d="M18 3v7a4 4 0 0 1-4 4"></path>',
    ),
    insightIcon(
      "isTip",
      '<path d="M9 18h6"></path><path d="M10 21.5h4"></path><path d="M12 2.5a6 6 0 0 0-3.5 10.9c.6.5.9 1 1 1.6h5c.1-.7.4-1.1 1-1.6A6 6 0 0 0 12 2.5z"></path>',
    ),
    "</div>",
    '<div style="min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px;">',
    '<span style="font-size: 13px; font-weight: 800; color: #0C1A14; letter-spacing: -0.15px; line-height: 1.3;">{{ ins.title }}</span>',
    '<span style="font-size: 12.5px; font-weight: 500; color: #46594E; line-height: 1.45; text-wrap: pretty;">{{ ins.body }}</span>',
    // The action. Advice you cannot act on is just a remark.
    '<sc-if value="{{ ins.hasDish }}" hint-placeholder-val="{{ true }}">',
    // Style has to arrive as one bound object: a literal style="" alongside it
    // wins, which is what left this button as unstyled serif text.
    '<div sc-camel-on-click="{{ ins.onAdd }}" style="{{ ins.addStyle }}" style-hover="filter: brightness(1.35);">',
    '<sc-if value="{{ ins.notAdded }}" hint-placeholder-val="{{ true }}">',
    '<svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" style="display:block;flex:none;"><path d="M12 5.5v13M5.5 12h13"></path></svg>',
    "</sc-if>",
    '<sc-if value="{{ ins.justAdded }}" hint-placeholder-val="{{ false }}">',
    '<svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none;"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>',
    "</sc-if>",
    '<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ ins.addLabel }}</span>',
    '<sc-if value="{{ ins.addPrice }}">',
    '<span style="opacity: 0.72; font-weight: 650;">{{ ins.addPrice }}</span>',
    "</sc-if>",
    "</div>",
    "</sc-if>",
    "</div>",
    "</div>",
    "</sc-for>",

    "</div>",
    "</sc-if>",
  ].join("");
  out =
    out.slice(0, insightsAt) +
    insightsClean +
    out.slice(insightsEnd + "</div>\n".length);

  // Drop the "you might also like" upsell card — cart stays one job: review.
  const suggestionStart = out.indexOf('<sc-if value="{{ hasSuggestion }}" hint-placeholder-val="{{ false }}">');
  if (suggestionStart === -1) throw new Error("artifact template has no cart suggestion");
  let depth = 0;
  let i = suggestionStart;
  let suggestionEnd = -1;
  while (i < out.length) {
    if (out.startsWith("<sc-if", i)) {
      depth += 1;
      i = out.indexOf(">", i) + 1;
      continue;
    }
    if (out.startsWith("</sc-if>", i)) {
      depth -= 1;
      i += "</sc-if>".length;
      if (depth === 0) {
        suggestionEnd = i;
        break;
      }
      continue;
    }
    i += 1;
  }
  if (suggestionEnd === -1) throw new Error("artifact template cart suggestion unclosed");
  out = out.slice(0, suggestionStart) + out.slice(suggestionEnd);

  const row =
    '<div style="display: flex; align-items: baseline; justify-content: space-between; padding: 16px 0 2px; border-top: 1px solid #EDF1EE;">\n' +
    '          <span style="font-size: 13px; font-weight: 600; color: #6E8177;">{{ totalLabel }}</span>\n' +
    '          <span style="font-size: 20px; font-weight: 800; color: #0C1A14; letter-spacing: -0.4px;">{{ orderTotal }}</span>\n' +
    "        </div>";
  if (!out.includes(row)) throw new Error("artifact template has no cart total row");

  const line = (label, value, opts = {}) => {
    // The total reads as a single figure, so its label carries the same type as
    // the amount instead of the muted style the tax rows above it use.
    const strong = "font-size: 20px; font-weight: 800; color: #0C1A14; letter-spacing: -0.25px;";
    const labelStyle = opts.bold ? strong : "font-size: 13px; font-weight: 500; color: #7A8C83;";
    const valueStyle = opts.bold
      ? strong
      : "font-size: 13.5px; font-weight: 650; color: #0C1A14; letter-spacing: -0.25px;";
    const pad = opts.bold ? "10px 0 0" : "0";
    return [
      `<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: ${pad};">`,
      `<span style="${labelStyle}">${label}</span>`,
      `<span style="${valueStyle}">{{ ${value} }}</span>`,
      "</div>",
    ].join("");
  };

  // A rate the merchant set to 0 leaves no row at all: "Service charge ₹0" reads
  // as a charge the guest has to check rather than one that does not exist.
  const optionalLine = (label, value, flag) =>
    `<sc-if value="{{ ${flag} }}" hint-placeholder-val="{{ true }}">` +
    line(label, value) +
    "</sc-if>";

  const breakdown = [
    '<div style="padding: 18px 0 18px; border-top: 1px solid #EDF1EE; display: flex; flex-direction: column; gap: 9px;">',
    line("{{ cartSubtotalLabel }}", "cartSubtotal"),
    optionalLine("{{ cartCgstLabel }}", "cartCgst", "showCgst"),
    optionalLine("{{ cartSgstLabel }}", "cartSgst", "showSgst"),
    optionalLine("{{ cartServiceLabel }}", "cartService", "showService"),
    '<div style="height: 1px; background: #EDF1EE; margin: 2px 0;"></div>',
    line("{{ totalLabel }}", "orderTotal", { bold: true }),
    '<div style="font-size: 11.5px; font-weight: 500; color: #9AABA2; line-height: 1.4; margin-top: 2px;">{{ cartEstimateNote }}</div>',
    "</div>",
  ].join("");
  out = out.replace(row, breakdown);

  // Drop the server-confirm CTA and its helper copy from the cart sheet.
  const send =
    '<div sc-camel-on-click="{{ sendOrder }}" style="margin-top: 18px; height: 56px; border-radius: 18px; background: #0C1A14; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15.5px; font-weight: 700; letter-spacing: -0.2px; cursor: pointer;">{{ sendLabel }}</div>\n' +
    '        <div style="text-align: center; font-size: 12px; font-weight: 500; color: #96A79D; padding-top: 12px;">{{ orderNote }}</div>';
  if (!out.includes(send)) throw new Error("artifact template has no cart send / confirm note");
  out = out.replace(send, "");

  // The rows all arrive at once when the model answers. A short rise reads as
  // the panel filling in rather than the sheet jumping under the guest's thumb.
  if (!out.includes("@keyframes froqInsightIn")) {
    const anchor = "@keyframes fadeIn";
    const at = out.indexOf(anchor);
    if (at === -1) throw new Error("artifact template has no fadeIn keyframes to anchor on");
    out =
      out.slice(0, at) +
      "@keyframes froqInsightIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }\n  " +
      out.slice(at);
  }

  // Filter kcal insight cards out in markup via script — keep only prep + serves.
  return out;
}

/**
 * The status bar counts staff against a fixed plural label, which reads as
 * "1 servers on the floor" at the small venues this is aimed at. Only English
 * inflects here; the other translations are already count-neutral.
 */
function pluraliseStaffLabel(script) {
  const label = "      staffLabel: TXT.staff[lang] || TXT.staff.EN,";
  if (!script.includes(label)) throw new Error("artifact script has no staff label");
  return script.replace(
    label,
    [
      "      staffLabel: (lang === 'EN' && Number(this.state.liveStaff ?? this.props.staffOnFloor ?? 6) === 1)",
      "        ? 'server on the floor'",
      "        : (TXT.staff[lang] || TXT.staff.EN),",
    ].join("\n"),
  );
}

/**
 * The featured cards carry an order-volume line ("12 ordered in past 3 hours").
 * The artifact falls back to a made-up count, so the line only renders once a
 * real tally is passed in via SIGNAL.
 */
/** Tip row is gated inside the AI insights panel (`useCartTaxBreakdown`). */
function guardCartNote(template) {
  if (template.includes('<sc-if value="{{ insightNote }}">')) return template;
  const note = template.indexOf("{{ insightNote }}");
  if (note === -1) throw new Error("artifact template has no cart insight note");
  const rowOpen = template.lastIndexOf("<div style=", note);
  const rowEnd = template.indexOf("</div>", note) + "</div>".length;
  if (rowOpen === -1 || rowOpen > note) throw new Error("artifact template cart note row moved");
  return (
    template.slice(0, rowOpen) +
    `<sc-if value="{{ insightNote }}">${template.slice(rowOpen, rowEnd)}</sc-if>` +
    template.slice(rowEnd)
  );
}

function guardFeaturedSignal(template) {
  const signal = template.indexOf("{{ f.signal }}");
  if (signal === -1) throw new Error("artifact template has no featured signal line");
  const rowOpen = template.lastIndexOf("<div style=", signal);
  const rowEnd = template.indexOf("</div>", signal) + "</div>".length;
  const row = template.slice(rowOpen, rowEnd);
  return (
    template.slice(0, rowOpen) +
    `<sc-if value="{{ f.signal }}">${row}</sc-if>` +
    template.slice(rowEnd)
  );
}

/**
 * Recommendation cards in chat used a flat "Veg · ~10 min" line. Expand each
 * rec with cook time, heat, a short ingredients clause and calories (when we
 * have them), and attach insight / allergen / quick-action rows for the reply.
 */
function bindRichRecCards(script) {
  // Quick replies need to know which message is the newest one.
  const messageMap = "this.state.messages.map(m => ({";
  if (!script.includes(messageMap)) throw new Error("artifact script has no chat message map");
  const withIndex = script.replace(messageMap, "this.state.messages.map((m, __mi, __all) => ({");

  const recs =
    "recs: (m.recs || []).map(r => ({ photo: __photoBg(r[0]), noPhoto: !__photoUrl(r[0]), name: dish(r[0]) ? dish(r[0])[0] : r[0], why: dish(r[0]) ? dish(r[0])[2] : r[1], onAdd: () => this.add(r[0]) })),";
  if (!withIndex.includes(recs)) throw new Error("artifact script has no chat rec mapping");
  let out = withIndex.replace(
    recs,
    [
      // Quick replies answer the question the guest is looking at, so they are
      // offered on the newest reply only — older ones would send a stray "Yes".
      "...__chatExtras(m.recs, q => this.ask(q), __mi === __all.length - 1 ? (m.marked || m.text) : '', __chatLang(this), m.offers),",
      "      recs: (m.recs || []).map((r, i) => Object.assign({",
      "        photo: __photoBg(r[0]), noPhoto: !__photoUrl(r[0]),",
      "        name: dish(r[0]) ? dish(r[0])[0] : r[0],",
      "        rank: String(i + 1),",
      "        showAdd: __ORDERING,",
      "        justAdded: this.state.recAdded === r[0],",
      "        notAdded: this.state.recAdded !== r[0],",
      "        addLabel: this.state.recAdded === r[0] ? __addedWord(__chatLang(this)) : (hi ? U.add : 'Add'),",
      "        addStyle: __addStyle(this.state.recAdded === r[0]),",
      "        onAdd: () => this.addRec(r[0]),",
      "        onAsk: () => this.ask('Tell me about the ' + String(r[0]).toLowerCase()),",
      "      }, __recMeta(r[0], r[1]))),",
    ].join("\n"),
  );
  // hasRecs stays; extras spread alongside. Drop the old lone hasRecs if we
  // duplicated — the original line remains above the spread.

  // Adding from chat used to be silent, because the cart badge that confirms it
  // sits behind the chat sheet. The button reports the add itself instead.
  const askMethod = "  ask(q) {";
  if (!out.includes(askMethod)) throw new Error("artifact script has no ask() to hang addRec on");
  out = out.replace(
    askMethod,
    [
      "  addRec(name) {",
      "    this.add(name);",
      "    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}",
      "    clearTimeout(this._recAdded);",
      "    this.setState({ recAdded: name });",
      "    this._recAdded = setTimeout(() => this.setState({ recAdded: null }), 1800);",
      "  }",
      "",
      "  // Reads the cart once each time the sheet opens on something new. Adding a",
      "  // dish from inside the panel deliberately does not re-ask: the guest gets",
      "  // their confirmation from the button, and a second opinion on the order",
      "  // they just took advice on would be both costly and slightly insulting.",
      "  loadCartAi() {",
      "    const cart = this.state.cart || [];",
      "    const lang = __chatLang(this);",
      "    if (!cart.length) { this.setState({ cartAi: [], cartAiSig: '', cartAiLoading: false }); return; }",
      "    const sig = __cartSignature(cart, lang);",
      "    if (sig === this.state.cartAiSig) return;",
      "    this.setState({ cartAiSig: sig, cartAiLoading: true, cartAi: [] });",
      "    __post('/api/menu/cart-insights', { cart: __cartLines(cart), lang: lang, session: __visitKey })",
      "      .then(r => {",
      "        // The guest kept shopping while we were reading; that answer is stale.",
      "        if (this.state.cartAiSig !== sig) return;",
      "        this.setState({ cartAiLoading: false, cartAi: (r && r.ok && r.insights) || [] });",
      "      })",
      "      .catch(() => {",
      "        if (this.state.cartAiSig === sig) this.setState({ cartAiLoading: false, cartAi: [] });",
      "      });",
      "  }",
      "",
      "  ask(q) {",
    ].join("\n"),
  );

  // Formatted AI bubbles: bold dish names / ₹prices via parts; plain for the guest.
  const msgText =
    "text: m.ackText ? T('fallbackAck') : m.fallback ? T('fallback') : m.planText ? T('planText') : (hi ? (m.role === 'me' ? chipL(m.key || m.text) : (L.replies[m.key] || (m.greeting ? U.greeting : m.text))) : m.text),";
  if (!out.includes(msgText)) throw new Error("artifact script has no message text mapping");
  out = out.replace(
    msgText,
    [
      msgText,
      "      parts: (m.parts && m.parts.length) ? m.parts : (m.marked ? __partsFromMarked(m.marked) : __partsFromMarked(m.role === 'ai' && m.text && m.text.indexOf('**') >= 0 ? m.text : '')),",
      "      hasParts: m.role === 'ai' && !m.ackText && !m.planText && !!(m.parts && m.parts.length || m.marked || (m.text && m.text.indexOf('**') >= 0)),",
      "      hasPlainText: !(m.role === 'ai' && !m.ackText && !m.planText && !!(m.parts && m.parts.length || m.marked || (m.text && m.text.indexOf('**') >= 0))),",
    ].join("\n"),
  );

  const callServer =
    "onCallServer: () => this.setState({ chatOpen: false, callOpen: true, reason: 'Just a question', actionsDone: m.id }),";
  if (!out.includes(callServer)) throw new Error("artifact script has no onCallServer");
  out = out.replace(
    callServer,
    "onCallServer: () => this.setState({ chatOpen: false, callOpen: true, reason: '', callSending: null, callDone: null, actionsDone: m.id }),",
  );

  // Scroll into view when the guest sends a question too.
  const askTyping =
    "this._typing = setTimeout(() => this.reply(q), __CTX ? 120 : 1100);";
  if (out.includes(askTyping)) {
    out = out.replace(
      askTyping,
      "this._typing = setTimeout(() => this.reply(q), __CTX ? 120 : 1100);\n    setTimeout(__scrollChat, 30);",
    );
  }

  return out;
}

const REC_META_CHIP =
  "display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px; border-radius: 7px; background: #F3F7F4; border: 1px solid #E1EAE4; font-size: 10.5px; font-weight: 700; color: #5F7368; flex: none; max-width: 100%;";

function recMetaIcons(scope, opts = {}) {
  const flame = SPICE_FLAME.replace('width="11"', 'width="10"').replace('height="11"', 'height="10"');
  const wrapStyle = opts.inline
    ? "display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px; flex: none; max-width: 58%;"
    : "display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 6px;";
  // List cards already show diet on the thumbnail — chips are time+calories,
  // heat and ingredients only. Chat cards print a why line, so ingredients
  // would just repeat that sentence.
  const parts = [
    `<div style="${wrapStyle}">`,
    `<sc-if value="{{ ${scope}.hasTimeKcal }}" hint-placeholder-val="{{ false }}">`,
    `<span title="Cook time and calories" style="${REC_META_CHIP}">`,
    '<svg width="11" height="11" sc-camel-view-box="0 0 24 24" fill="none" stroke="#7C8E84" stroke-width="2.2" stroke-linecap="round" style="display: block; flex: none;"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    `<span>{{ ${scope}.timeKcal }}</span></span></sc-if>`,
    `<sc-if value="{{ ${scope}.spice }}" hint-placeholder-val="{{ false }}">`,
    `<span title="Spice" style="${REC_META_CHIP} color: #C62828; background: #FCE8E8; border-color: #F0B6B6;">`,
    `<sc-if value="{{ ${scope}.spice1 }}" hint-placeholder-val="{{ false }}">${flame}</sc-if>`,
    `<sc-if value="{{ ${scope}.spice2 }}" hint-placeholder-val="{{ false }}">${flame}</sc-if>`,
    `<sc-if value="{{ ${scope}.spice3 }}" hint-placeholder-val="{{ false }}">${flame}</sc-if>`,
    "</span></sc-if>",
  ];
  if (!opts.skipIngredients) {
    parts.push(
      `<sc-if value="{{ ${scope}.hasIngredients }}" hint-placeholder-val="{{ false }}">`,
      `<span title="Ingredients" style="${REC_META_CHIP.replace("max-width: 100%;", "max-width: 148px;")}">`,
      '<svg width="11" height="11" sc-camel-view-box="0 0 24 24" fill="#7C8E84" style="display: block; flex: none;"><path d="M20 4c0 8-4.5 13-11 13H6c0-7 5-11 11-11-3.5 1.4-6 4-7.5 7.5C11 10.5 15 6.5 20 4z"></path></svg>',
      `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ ${scope}.ingredients }}</span></span></sc-if>`,
    );
  }
  parts.push("</div>");
  return parts.join("");
}

/**
 * The amber "Contains …" line. Shared by the list card and the assistant's
 * reply cards so a dish carries the same warning wherever a guest meets it —
 * this is the one thing on a card someone may be reading for medical reasons.
 */
function allergenChip(scope, opts = {}) {
  const small = opts.small === true;
  const icon = small ? 11 : 12;
  return [
    `<sc-if value="{{ ${scope}.hasAllergens }}" hint-placeholder-val="{{ false }}">`,
    `<div style="display: inline-flex; align-items: center; gap: 5px; max-width: 100%; margin-top: ${
      small ? 7 : 9
    }px; padding: 4px 8px; border-radius: 8px; background: #FFF7ED; border: 1px solid #F0D7B8; font-size: ${
      small ? "10.5px" : "11px"
    }; font-weight: 700; color: #9A5B12;">`,
    `<svg width="${icon}" height="${icon}" sc-camel-view-box="0 0 24 24" fill="none" stroke="#9A5B12" stroke-width="2.2" stroke-linecap="round" style="display:block;flex:none;"><path d="M12 8v5"></path><circle cx="12" cy="17" r="1" fill="#9A5B12" stroke="none"></circle><path d="M10.2 4.5 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.8 4.5a2 2 0 0 0-3.6 0z"></path></svg>`,
    `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ ${scope}.allergenLabel }}</span>`,
    "</div></sc-if>",
  ].join("");
}

/**
 * A promo as a torn ticket rather than a sentence.
 *
 * Shared by the offers sheet and the assistant's replies so an offer looks the
 * same wherever the guest meets it, and always carries the merchant's own
 * wording: the stub is the badge they typed, never a number a model inferred.
 */
export function offerCoupon(scope = "o", opts = {}) {
  const stub = opts.compact ? 78 : 92;
  return [
    '<div style="display: flex; overflow: hidden; border-radius: 14px; border: 1px solid #E4EBE6; background: #fff; box-shadow: 0 6px 18px -14px rgba(8,22,16,0.5);">',
    `<div style="position: relative; width: ${stub}px; flex: none; background: {{ accent }}; color: #fff; display: flex; align-items: center; justify-content: center; padding: 14px 9px; text-align: center;">`,
    `<div style="font-size: ${
      opts.compact ? "13.5px" : "15px"
    }; font-weight: 800; letter-spacing: -0.3px; line-height: 1.15; text-wrap: balance;">{{ ${scope}.badge }}</div>`,
    // The perforation. Two rules rather than one so the tear reads on both the
    // white card and the accent stub.
    '<div style="position: absolute; top: 6px; bottom: 6px; right: 0; border-right: 1.5px dashed rgba(255,255,255,0.5);"></div>',
    "</div>",
    '<div style="flex: 1; min-width: 0; padding: 13px 14px; display: flex; flex-direction: column; justify-content: center;">',
    `<div style="font-size: ${
      opts.compact ? "13.5px" : "15px"
    }; font-weight: 750; color: #0C1A14; letter-spacing: -0.25px; line-height: 1.25;">{{ ${scope}.title }}</div>`,
    `<sc-if value="{{ ${scope}.detail }}">`,
    `<div style="font-size: 12px; font-weight: 500; color: #6E8177; margin-top: 4px; line-height: 1.35;">{{ ${scope}.detail }}</div>`,
    "</sc-if>",
    "</div>",
    "</div>",
  ].join("");
}

const QUICK_CHIP =
  "display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 999px; background: #fff; border: 1px solid #D6E1DA; font-size: 12px; font-weight: 700; color: #0C1A14; cursor: pointer; flex: none;";

/** Full chat reply chrome: rich dish cards, allergen note, yes/no quick replies. */
function useRichChatUi(template) {
  const start = template.indexOf('<sc-if value="{{ m.hasRecs }}" hint-placeholder-val="{{ false }}">');
  const actions = template.indexOf('<sc-if value="{{ m.hasActions }}" hint-placeholder-val="{{ false }}">');
  if (start === -1 || actions === -1 || actions < start) {
    throw new Error("artifact template chat rec / action blocks moved");
  }

  // Same diet badges, same thumbnail corner as the list card, so a dish looks the
  // same whether the guest meets it in the menu or in a reply. Shrunk to fit the
  // smaller chat thumbnail.
  const shrink = (markup) =>
    markup
      .replace(/width: 20px; height: 20px/g, "width: 16px; height: 16px")
      .replace(/width="14" height="14"/g, 'width="11" height="11"')
      .replace(/width="12" height="12"/g, 'width="10" height="10"');
  const dietCorner = [
    '<div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 3px;">',
    shrink(vegBadge("rec", 10)),
    shrink(veganBadge("rec", 10)),
    shrink(gfBadge("rec", 10)),
    shrink(nonvegBadge("rec", 10)),
    "</div>",
  ].join("");

  const addButton = [
    '<sc-if value="{{ rec.showAdd }}" hint-placeholder-val="{{ true }}">',
    '<div sc-camel-on-click="{{ rec.onAdd }}" style="{{ rec.addStyle }}" style-hover="filter: brightness(1.35);">',
    '<sc-if value="{{ rec.notAdded }}" hint-placeholder-val="{{ true }}"><svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" style="display:block;flex:none;"><path d="M12 5v14M5 12h14"></path></svg></sc-if>',
    '<sc-if value="{{ rec.justAdded }}" hint-placeholder-val="{{ false }}"><svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:none;"><path d="M5 12.5 10 17.5 19 7"></path></svg></sc-if>',
    "{{ rec.addLabel }}</div>",
    "</sc-if>",
  ].join("");

  const rich = [
    '<sc-if value="{{ m.hasRecs }}" hint-placeholder-val="{{ false }}">',
    '<div style="display: flex; flex-direction: column; gap: 8px; width: 100%; padding-top: 4px;">',
    '<sc-for list="{{ m.recs }}" as="rec" hint-placeholder-count="2">',
    '<div style="display: flex; flex-direction: column; gap: 10px; background: #fff; border: 1px solid #E4EBE6; border-radius: 18px; padding: 12px; box-shadow: 0 8px 20px -16px rgba(8,22,16,0.55);" style-hover="border-color: #CBDAD1;">',
    '<div style="display: flex; align-items: flex-start; gap: 12px;">',
    '<div style="position: relative; width: 58px; height: 58px; border-radius: 14px; background-color: #ECF1ED; background-image: {{ rec.photo }}; background-size: cover; background-position: center; flex: none; overflow: hidden;">',
    dietCorner,
    '<div style="position: absolute; right: 4px; bottom: 4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 6px; background: rgba(8,22,16,0.72); color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center;">{{ rec.rank }}</div>',
    "</div>",
    '<div style="flex: 1; min-width: 0;">',
    '<div style="display: flex; align-items: baseline; gap: 8px;">',
    '<div style="flex: 1; min-width: 0; font-size: 14px; font-weight: 700; color: #0C1A14; letter-spacing: -0.2px;">{{ rec.name }}</div>',
    '<sc-if value="{{ rec.hasPrice }}" hint-placeholder-val="{{ false }}"><span style="font-size: 13px; font-weight: 800; color: #0C1A14; white-space: nowrap;">{{ rec.price }}</span></sc-if>',
    "</div>",
    '<sc-if value="{{ rec.hasWhy }}" hint-placeholder-val="{{ false }}"><div style="font-size: 11.5px; font-weight: 500; color: #6E8177; margin-top: 3px; line-height: 1.4; text-wrap: pretty;">{{ rec.why }}</div></sc-if>',
    // Chips and the add control share one row, as they do on the list card.
    '<div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">',
    recMetaIcons("rec", { inline: true, skipIngredients: true }),
    '<div style="flex: 1;"></div>',
    addButton,
    "</div>",
    allergenChip("rec", { small: true }),
    "</div></div>",
    "</div>",
    "</sc-for></div></sc-if>",

    // A promo read out as a sentence is something the guest has to decode. The
    // same offer as a torn ticket, with the merchant's own wording, is read at a
    // glance — so the assistant hands the answer over to the offers sheet's card.
    '<sc-if value="{{ m.hasOffers }}" hint-placeholder-val="{{ false }}">',
    '<div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">',
    '<sc-for list="{{ m.offers }}" as="o" hint-placeholder-count="1">',
    offerCoupon("o", { compact: true }),
    "</sc-for></div></sc-if>",

    '<sc-if value="{{ m.hasAllergenNote }}" hint-placeholder-val="{{ false }}">',
    '<div style="width: 100%; display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 14px; background: #FFF7ED; border: 1px solid #F0D7B8;">',
    '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="#9A5B12" stroke-width="2.1" stroke-linecap="round" style="display:block;flex:none;margin-top:1px;"><path d="M12 8v5"></path><circle cx="12" cy="17" r="1" fill="#9A5B12" stroke="none"></circle><path d="M10.2 4.5 2.8 18a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.8 4.5a2 2 0 0 0-3.6 0z"></path></svg>',
    '<span style="font-size: 12px; font-weight: 600; color: #7A4A10; line-height: 1.45; text-wrap: pretty;">{{ m.allergenNote }}</span>',
    "</div></sc-if>",

    '<sc-if value="{{ m.hasQuick }}" hint-placeholder-val="{{ false }}">',
    '<div style="display: flex; flex-wrap: wrap; gap: 6px; width: 100%; padding-top: 2px;">',
    '<sc-for list="{{ m.quick }}" as="q" hint-placeholder-count="3">',
    `<div sc-camel-on-click="{{ q.onClick }}" style="${QUICK_CHIP}" style-hover="border-color: #0C1A14; background: #F3F7F4;">{{ q.label }}</div>`,
    "</sc-for></div></sc-if>",
  ].join("");

  let out = template.slice(0, start) + rich + template.slice(actions);

  // Formatted AI text (bold dishes / ₹) + a scroll root for auto-follow.
  const bubble = '<div style="{{ m.bubbleStyle }}">{{ m.text }}</div>';
  if (!out.includes(bubble)) throw new Error("artifact template has no chat bubble text");
  out = out.replace(
    bubble,
    [
      '<div style="{{ m.bubbleStyle }}">',
      '<sc-if value="{{ m.hasParts }}" hint-placeholder-val="{{ false }}">',
      // pre-wrap so a long answer keeps the paragraphs and bullet lines the
      // assistant laid out, instead of running together in one block.
      '<span style="display: block; white-space: pre-wrap;">',
      '<sc-for list="{{ m.parts }}" as="p" hint-placeholder-count="4">',
      '<sc-if value="{{ p.bold }}" hint-placeholder-val="{{ false }}"><strong style="font-weight: 800; letter-spacing: -0.15px;">{{ p.text }}</strong></sc-if>',
      '<sc-if value="{{ p.plain }}" hint-placeholder-val="{{ false }}"><span>{{ p.text }}</span></sc-if>',
      "</sc-for></span></sc-if>",
      '<sc-if value="{{ m.hasPlainText }}" hint-placeholder-val="{{ true }}">{{ m.text }}</sc-if>',
      "</div>",
    ].join(""),
  );

  const chatScroll =
    'id="froq-chat-scroll" style="flex: 1; overflow-y: auto; padding: 18px 20px 8px; display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;"';
  if (!out.includes(chatScroll)) {
    // Fresh artifact before id injection, or already polished.
    const rawScroll =
      'style="flex: 1; overflow-y: auto; padding: 18px 20px 8px; display: flex; flex-direction: column; gap: 12px;"';
    if (out.includes(rawScroll)) {
      out = out.replace(
        rawScroll,
        'id="froq-chat-scroll" style="flex: 1; overflow-y: auto; padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth;"',
      );
    }
  } else {
    out = out.replace(
      chatScroll,
      'id="froq-chat-scroll" style="flex: 1; overflow-y: auto; padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 14px; scroll-behavior: smooth;"',
    );
  }

  // Sheet chrome: calmer surface, tighter header, composer that feels one unit.
  // Scope replacements to the chat sheet so list/cart UI is left alone.
  const chatStart = out.indexOf('<sc-if value="{{ chatOpen }}"');
  const callStart = out.indexOf('callOpen', chatStart + 80);
  if (chatStart === -1 || callStart === -1) {
    throw new Error("artifact template has no chat sheet bounds");
  }
  let chatSheet = out.slice(chatStart, callStart);
  const sheetChrome = [
    [
      'style="position: relative; width: 100%; max-width: 460px; background: #F5F7F5; border-radius: 26px 26px 0 0; height: 88vh; display: flex; flex-direction: column; animation: sheetUp .26s cubic-bezier(.22,.9,.3,1); overflow: hidden;"',
      'style="position: relative; width: 100%; max-width: 440px; background: #FAFBFA; border-radius: 28px 28px 0 0; height: min(92vh, 760px); display: flex; flex-direction: column; animation: sheetUp .26s cubic-bezier(.22,.9,.3,1); overflow: hidden; box-shadow: 0 -18px 48px -28px rgba(8,22,16,0.55);"',
    ],
    [
      'style="padding: 12px 20px 14px; display: flex; flex-direction: column; align-items: center; gap: 12px; border-bottom: 1px solid #E5ECE7; background: #fff;"',
      'style="padding: 10px 18px 12px; display: flex; flex-direction: column; align-items: center; gap: 10px; border-bottom: 1px solid rgba(12,26,20,0.06); background: #fff;"',
    ],
    [
      'style="width: 42px; height: 4px; border-radius: 999px; background: #DCE5DF;"',
      'style="width: 36px; height: 4px; border-radius: 999px; background: #D7E0DA;"',
    ],
    [
      'style="font-size: 15px; font-weight: 700; color: #0C1A14; letter-spacing: -0.2px;">{{ assistantLabel }}</div>',
      'style="font-size: 16px; font-weight: 800; color: #0C1A14; letter-spacing: -0.3px;">{{ assistantLabel }}</div>',
    ],
    [
      'style="font-size: 11.5px; font-weight: 500; color: #7C8E84; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ knowsLabel }}</span>',
      'style="font-size: 12px; font-weight: 550; color: #6E8177; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ knowsLabel }}</span>',
    ],
    [
      'style="padding: 10px 20px 18px; background: #fff; border-top: 1px solid #E5ECE7;"',
      'style="padding: 12px 16px calc(14px + env(safe-area-inset-bottom)); background: #fff; border-top: 1px solid rgba(12,26,20,0.06); box-shadow: 0 -10px 28px -24px rgba(8,22,16,0.4);"',
    ],
    [
      'style="flex: none; padding: 8px 13px; border-radius: 999px; border: 1px solid #DDE7E1; background: #F5F9F6; font-size: 12.5px; font-weight: 600; color: #2A4438; cursor: pointer; white-space: nowrap;"',
      'style="flex: none; padding: 9px 14px; border-radius: 999px; border: 1px solid rgba(12,26,20,0.08); background: #F7FAF8; font-size: 12.5px; font-weight: 650; color: #24362C; cursor: pointer; white-space: nowrap;"',
    ],
    [
      'style="display: flex; align-items: center; gap: 10px; background: #F3F7F4; border: 1px solid #E3EBE6; border-radius: 16px; padding: 12px 12px 12px 14px;"',
      'style="display: flex; align-items: center; gap: 10px; background: #F4F7F5; border: 1px solid rgba(12,26,20,0.08); border-radius: 18px; padding: 10px 10px 10px 16px;"',
    ],
  ];
  for (const [from, to] of sheetChrome) {
    if (chatSheet.includes(from)) chatSheet = chatSheet.replace(from, to);
  }
  out = out.slice(0, chatStart) + chatSheet + out.slice(callStart);

  // Staff call CTA retired — drop the chat actions block entirely.
  const actionsBlock =
    '<sc-if value="{{ m.hasActions }}" hint-placeholder-val="{{ false }}">\n' +
    '                <div style="display: flex; gap: 8px; padding-top: 2px;">\n' +
    '                  <div sc-camel-on-click="{{ m.onCallServer }}" style="display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 12px; background: #0C1A14; color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer;" style-hover="filter: brightness(1.3);">\n' +
    '                    <svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" style="display: block; flex: none;"><circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"></path><path d="M17.5 6v6M14.5 9h6"></path></svg>\n' +
    "                    {{ callServerLabel }}\n" +
    "                  </div>\n" +
    '                  <div sc-camel-on-click="{{ m.onDismissActions }}" style="display: flex; align-items: center; height: 38px; padding: 0 14px; border-radius: 12px; background: #fff; border: 1px solid #DFE8E2; color: #41564A; font-size: 12.5px; font-weight: 700; cursor: pointer;" style-hover="border-color: #0C1A14;">{{ noThanksLabel }}</div>\n' +
    "                </div>\n" +
    "              </sc-if>";

  if (out.includes(actionsBlock)) {
    out = out.replace(actionsBlock, "");
  } else if (out.includes("A server can help with this one.")) {
    const polishedStart = out.indexOf(
      '<sc-if value="{{ m.hasActions }}" hint-placeholder-val="{{ false }}">',
    );
    const polishedEnd = out.indexOf("</sc-if>", polishedStart);
    if (polishedStart !== -1 && polishedEnd !== -1) {
      out = out.slice(0, polishedStart) + out.slice(polishedEnd + "</sc-if>".length);
    }
  }

  // Pin short threads toward the composer so the sheet doesn't look empty.
  if (!out.includes("#froq-chat-scroll::before")) {
    const keyframes = "@keyframes sheetUp { from { transform: translateY(28px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }";
    if (out.includes(keyframes)) {
      out = out.replace(
        keyframes,
        keyframes +
          "\n  #froq-chat-scroll::before { content: ''; flex: 1 1 auto; min-height: 8px; }" +
          "\n  #froq-chat-scroll > * { flex: 0 0 auto; }",
      );
    }
  }

  // Quick suggestions belong directly under whichever ask field the guest is
  // looking at. The artifact already places this row under the hero input, so
  // it stays exactly where it is.
  const heroChips =
    '<div style="display: flex; gap: 8px; overflow-x: auto; margin: 16px -22px 0; padding: 0 22px; scrollbar-width: none;">\n' +
    '        <sc-for list="{{ chips }}" as="chip" hint-placeholder-count="4">\n' +
    '          <div sc-camel-on-click="{{ chip.onClick }}" style="flex: none; padding: 10px 15px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.26); background: rgba(255,255,255,0.08); font-size: 13px; font-weight: 600; color: #fff; cursor: pointer; white-space: nowrap;" style-hover="background: rgba(255,255,255,0.18);">{{ chip.label }}</div>\n' +
    "        </sc-for>\n" +
    "      </div>";
  if (!out.includes(heroChips)) throw new Error("artifact template has no hero keyword chips");

  // Chat carries the same idea under its own input: starters until the guest
  // has asked once, follow-ups from then on.
  const starterChips = [
    '<sc-if value="{{ showStarterChips }}" hint-placeholder-val="{{ true }}">',
    '<div style="display: flex; flex-direction: column; gap: 10px; padding: 12px 0 2px;">',
    '<div style="font-size: 12px; font-weight: 650; color: #8B9D93; letter-spacing: -0.1px;">{{ tryAskingLabel }}</div>',
    '<div style="display: flex; flex-wrap: wrap; gap: 8px;">',
    '<sc-for list="{{ chips }}" as="chip" hint-placeholder-count="4">',
    '<div sc-camel-on-click="{{ chip.onClick }}" style="flex: none; padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(12,26,20,0.08); background: #fff; font-size: 13px; font-weight: 650; color: #24362C; cursor: pointer; box-shadow: 0 6px 16px -14px rgba(8,22,16,0.55);" style-hover="border-color: #0C1A14; background: #F7FAF8;">{{ chip.label }}</div>',
    "</sc-for>",
    "</div></div></sc-if>",
  ].join("");

  const followRow =
    '<div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px;">\n' +
    '            <sc-for list="{{ followups }}" as="f" hint-placeholder-count="3">\n' +
    '              <div sc-camel-on-click="{{ f.onClick }}" style="flex: none; padding: 9px 14px; border-radius: 999px; border: 1px solid rgba(12,26,20,0.08); background: #F7FAF8; font-size: 12.5px; font-weight: 650; color: #24362C; cursor: pointer; white-space: nowrap;">{{ f.label }}</div>\n' +
    "            </sc-for>\n" +
    "          </div>";
  const followRowAlt =
    '<div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px;">\n' +
    '            <sc-for list="{{ followups }}" as="f" hint-placeholder-count="3">\n' +
    '              <div sc-camel-on-click="{{ f.onClick }}" style="flex: none; padding: 8px 13px; border-radius: 999px; border: 1px solid #DDE7E1; background: #F5F9F6; font-size: 12.5px; font-weight: 600; color: #2A4438; cursor: pointer; white-space: nowrap;">{{ f.label }}</div>\n' +
    "            </sc-for>\n" +
    "          </div>";
  // The artifact renders follow-ups above the input. Lift that row out of its
  // slot so both chip rows can go back in underneath the input instead.
  const follow = [followRow, followRowAlt].find((row) => out.includes(row));
  if (!follow) throw new Error("artifact template has no chat followup chips");
  out = out.replace(`          ${follow}\n`, "");
  const followChips =
    '<sc-if value="{{ showFollowupChips }}" hint-placeholder-val="{{ false }}">' +
    follow.replace("padding-bottom: 10px;", "padding-top: 12px;") +
    "</sc-if>";

  // The live waveform writes straight to these bars, so they need a handle.
  const barRow =
    '<div style="flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 3px; height: 26px;">';
  if (!out.includes(barRow)) throw new Error("artifact template has no voice bar row");
  out = out.replace(barRow, barRow.replace("<div ", '<div id="froq-voice-bars" '));

  // The send button and the two tags closing the input row: nothing else in the
  // build touches this markup, so it is a stable seam to append to.
  const inputEnd =
    '              <div sc-camel-on-click="{{ send }}" style="width: 34px; height: 34px; border-radius: 11px; background: {{ accent }}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; cursor: pointer; flex: none;">↑</div>\n' +
    "            </div>\n" +
    "          </sc-if>";
  if (!out.includes(inputEnd)) throw new Error("artifact template chat composer input moved");
  out = out.replace(inputEnd, `${inputEnd}\n          ${starterChips}\n          ${followChips}`);

  return out;
}

/**
 * Puts a real dish behind the hero. The accent colour stays as the fallback
 * wash; when a photo is available it sits under a dark gradient so the white
 * title and ask bar keep their contrast.
 */
function bindHeroPhoto(script) {
  const hero = "heroA: hi ? U.heroA : 'Your Personal AI', heroB: hi ? U.heroB : 'Menu Assistant',";
  if (!script.includes(hero)) throw new Error("artifact script has no hero copy");
  return script.replace(
    hero,
    [
      hero,
      "      heroStyle: (() => {",
      "        const style = {",
      "          color: '#fff',",
      "          padding: '28px 22px 48px',",
      "          borderRadius: '0 0 28px 28px',",
      "          position: 'relative',",
      "          overflow: 'hidden',",
      "          backgroundColor: accent,",
      "          backgroundSize: 'cover',",
      "          backgroundPosition: 'center',",
      "          minHeight: '300px',",
      "        };",
      "        if (__HERO) {",
      "          style.backgroundImage = 'linear-gradient(180deg, rgba(8,22,16,0.22) 0%, rgba(8,22,16,0.48) 38%, rgba(8,22,16,0.72) 100%), url(\"' + __HERO + '\")';",
      "          style.backgroundPosition = 'center 30%';",
      "        }",
      "        return style;",
      "      })(),",
    ].join("\n"),
  );
}

/** Swaps the flat accent wash for the computed heroStyle object. */
function useHeroPhotoBackground(template) {
  const flat =
    'style="background: {{ accent }}; color: #fff; padding: 24px 22px 40px; border-radius: 0 0 28px 28px; position: relative;"';
  if (!template.includes(flat)) throw new Error("artifact template has no hero wash");
  return template.replace(flat, 'style="{{ heroStyle }}"');
}

/**
 * The design shipped with veg / vegan / gf marks only. Non-veg and heat are on
 * every Indian menu, so expose them the same way — by name — and let the
 * template draw the matching badges.
 */
function bindDietSpiceFlags(script) {
  const list = [
    "            isVeg: dietsOf(it).indexOf('veg') > -1,",
    "            isVegan: dietsOf(it).indexOf('vegan') > -1,",
    "            isGf: dietsOf(it).indexOf('gf') > -1,",
  ].join("\n");
  if (!script.includes(list)) throw new Error("artifact script has no list diet flags");
  let out = script.replace(
    list,
    [
      "            isVeg: dietsOf(it).indexOf('veg') > -1,",
      "            isVegan: dietsOf(it).indexOf('vegan') > -1,",
      "            isGf: dietsOf(it).indexOf('gf') > -1,",
      "            isNonveg: dietsOf(it).indexOf('nonveg') > -1,",
      "            ...__spiceFlags(it.name),",
      "            hasMins: !!it.mins,",
      "            ingredients: __ingredients(it),",
      "            hasIngredients: !!__ingredients(it),",
      "            kcal: __kcalOf(it.name),",
      "            hasKcal: !!__kcalOf(it.name),",
      "            timeKcal: __timeKcal(it.mins, it.name),",
      "            hasTimeKcal: !!__timeKcal(it.mins, it.name),",
      "            hasAllergens: __allergensOf(it.name).length > 0,",
      "            allergenLabel: __containsLabel(__allergensOf(it.name)),",
    ].join("\n"),
  );

  const featured =
    "isVeg: (DIET[f.name] || []).indexOf('veg') > -1, isVegan: (DIET[f.name] || []).indexOf('vegan') > -1, isGf: (DIET[f.name] || []).indexOf('gf') > -1,";
  if (!out.includes(featured)) throw new Error("artifact script has no featured diet flags");
  return out.replace(
    featured,
    "isVeg: (DIET[f.name] || []).indexOf('veg') > -1, isVegan: (DIET[f.name] || []).indexOf('vegan') > -1, isGf: (DIET[f.name] || []).indexOf('gf') > -1, isNonveg: (DIET[f.name] || []).indexOf('nonveg') > -1, ...__spiceFlags(f.name),",
  );
}

/** Shared flame mark — one per heat step. */
const SPICE_FLAME =
  '<svg width="11" height="11" sc-camel-view-box="0 0 24 24" fill="currentColor" style="display: block;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>';

function spiceBadge(scope, size) {
  const flame = SPICE_FLAME.replace('width="11"', `width="${size}"`).replace(
    'height="11"',
    `height="${size}"`,
  );
  const box = size >= 14 ? 22 : 20;
  return [
    `<sc-if value="{{ ${scope}.spice }}" hint-placeholder-val="{{ false }}">`,
    `<div title="Spice" style="width: auto; min-width: ${box}px; height: ${box}px; padding: 0 5px; border-radius: 6px; background: #FCE8E8; border: 1px solid #F0B6B6; color: #C62828; display: flex; align-items: center; justify-content: center; gap: 1px; flex: none;">`,
    `<sc-if value="{{ ${scope}.spice1 }}" hint-placeholder-val="{{ false }}">${flame}</sc-if>`,
    `<sc-if value="{{ ${scope}.spice2 }}" hint-placeholder-val="{{ false }}">${flame}</sc-if>`,
    `<sc-if value="{{ ${scope}.spice3 }}" hint-placeholder-val="{{ false }}">${flame}</sc-if>`,
    `</div></sc-if>`,
  ].join("");
}

function nonvegBadge(scope, size) {
  const box = size >= 14 ? 22 : 20;
  const dot = size >= 14 ? 14 : 12;
  return [
    `<sc-if value="{{ ${scope}.isNonveg }}" hint-placeholder-val="{{ false }}">`,
    `<div title="Non-vegetarian" style="width: ${box}px; height: ${box}px; border-radius: 6px; background: #FCE8E8; border: 1px solid #F0B6B6; display: flex; align-items: center; justify-content: center; flex: none;">`,
    `<svg width="${dot}" height="${dot}" sc-camel-view-box="0 0 24 24" fill="#C62828" style="display: block;"><circle cx="12" cy="12" r="6"></circle></svg>`,
    `</div></sc-if>`,
  ].join("");
}

/**
 * Slips non-veg (and heat, on featured only) into the diet badge rows the
 * design already draws on thumbnails. List footers get cook time + spice only —
 * diet marks stay on the photo so nothing is shown twice.
 */
function addDietSpiceBadges(template) {
  const anchors = [
    { needle: "{{ f.isGf }}", scope: "f", size: 14, spice: true },
    { needle: "{{ item.isGf }}", scope: "item", size: 12, spice: false },
  ];
  let out = template;
  for (const { needle, scope, size, spice } of anchors) {
    const at = out.indexOf(needle);
    if (at === -1) throw new Error(`artifact template has no ${needle} badge`);
    const close = out.indexOf("</sc-if>", at);
    if (close === -1) throw new Error(`artifact template ${needle} badge unclosed`);
    const insertAt = close + "</sc-if>".length;
    out =
      out.slice(0, insertAt) +
      "\n                " +
      nonvegBadge(scope, size) +
      (spice ? "\n                " + spiceBadge(scope, size) : "") +
      out.slice(insertAt);
  }

  // Allergens were reaching the browser but only the assistant ever drew them.
  // They belong on the dish itself, on their own line so the text is never
  // truncated by the narrow chip row.
  const desc =
    '<div style="font-size: 13px; font-weight: 400; line-height: 1.5; color: #6C7E74; margin: 7px 0 0; text-wrap: pretty;">{{ item.desc }}</div>';
  if (!out.includes(desc)) throw new Error("artifact template has no list description");
  out = out.replace(desc, desc + "\n              " + allergenChip("item"));

  const meta =
    '<span style="font-size: 11.5px; font-weight: 600; letter-spacing: 0.3px; color: #7F9188; border: 1px solid #DDE6E0; padding: 3px 8px; border-radius: 5px;">{{ item.meta }}</span>';
  if (!out.includes(meta)) throw new Error("artifact template has no list meta pill");
  // Time+calories and heat only under the description — ingredients belong
  // elsewhere, and diet badges already sit on the thumbnail.
  out = out.replace(meta, recMetaIcons("item", { inline: true, skipIngredients: true }));

  // Cook time moved into the chip row — hide the old standalone clock so it
  // does not sit next to a second "~10 min".
  const minsBlock =
    '<sc-if value="{{ item.mins }}" hint-placeholder-val="{{ true }}">\n' +
    '                  <span style="display: flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: #7F9188;">\n' +
    '                    <svg width="12" height="12" sc-camel-view-box="0 0 24 24" fill="none" stroke="#9CADA2" stroke-width="2" stroke-linecap="round" style="display: block;"><circle cx="12" cy="12" r="9"></circle><path d="M12 7.5V12l3 2"></path></svg>\n' +
    "                    {{ item.mins }}\n" +
    "                  </span>\n" +
    "                </sc-if>";
  if (!out.includes(minsBlock)) throw new Error("artifact template has no list mins row");
  return out.replace(minsBlock, "");
}

/**
 * Folds the generated chrome translations into the artifact's own tables.
 *
 * The design ships hand-written packs for four languages and falls back to
 * English for anything else, which would leave a Telugu guest reading Telugu
 * dish names under English buttons. Hand-written entries win: these only fill
 * gaps. See scripts/translate-menu-chrome.mjs for how the file is produced.
 */
function bindChromeTranslations(script) {
  let out = script;
  // Chrome packs for AS/GU/… used to omit `badges`; the artifact indexes it
  // whenever a pack is present, which threw on Chef's pick.
  const badgeLookup =
    "badge: it.badge ? (hi ? (L.badges[it.badge] || it.badge) : it.badge) : null,";
  if (out.includes(badgeLookup)) {
    out = out.replace(
      badgeLookup,
      "badge: it.badge ? (hi ? ((L.badges && L.badges[it.badge]) || it.badge) : it.badge) : null,",
    );
  }

  const anchor = "class Component extends DCLogic {";
  if (!out.includes(anchor)) throw new Error("artifact script has no Component class");

  const block = [
    // Only the language being served is sent, so a guest reading the menu in",
    // one language does not download twelve packs they will never see.",
    "const FROQ_I18N = (__FROQ && __FROQ.chrome) || {};",
    "(function () {",
    "  // Keys are prefixed by the table they belong to: f = FROQ_UI, t = TXT,",
    "  // u = the per-language pack the artifact reads as U.",
    "  // The server pack is a fallback: whatever the artifact already ships wins,",
    "  // because those strings are the reviewed ones. Tax labels are the one",
    "  // exception — the percent is baked into the wording and belongs to this",
    "  // merchant, so a 9% venue must not keep the artifact's 2.5%.",
    "  const FROQ_OVERRIDE = { cgst: true, sgst: true, service: true };",
    "  Object.keys(FROQ_I18N).forEach(function (code) {",
    "    const strings = FROQ_I18N[code];",
    "    Object.keys(strings).forEach(function (prefixed) {",
    "      const key = prefixed.slice(2);",
    "      const table = prefixed[0] === 'f' ? FROQ_UI : prefixed[0] === 't' ? TXT : null;",
    "      if (!table) return;",
    "      if (!table[key]) table[key] = {};",
    "      if (!table[key][code] || FROQ_OVERRIDE[key]) table[key][code] = strings[prefixed];",
    "    });",
    "    if (code === 'EN' || PACKS[code]) return;",
    "    const ui = {};",
    "    Object.keys(strings).forEach(function (prefixed) {",
    "      if (prefixed[0] === 'u') ui[prefixed.slice(2)] = strings[prefixed];",
    "    });",
    "    // The demo-only maps stay empty: a real menu's dish names, section",
    "    // headings and replies come from the server already translated. Every",
    "    // map the artifact indexes must still exist — it reads L.badges[...],",
    "    // L.reasons[...] and friends unguarded, and a missing one throws before",
    "    // the page renders (AS was dying on Chef's pick, then Ready to order).",
    "    const pack = { ui: ui };",
    "    Object.keys(HI).forEach(function (map) {",
    "      if (map !== 'ui') pack[map] = {};",
    "    });",
    "    PACKS[code] = pack;",
    "  });",
    "})();",
    "",
  ].join("\n");

  out = out.replace(anchor, block + anchor);

  // Hardcoded Hindi that fired for any language with a pack.
  const askTip =
    "askTipText: hi ? 'मैं आपका AI असिस्टेंट हूँ — मेन्यू के बारे में कुछ भी पूछिए।' : \"I'm your AI assistant — ask me anything about the menu.\",";
  if (!out.includes(askTip)) throw new Error("artifact script askTipText moved");
  out = out.replace(askTip, "askTipText: T('askTipText'),");

  // Speech recognition only knew the original five locales.
  const langMap =
    "const langMap = { EN: 'en-IN', HI: 'hi-IN', MR: 'mr-IN', BN: 'bn-IN', TA: 'ta-IN' };";
  if (!out.includes(langMap)) throw new Error("artifact script voice language map moved");
  out = out.replace(
    langMap,
    "const langMap = { EN: 'en-IN', HI: 'hi-IN', MR: 'mr-IN', BN: 'bn-IN', TA: 'ta-IN', TE: 'te-IN', GU: 'gu-IN', UR: 'ur-IN', KN: 'kn-IN', OR: 'or-IN', ML: 'ml-IN', PA: 'pa-IN', AS: 'as-IN' };",
  );

  return out;
}

/**
 * Language switching.
 *
 * The artifact switches language in the browser against its own hardcoded demo
 * packs, which only ever covered its sample dishes. A real menu's dish names,
 * descriptions and section headings live in the database, so the page is
 * rendered in the guest's language on the server instead and picking a language
 * reloads with `?lang=`. That way nothing can be left behind in English.
 */
function bindMenuLanguages(script) {
  let out = script;

  const langs = "const LANGS = ['EN', 'HI', 'MR', 'BN', 'TA'];";
  if (!out.includes(langs)) throw new Error("artifact script has no LANGS list");
  out = out.replace(
    langs,
    [
      "const LANGS = __FROQ && __FROQ.languages && __FROQ.languages.length",
      "  ? __FROQ.languages.map(l => l.code)",
      "  : ['EN', 'HI', 'MR', 'BN', 'TA'];",
    ].join("\n"),
  );

  const names =
    "const LANG_NAMES = { EN: 'English', HI: 'हिन्दी', MR: 'मराठी', BN: 'বাংলা', TA: 'தமிழ்' };";
  if (!out.includes(names)) throw new Error("artifact script has no LANG_NAMES map");
  out = out.replace(
    names,
    [
      "const LANG_NAMES = (__FROQ && __FROQ.languages ? __FROQ.languages : [])",
      "  .reduce((a, l) => { a[l.code] = l.native; return a; },",
      "    { EN: 'English', HI: 'हिन्दी', MR: 'मराठी', BN: 'বাংলা', TA: 'தமிழ்' });",
    ].join("\n"),
  );

  // The server already rendered this page in one language; the picker has to
  // open showing that one rather than resetting to English.
  const seed = "  state = {\n    formTable:";
  if (!out.includes(seed)) throw new Error("artifact script state was not seeded yet");
  out = out.replace(
    seed,
    "  state = {\n    langIndex: Math.max(0, LANGS.indexOf((__FROQ && __FROQ.lang) || 'EN')),\n    formTable:",
  );

  // Choosing a language is a navigation, not a state change.
  const go = [
    "const __goToLang = (code) => {",
    "  try {",
    "    const url = new URL(window.location.href);",
    "    if (code && code !== 'EN') url.searchParams.set('lang', code);",
    "    else url.searchParams.delete('lang');",
    "    window.location.assign(url.toString());",
    "  } catch (e) {}",
    "};",
    "",
  ].join("\n");
  const chatLang = "function __chatLang(component) {";
  if (!out.includes(chatLang)) throw new Error("artifact script has no __chatLang");
  out = out.replace(chatLang, go + chatLang);

  // The assistant answers in the language the page is being read in, so its
  // dish names match the cards the guest is looking at.
  const chatLangBody =
    "  try { return LANGS[(component.state.langIndex || 0) % LANGS.length] || 'EN'; } catch (e) { return 'EN'; }";
  if (!out.includes(chatLangBody)) throw new Error("artifact script __chatLang body moved");
  out = out.replace(
    chatLangBody,
    "  try { return (__FROQ && __FROQ.lang) || LANGS[(component.state.langIndex || 0) % LANGS.length] || 'EN'; } catch (e) { return 'EN'; }",
  );

  const pick =
    "onClick: () => this.setState({ langIndex: LANGS.indexOf(code), langOpen: false, langTip: false, askTip: false }),";
  if (!out.includes(pick)) throw new Error("artifact script has no language pick handler");
  out = out.replace(pick, "onClick: () => __goToLang(code),");

  // Tiles are half width now, so the roomy full-width padding has to come down.
  const tilePadding = "padding: '15px 16px', borderRadius: 16,";
  if (!out.includes(tilePadding)) throw new Error("artifact script language tile style moved");
  out = out.replace(tilePadding, "padding: '13px 14px', borderRadius: 14, minWidth: 0,");

  const cycle =
    "cycleLang: () => this.setState(s => ({ langIndex: ((s.langIndex || 0) + 1) % LANGS.length, langTip: false, askTip: s.langTip === true ? true : s.askTip })),";
  if (!out.includes(cycle)) throw new Error("artifact script has no cycleLang");
  out = out.replace(
    cycle,
    "cycleLang: () => this.setState({ langOpen: true, langTip: false }),",
  );

  return out;
}

/** Two languages to a row — thirteen of them do not fit in a single column. */
function useTwoUpLanguagePicker(template) {
  const column =
    '<div style="display: flex; flex-direction: column; gap: 8px;">\n' +
    '          <sc-for list="{{ langOptions }}" as="opt" hint-placeholder-count="5">';
  if (!template.includes(column)) throw new Error("artifact template language list moved");
  const grid =
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 46vh; overflow-y: auto;">\n' +
    '          <sc-for list="{{ langOptions }}" as="opt" hint-placeholder-count="13">';
  let out = template.replace(column, grid);

  // The row was built for full width: the code sat far from the name, and the
  // padding is too generous for a half-width tile.
  const row =
    '<span style="font-size: 15.5px; font-weight: 700;">{{ opt.native }}</span>\n' +
    '              <span style="font-size: 12.5px; font-weight: 600; opacity: .66;">{{ opt.code }}</span>';
  if (!out.includes(row)) throw new Error("artifact template language row moved");
  out = out.replace(
    row,
    '<span style="font-size: 14.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ opt.native }}</span>\n' +
      '              <span style="font-size: 11px; font-weight: 700; opacity: .55; flex: none; margin-left: 8px;">{{ opt.code }}</span>',
  );

  const subtitle = "The whole menu and the assistant switch with you.";
  if (!out.includes(subtitle)) throw new Error("artifact template language subtitle moved");
  return out;
}

function vegBadge(scope, size) {
  const box = size >= 14 ? 22 : 20;
  const dot = size >= 14 ? 14 : 12;
  return [
    `<sc-if value="{{ ${scope}.isVeg }}" hint-placeholder-val="{{ false }}">`,
    `<div title="Vegetarian" style="width: ${box}px; height: ${box}px; border-radius: 6px; background: #E4F2E8; border: 1px solid #B9DCC6; display: flex; align-items: center; justify-content: center; flex: none;">`,
    `<svg width="${dot}" height="${dot}" sc-camel-view-box="0 0 24 24" fill="#1B7A45" style="display: block;"><circle cx="12" cy="12" r="6"></circle></svg>`,
    `</div></sc-if>`,
  ].join("");
}

function veganBadge(scope, size) {
  const box = size >= 14 ? 22 : 20;
  const icon = size >= 14 ? 16 : 14;
  return [
    `<sc-if value="{{ ${scope}.isVegan }}" hint-placeholder-val="{{ false }}">`,
    `<div title="Vegan" style="width: ${box}px; height: ${box}px; border-radius: 6px; background: #DDF1EE; border: 1px solid #A9DBD3; display: flex; align-items: center; justify-content: center; flex: none;">`,
    `<svg width="${icon}" height="${icon}" sc-camel-view-box="0 0 24 24" fill="#0C7A6E" style="display: block;"><path d="M20 4c0 8-4.5 13-11 13H6c0-7 5-11 11-11-3.5 1.4-6 4-7.5 7.5C11 10.5 15 6.5 20 4z"></path></svg>`,
    `</div></sc-if>`,
  ].join("");
}

function gfBadge(scope, size) {
  const box = size >= 14 ? 22 : 20;
  const icon = size >= 14 ? 16 : 14;
  return [
    `<sc-if value="{{ ${scope}.isGf }}" hint-placeholder-val="{{ false }}">`,
    `<div title="Gluten-free" style="width: ${box}px; height: ${box}px; border-radius: 6px; background: #FBEEDA; border: 1px solid #EBD3A4; display: flex; align-items: center; justify-content: center; flex: none;">`,
    `<svg width="${icon}" height="${icon}" sc-camel-view-box="0 0 24 24" fill="none" stroke="#9A6A0B" stroke-width="2.1" stroke-linecap="round" style="display: block;"><path d="M12 21V7"></path><path d="M12 11c-3 0-4.5-1.5-4.5-4.5C10.5 6.5 12 8 12 11z"></path><path d="M12 11c3 0 4.5-1.5 4.5-4.5C13.5 6.5 12 8 12 11z"></path><path d="M4 20L20 4"></path></svg>`,
    `</div></sc-if>`,
  ].join("");
}

/**
 * Dock + offers sheet wiring: open/close state, sample table offers, loyalty join.
 */
function bindOffersFlow(script) {
  let out = script;

  // Artifact default — staff-request fields may already be gone from the tree.
  const state = "chatOpen: false, callOpen: false, called: false, calledReason: '',";
  if (!out.includes(state)) throw new Error("artifact script has no call sheet state for offers");
  out = out.replace(state, `${state} offersOpen: false,`);

  const openChat = "openChat: () => this.setState({ chatOpen: true }),";
  if (!out.includes(openChat)) throw new Error("artifact script has no openChat");
  out = out.replace(
    openChat,
    [
      "openChat: () => this.setState({ chatOpen: true, offersOpen: false }),",
      "      openOffers: () => this.setState({ offersOpen: true, chatOpen: false }),",
      "      closeOffers: () => this.setState({ offersOpen: false }),",
    ].join("\n"),
  );

  const callOpenProp = "callOpen: this.state.callOpen,";
  if (!out.includes(callOpenProp)) throw new Error("artifact script has no callOpen render prop");
  out = out.replace(
    callOpenProp,
    [
      "callOpen: this.state.callOpen,",
      "      offersOpen: !!this.state.offersOpen,",
      "      offers: (__FROQ && Array.isArray(__FROQ.offers)) ? __FROQ.offers : [],",
      "      hasLoyalty: !!(__FROQ && __FROQ.loyalty),",
      "      loyaltyRewardTitle: (__FROQ && __FROQ.loyalty && __FROQ.loyalty.rewardTitle) || '',",
      // Same subtitle as the loyalty stamp card (reward_name).
      "      loyaltyRewardSub: (__FROQ && __FROQ.loyalty && __FROQ.loyalty.rewardName) || '',",
      "      loyaltyRewardImage: (__FROQ && __FROQ.loyalty && __FROQ.loyalty.rewardImage) || '/reward-coffee.png',",
      "      loyaltyJoinUrl: (__FROQ && __FROQ.loyalty && __FROQ.loyalty.joinUrl)",
      "        || ((__CTX && __CTX.slug) ? ('/join/' + encodeURIComponent(__CTX.slug)) : '#'),",
    ].join("\n"),
  );

  return out;
}

/** Lucide-style marks for the Need something? sheet — inlined for the SoftUI page. */
function callSheetIcon(kind) {
  const common =
    'width="18" height="18" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"';
  const paths = {
    order:
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path>',
    water:
      '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>',
    bill:
      '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2Z"></path><path d="M8 10h8"></path><path d="M8 14h5"></path>',
    cutlery:
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>',
    issue:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    other:
      '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>',
  };
  return `<svg ${common}>${paths[kind]}</svg>`;
}

function callRequestCard(scope) {
  const spinner =
    '<div style="width:16px;height:16px;border-radius:999px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;animation:spin .7s linear infinite;flex:none;"></div>';
  return [
    `<div sc-camel-on-click="{{ ${scope}.onClick }}" style="{{ ${scope}.style }}">`,
    `<div style="{{ ${scope}.iconWrap }}">`,
    `<sc-if value="{{ ${scope}.isSending }}" hint-placeholder-val="{{ false }}">${spinner}</sc-if>`,
    `<sc-if value="{{ ${scope}.showIcon }}" hint-placeholder-val="{{ true }}">`,
    `<sc-if value="{{ ${scope}.isOrder }}" hint-placeholder-val="{{ false }}">${callSheetIcon("order")}</sc-if>`,
    `<sc-if value="{{ ${scope}.isWater }}" hint-placeholder-val="{{ false }}">${callSheetIcon("water")}</sc-if>`,
    `<sc-if value="{{ ${scope}.isBill }}" hint-placeholder-val="{{ false }}">${callSheetIcon("bill")}</sc-if>`,
    `<sc-if value="{{ ${scope}.isCutlery }}" hint-placeholder-val="{{ false }}">${callSheetIcon("cutlery")}</sc-if>`,
    `<sc-if value="{{ ${scope}.isIssue }}" hint-placeholder-val="{{ false }}">${callSheetIcon("issue")}</sc-if>`,
    `<sc-if value="{{ ${scope}.isOther }}" hint-placeholder-val="{{ false }}">${callSheetIcon("other")}</sc-if>`,
    "</sc-if>",
    "</div>",
    '<div style="min-width: 0; width: 100%;">',
    `<div style="font-size: 13px; font-weight: 700; letter-spacing: -0.2px; line-height: 1.25; text-wrap: balance;">{{ ${scope}.label }}</div>`,
    `<div style="font-size: 11px; font-weight: 500; opacity: 0.7; margin-top: 3px; line-height: 1.3;">{{ ${scope}.hint }}</div>`,
    "</div>",
    "</div>",
  ].join("");
}

/**
 * Request toast above Need something?: full toast cards slide horizontally,
 * with page dots underneath when there is more than one request.
 */
function useNeedSomethingToast(template) {
  const start = template.indexOf('<sc-if value="{{ called }}" hint-placeholder-val="{{ false }}">');
  if (start === -1) throw new Error("artifact template has no called toast");
  const endMarker = "</sc-if>";
  // Toast is the last sc-if before the dock shell closes — find its matching close.
  const after = template.indexOf(endMarker, start);
  if (after === -1) throw new Error("artifact template called toast is unclosed");
  const end = after + endMarker.length;

  const toast = [
    '<sc-if value="{{ called }}" hint-placeholder-val="{{ false }}">',
    '<div style="position: fixed; bottom: 96px; left: 0; right: 0; display: flex; justify-content: center; padding: 0 28px; pointer-events: none; z-index: 55;">',
    '<div style="width: 100%; max-width: 416px; pointer-events: auto; animation: sheetUp .3s ease;">',

    // Full-width toast slides
    '<div id="froq-called-rail" style="display: flex; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; border-radius: 18px; box-shadow: 0 20px 40px -20px rgba(8,22,16,0.7); scrollbar-width: none;">',
    '<sc-for list="{{ calledRequests }}" as="req" hint-placeholder-count="2">',
    '<div style="flex: 0 0 100%; scroll-snap-align: center; scroll-snap-stop: always; background: #0C1A14; color: #fff; padding: 14px 16px; box-sizing: border-box;">',
    '<div style="display: flex; align-items: center; gap: 10px;">',
    '<div style="width: 9px; height: 9px; border-radius: 999px; background: #7DE7AC; animation: pulseDot 1.4s ease-in-out infinite; flex: none;"></div>',
    '<div style="flex: 1; min-width: 0; font-size: 13.5px; font-weight: 750; letter-spacing: -0.2px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ req.label }}</div>',
    '<div style="font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.72); flex: none;">{{ tableLabel }}</div>',
    "</div>",
    '<div style="font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.55); margin: 8px 0 0 19px; line-height: 1.35;">{{ req.time }} · {{ req.note }}</div>',
    "</div>",
    "</sc-for>",
    "</div>",

    // Subtle brand-colored page marks — almost no height under the toast
    '<sc-if value="{{ hasCalledDots }}" hint-placeholder-val="{{ false }}">',
    '<div style="display: flex; justify-content: center; align-items: center; gap: 5px; padding: 5px 0 0; min-height: 0;">',
    '<sc-for list="{{ calledDots }}" as="dot" hint-placeholder-count="3">',
    '<div sc-camel-on-click="{{ dot.go }}" style="display: flex; align-items: center; justify-content: center; width: 14px; height: 10px; cursor: pointer;">',
    '<sc-if value="{{ dot.on }}" hint-placeholder-val="{{ false }}"><div style="{{ dot.onStyle }}"></div></sc-if>',
    '<sc-if value="{{ dot.off }}" hint-placeholder-val="{{ true }}"><div style="{{ dot.offStyle }}"></div></sc-if>',
    "</div>",
    "</sc-for>",
    "</div>",
    "</sc-if>",

    "</div>",
    "</div>",
    "</sc-if>",
  ].join("");

  let out = template.slice(0, start) + toast + template.slice(end);
  if (!out.includes("#froq-called-rail::-webkit-scrollbar")) {
    const keyframes = "@keyframes sheetUp { from { transform: translateY(28px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }";
    if (out.includes(keyframes)) {
      out = out.replace(
        keyframes,
        keyframes +
          "\n  #froq-called-rail::-webkit-scrollbar { display: none; }",
      );
    }
  }
  return out;
}

/**
 * Replaces the Call a server sheet with a compact Need something? hospitality
 * panel: sectioned one-tap requests, no confirm button, success then dismiss.
 */
function useNeedSomethingSheet(template) {
  const start = template.indexOf('<sc-if value="{{ callOpen }}" hint-placeholder-val="{{ false }}">');
  const lang = template.indexOf('<sc-if value="{{ langOpen }}" hint-placeholder-val="{{ false }}">');
  if (start === -1 || lang === -1 || lang < start) {
    throw new Error("artifact template call / lang sheets moved");
  }

  const card = (list) =>
    [
      `<sc-for list="{{ ${list} }}" as="r" hint-placeholder-count="4">`,
      callRequestCard("r"),
      "</sc-for>",
    ].join("");

  const sheet = [
    '<sc-if value="{{ callOpen }}" hint-placeholder-val="{{ false }}">',
    '<div style="position: fixed; inset: 0; background: rgba(8,22,16,0.5); display: flex; justify-content: center; align-items: flex-end; z-index: 60; animation: fadeIn .18s ease;">',
    '<div sc-camel-on-click="{{ closeCall }}" style="position: absolute; inset: 0;"></div>',
    '<div style="position: relative; width: 100%; max-width: 460px; background: #fff; border-radius: 26px 26px 0 0; padding: 12px 20px 28px; animation: sheetUp .26s cubic-bezier(.22,.9,.3,1);">',
    '<div style="display: flex; justify-content: center; padding-bottom: 14px;">',
    '<div style="width: 42px; height: 4px; border-radius: 999px; background: #DCE5DF;"></div>',
    "</div>",
    '<div style="font-family: Fraunces, Georgia, serif; font-size: 24px; font-weight: 700; color: #0C1A14; letter-spacing: -0.6px;">{{ callTitle }}</div>',
    '<div style="font-size: 13.5px; font-weight: 500; color: #6E8177; margin: 6px 0 16px;">{{ callSub }}</div>',

    '<sc-if value="{{ hasCallDone }}" hint-placeholder-val="{{ false }}">',
    '<div style="display: flex; align-items: center; gap: 12px; padding: 16px 14px; border-radius: 18px; background: #E7F6EC; border: 1px solid #B7E0C4; animation: fadeIn .2s ease;">',
    '<div style="width: 36px; height: 36px; border-radius: 12px; background: #1B7A45; color: #fff; display: flex; align-items: center; justify-content: center; flex: none;">',
    '<svg width="18" height="18" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M20 6 9 17l-5-5"></path></svg>',
    "</div>",
    '<div style="font-size: 15px; font-weight: 700; color: #145C34;">{{ callDoneLabel }}</div>',
    "</div></sc-if>",

    '<sc-if value="{{ showCallList }}" hint-placeholder-val="{{ true }}">',
    '<div style="font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #8B9D93; margin: 2px 0 8px;">{{ quickLabel }}</div>',
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">',
    card("quickRequests"),
    "</div>",
    '<div style="height: 1px; background: #E8EEEA; margin: 16px 0 14px;"></div>',
    '<div style="font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #8B9D93; margin: 0 0 8px;">{{ helpLabel }}</div>',
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">',
    card("helpRequests"),
    "</div>",
    "</sc-if>",

    "</div></div></sc-if>",
  ].join("");

  // Ensure spin keyframes exist once in the page head area — inject next to sheetUp if missing.
  let out = template.slice(0, start) + sheet + template.slice(lang);
  if (!out.includes("@keyframes spin")) {
    const fade = out.indexOf("@keyframes fadeIn");
    if (fade !== -1) {
      out =
        out.slice(0, fade) +
        "@keyframes spin { to { transform: rotate(360deg); } }\n" +
        out.slice(fade);
    }
  }
  return out;
}

/**
 * Swaps the initials avatar for the merchant logo when we have one, keeping
 * letters as the fallback so standalone demos still look finished.
 */
function useBusinessLogo(template) {
  const avatars = [
    {
      // Hero topbar — brand mark should read at a glance.
      needle:
        'justify-content: center; font-size: 14px; font-weight: 800; letter-spacing: -0.3px; flex: none;">{{ initials }}</div>',
      size: 56,
      radius: 16,
      fontSize: 18,
    },
    {
      needle:
        'justify-content: center; font-size: 13.5px; font-weight: 800; letter-spacing: -0.3px; flex: none;">{{ initials }}</div>',
      size: 44,
      radius: 14,
      fontSize: 15,
    },
  ];
  let out = template;
  for (const { needle, size, radius, fontSize } of avatars) {
    const at = out.indexOf(needle);
    if (at === -1) throw new Error("artifact template has no initials avatar");
    // Walk back to the opening <div style="width: … of this avatar.
    const open = out.lastIndexOf("<div style=", at);
    const end = at + needle.length;
    if (open === -1 || open > at) throw new Error("artifact template avatar open tag moved");
    const initials = out
      .slice(open, end)
      .replace(/width:\s*\d+px/, `width: ${size}px`)
      .replace(/height:\s*\d+px/, `height: ${size}px`)
      .replace(/border-radius:\s*\d+px/, `border-radius: ${radius}px`)
      .replace(/font-size:\s*[\d.]+px/, `font-size: ${fontSize}px`);
    const logo = [
      `<sc-if value="{{ hasLogo }}" hint-placeholder-val="{{ false }}">`,
      `<div style="width: ${size}px; height: ${size}px; border-radius: ${radius}px; flex: none; overflow: hidden; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.2);">`,
      `<img src="{{ logoUrl }}" alt="" width="${size}" height="${size}" style="display: block; width: 100%; height: 100%; object-fit: cover;" />`,
      `</div></sc-if>`,
      `<sc-if value="{{ showInitials }}" hint-placeholder-val="{{ true }}">`,
      initials,
      `</sc-if>`,
    ].join("");
    out = out.slice(0, open) + logo + out.slice(end);
  }
  return out;
}

/**
 * Chef's choice cards: taller photo with a soft gradient, brand-tinted chrome,
 * and Ask / + pinned to the same baseline.
 */
function useEqualFeaturedCards(template) {
  const outer =
    "flex: none; width: 214px; background: #fff; border: 1px solid #E5ECE7; border-radius: 20px; overflow: hidden; scroll-snap-align: start;";
  if (!template.includes(outer)) throw new Error("artifact template has no featured card shell");
  let out = template.replace(
    outer,
    "flex: none; width: 248px; background: #fff; border: 1px solid rgba(12,26,20,0.08); border-radius: 22px; overflow: hidden; scroll-snap-align: start; display: flex; flex-direction: column;",
  );

  const why =
    '<div style="font-size: 12px; font-weight: 500; color: #7C8E84; margin: 0 0 12px; line-height: 1.45; min-height: 34px;">{{ f.why }}</div>\n' +
    '              <div style="display: flex; align-items: center; justify-content: space-between;">';
  if (!out.includes(why)) throw new Error("artifact template has no featured why/actions row");
  out = out.replace(
    why,
    '<div style="font-size: 12.5px; font-weight: 500; color: #6E8177; margin: 6px 0 0; line-height: 1.35; max-height: 34px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">{{ f.why }}</div>\n' +
      '              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">',
  );

  // Taller photo + bottom gradient so white-ish diet chips stay readable.
  const photo =
    "height: 132px; background-color: #ECF1ED; background-image: {{ f.photo }}; background-size: cover; background-position: center; display: flex; flex-direction: column; justify-content: space-between; padding: 9px 10px;";
  if (!out.includes(photo)) throw new Error("artifact template has no featured photo block");
  out = out.replace(
    photo,
    "height: 158px; background-color: #ECF1ED; background-image: linear-gradient(180deg, rgba(8,22,16,0.02) 40%, rgba(8,22,16,0.55) 100%), {{ f.photo }}; background-size: cover; background-position: center; display: flex; flex-direction: column; justify-content: space-between; padding: 10px;",
  );

  const photoAt = out.indexOf("height: 158px;");
  if (photoAt === -1) throw new Error("artifact template featured photo height lost");
  const padAt = out.indexOf("padding: 13px 14px 15px;", photoAt);
  if (padAt === -1) throw new Error("artifact template has no featured body padding");
  out =
    out.slice(0, padAt) +
    "padding: 12px 13px 13px; display: flex; flex-direction: column;" +
    out.slice(padAt + "padding: 13px 14px 15px;".length);

  // Dish name + price get a touch more weight; price uses brand accent.
  out = out.replace(
    'font-size: 14.5px; font-weight: 700; color: #0C1A14; letter-spacing: -0.2px;">{{ f.name }}</div>',
    'font-size: 15.5px; font-weight: 750; color: #0C1A14; letter-spacing: -0.3px; line-height: 1.25;">{{ f.name }}</div>',
  );
  out = out.replace(
    '<span style="font-size: 15px; font-weight: 800; color: #0C1A14;">{{ f.price }}</span>',
    '<span style="font-size: 16px; font-weight: 800; color: {{ accent }}; letter-spacing: -0.2px;">{{ f.price }}</span>',
  );

  // Chef's pick: yellow star badge (replace the zigzag trend mark).
  const chefZigzag =
    '<svg width="11" height="11" sc-camel-view-box="0 0 24 24" fill="none" stroke="{{ accent }}" stroke-width="2.6" stroke-linecap="round" style="display: block; flex: none;"><path d="M4 17l5.5-6 4 3.5L20 7"></path></svg>';
  if (!out.includes(chefZigzag)) throw new Error("artifact template has no Chef's pick zigzag");
  const chefStar = [
    '<div style="width: 16px; height: 16px; border-radius: 5px; background: #F2E14A; display: flex; align-items: center; justify-content: center; flex: none;">',
    '<svg width="10" height="10" sc-camel-view-box="0 0 24 24" fill="#0C1A14" style="display: block;">',
    '<path d="M12 2.6l2.7 6 6.5.6-4.9 4.3 1.4 6.4-5.7-3.4-5.7 3.4 1.4-6.4L2.8 9.2l6.5-.6 2.7-6z"></path>',
    "</svg>",
    "</div>",
  ].join("");
  out = out.replace(chefZigzag, chefStar);

  // Section pill: yellow star (same mark as Chef's choice cards), not a chef hat.
  const livePill =
    '<div style="display: flex; align-items: center; gap: 6px; background: #F2E14A; border-radius: 999px; padding: 5px 11px 5px 9px;">\n' +
    '          <svg width="12" height="13" sc-camel-view-box="0 0 24 24" fill="#0C1A14" style="display: block;"><path d="M12 2.2c-.7 2.6-2.3 3.9-3.7 5.6A7.9 7.9 0 0 0 6.3 13a5.7 5.7 0 0 0 11.4 0c0-2.3-1.1-4-2.3-5.5-1.2-1.5-2.7-2.8-3.4-5.3zm.2 7.5c1 1 1.7 2.1 1.7 3.4a1.9 1.9 0 0 1-3.8 0c0-1.3.9-2.4 2.1-3.4z"></path></svg>\n' +
    '          <span style="font-size: 10.5px; font-weight: 800; letter-spacing: 0.7px; text-transform: uppercase; color: #0C1A14;">{{ liveLabel }}</span>\n' +
    "        </div>";
  if (out.includes(livePill)) {
    out = out.replace(
      livePill,
      [
        '<div style="display: flex; align-items: center; gap: 6px; background: {{ accentSoft }}; border-radius: 999px; padding: 5px 11px 5px 9px; border: 1px solid rgba(12,26,20,0.06);">',
        '<div style="width: 16px; height: 16px; border-radius: 5px; background: #F2E14A; display: flex; align-items: center; justify-content: center; flex: none;">',
        '<svg width="10" height="10" sc-camel-view-box="0 0 24 24" fill="#0C1A14" style="display: block;">',
        '<path d="M12 2.6l2.7 6 6.5.6-4.9 4.3 1.4 6.4-5.7-3.4-5.7 3.4 1.4-6.4L2.8 9.2l6.5-.6 2.7-6z"></path>',
        "</svg>",
        "</div>",
        '<span style="font-size: 10.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: {{ accent }};">{{ liveLabel }}</span>',
        "</div>",
      ].join(""),
    );
  }

  return out;
}

/**
 * Locale strings for Froq-injected chrome (dock, cart tax, offers, tips).
 * Artifact TXT/PACKS still cover the original UI; this covers what we added.
 */
function bindFroqUiI18n(script) {
  let out = script;

  const froqUi = `
const FROQ_UI = {
  assistantDock: { EN: 'AI Menu Assistant', HI: 'AI मेनू सहायक', MR: 'AI मेनू सहाय्यक', BN: 'AI মেনু সহায়ক', TA: 'AI மெனு உதவியாளர்' },
  followUs: { EN: 'Follow us', HI: 'हमें फ़ॉलो करें', MR: 'आम्हाला फॉलो करा', BN: 'আমাদের ফলো করুন', TA: 'எங்களை பின்தொடரவும்' },
  // English only, on purpose: the server chrome pack carries the reviewed
  // translations for every language and fills these in. Hard-coding a partial
  // set here would beat the pack for the languages it covers.
  reviewTitle: { EN: 'Leave a Google review' },
  reviewSub: { EN: 'Takes less than a minute' },
  offersTitle: { EN: 'Offers at this table', HI: 'इस टेबल पर ऑफ़र', MR: 'या टेबलवरील ऑफर्स', BN: 'এই টেবিলের অফার', TA: 'இந்த மேஜை சலுகைகள்' },
  offersTerms: { EN: 'Terms and conditions applied.', HI: 'नियम और शर्तें लागू।', MR: 'अटी व शर्ती लागू.', BN: 'শর্তাবলী প্রযোজ্য।', TA: 'விதிமுறைகள் பொருந்தும்.' },
  join: { EN: 'Join', HI: 'जुड़ें', MR: 'सामील व्हा', BN: 'যোগ দিন', TA: 'சேரவும்' },
  tryAsking: { EN: 'Try asking', HI: 'पूछकर देखें', MR: 'विचारून पहा', BN: 'জিজ্ঞাসা করে দেখুন', TA: 'கேட்டு பாருங்கள்' },
  aiAdd: { EN: 'Add', HI: 'जोड़ें', MR: 'जोडा', BN: 'যোগ করুন', TA: 'சேர்' },
  aiThinking: { EN: 'Reading your order', HI: 'आपका ऑर्डर देख रहे हैं', MR: 'तुमची ऑर्डर पाहत आहोत', BN: 'আপনার অর্ডার দেখছি', TA: 'உங்கள் ஆர்டரைப் பார்க்கிறோம்' },
  kitchen: { EN: 'Kitchen', HI: 'किचन', MR: 'किचन', BN: 'কিচেন', TA: 'சமையல்' },
  serves: { EN: 'Serves', HI: 'परोसें', MR: 'पुरेसे', BN: 'পরিবেশন', TA: 'பரிமாறல்' },
  heat: { EN: 'Heat', HI: 'तीखापन', MR: 'तिखटपणा', BN: 'ঝাল', TA: 'காரம்' },
  diet: { EN: 'Diet', HI: 'डाइट', MR: 'आहार', BN: 'ডায়েট', TA: 'உணவுவகை' },
  pace: { EN: 'Pace', HI: 'रफ़्तार', MR: 'वेग', BN: 'গতি', TA: 'வேகம்' },
  mild: { EN: 'Mild', HI: 'हल्का', MR: 'मृदु', BN: 'হালকা', TA: 'மிதமான' },
  medium: { EN: 'Medium', HI: 'मध्यम', MR: 'मध्यम', BN: 'মাঝারি', TA: 'நடுத்தர' },
  hot: { EN: 'Hot', HI: 'तीखा', MR: 'तिखट', BN: 'ঝাল', TA: 'காரம்' },
  allVegan: { EN: 'All vegan', HI: 'पूरा वीगन', MR: 'पूर्ण व्हीगन', BN: 'সম্পূর্ণ ভিগান', TA: 'முழு வீகன்' },
  vegetarian: { EN: 'Vegetarian', HI: 'शाकाहारी', MR: 'शाकाहारी', BN: 'নিরামিষ', TA: 'சைவம்' },
  hasNonveg: { EN: 'Has non-veg', HI: 'नॉन-वेज शामिल', MR: 'नॉन-व्हेज आहे', BN: 'নন-ভেজ আছে', TA: 'நான்-வெஜ் உண்டு' },
  quickPicks: { EN: 'Quick picks', HI: 'जल्दी तैयार', MR: 'जलद तयार', BN: 'দ্রুত তৈরি', TA: 'விரைவு தேர்வு' },
  person: { EN: 'person', HI: 'व्यक्ति', MR: 'व्यक्ती', BN: 'জন', TA: 'நபர்' },
  people: { EN: 'people', HI: 'लोग', MR: 'जण', BN: 'জন', TA: 'நபர்கள்' },
  min: { EN: 'min', HI: 'मि', MR: 'मि', BN: 'মি', TA: 'நிமி' },
  subtotal: { EN: 'Subtotal', HI: 'उप-योग', MR: 'उपयोग', BN: 'সাবটোটাল', TA: 'துணை மொத்தம்' },
  cgst: { EN: 'CGST (2.5%)', HI: 'CGST (2.5%)', MR: 'CGST (2.5%)', BN: 'CGST (2.5%)', TA: 'CGST (2.5%)' },
  sgst: { EN: 'SGST (2.5%)', HI: 'SGST (2.5%)', MR: 'SGST (2.5%)', BN: 'SGST (2.5%)', TA: 'SGST (2.5%)' },
  service: { EN: 'Service charge (5%)', HI: 'सर्विस चार्ज (5%)', MR: 'सर्व्हिस चार्ज (5%)', BN: 'সার্ভিস চার্জ (5%)', TA: 'சேவை கட்டணம் (5%)' },
  estimateNote: { EN: 'This is just an estimate. Actuals may be higher.', HI: 'यह केवल अनुमान है। असल राशि ज़्यादा हो सकती है।', MR: 'हे फक्त अंदाज आहे. प्रत्यक्ष रक्कम जास्त असू शकते.', BN: 'এটি শুধুই আনুমানিক। প্রকৃত খরচ বেশি হতে পারে।', TA: 'இது ஒரு மதிப்பீடு மட்டுமே. உண்மை அதிகமாக இருக்கலாம்.' },
  tipHot: { EN: 'This order runs hot — ask the assistant for a milder swap if anyone needs it.', HI: 'ऑर्डर तीखा है — अगर किसी को हल्का चाहिए तो असिस्टेंट से पूछें।', MR: 'ऑर्डर तिखट आहे — हवे असल्यास असिस्टंटकडे सौम्य पर्याय विचारा.', BN: 'অর্ডারটা ঝাল — দরকার হলে অ্যাসিস্ট্যান্টকে হালকা বিকল্প জিজ্ঞাসা করুন।', TA: 'இந்த ஆர்டர் காரமாக உள்ளது — தேவைப்பட்டால் உதவியாளரிடம் லேசான மாற்று கேளுங்கள்.' },
  tipOne: { EN: 'One dish so far — ask the assistant what pairs well with it.', HI: 'अभी एक डिश है — असिस्टेंट से पूछें इसके साथ क्या अच्छा जाएगा।', MR: 'आता एकच डिश आहे — असिस्टंटला विचारा याच्यासोबत काय चालेल.', BN: 'এখনো একটা ডিশ — অ্যাসিস্ট্যান্টকে জিজ্ঞাসা করুন এর সাথে কী মানাবে।', TA: 'இப்போது ஒரு உணவு மட்டும் — இதற்கு ஏற்றது என்னவென்று உதவியாளரிடம் கேளுங்கள்.' },
  tipBig: { EN: 'Big round — kitchen will stage this so nothing sits waiting.', HI: 'बड़ा ऑर्डर — किचन इसे स्टेज करके बनाएगा ताकि कुछ इंतज़ार में न पड़े।', MR: 'मोठा ऑर्डर — किचन हे टप्प्याटप्प्याने तयार करेल.', BN: 'বড় অর্ডার — কিচেন ধাপে ধাপে তৈরি করবে যাতে কিছু অপেক্ষা না করে।', TA: 'பெரிய ஆர்டர் — காத்திருக்காமல் இருக்க சமையல் அறை இதை படிப்படியாக தயாரிக்கும்.' },
  tipVeg: { EN: 'Fully vegetarian order. Ask if you want a vegan-only pass too.', HI: 'पूरा शाकाहारी ऑर्डर। वीगन-ओनली भी चाहिए हो तो पूछें।', MR: 'पूर्ण शाकाहारी ऑर्डर. व्हीगन-ओन्ली हवे असल्यास विचारा.', BN: 'পুরো নিরামিষ অর্ডার। ভিগান-ওনলিও চাইলে জিজ্ঞাসা করুন।', TA: 'முழு சைவ ஆர்டர். வீகன் மட்டும் வேண்டுமானால் கேளுங்கள்.' },
  tipQuick: { EN: 'Quick kitchen turn — good pick if you are short on time.', HI: 'जल्दी बनेगा — समय कम हो तो अच्छा चुनाव।', MR: 'लवकर तयार — वेळ कमी असल्यास चांगला पर्याय.', BN: 'তাড়াতাড়ি তৈরি — সময় কম থাকলে ভালো পছন্দ।', TA: 'விரைவில் தயாராகும் — நேரம் குறைவாக இருந்தால் நல்ல தேர்வு.' },
  tipMixed: { EN: 'Mixed table — flag any vegetarian guests to your server when you send.', HI: 'मिक्स्ड टेबल — भेजते समय शाकाहारी मेहमानों के बारे में सर्वर को बता दें।', MR: 'मिश्र टेबल — पाठवताना शाकाहारी अतिथींबद्दल सर्व्हरला सांगा.', BN: 'মিশ্র টেবিল — পাঠানোর সময় নিরামিষ অতিথিদের কথা সার্ভারকে বলুন।', TA: 'கலவை மேஜை — அனுப்பும்போது சைவ விருந்தினர்களை சேவையாளரிடம் சொல்லுங்கள்.' },
  tipBalanced: { EN: 'Looks balanced. Ask the assistant to tweak portions or add a side.', HI: 'संतुलित लगता है। पोर्शन बदलने या साइड जोड़ने के लिए असिस्टेंट से पूछें।', MR: 'समतोल वाटते. पोर्शन बदलायचे किंवा साइड हवे असल्यास असिस्टंटला विचारा.', BN: 'সামঞ্জস্যপূর্ণ মনে হচ্ছে। পোর্শন বদলাতে বা সাইড যোগ করতে অ্যাসিস্ট্যান্টকে জিজ্ঞাসা করুন।', TA: 'சமநிலையாக தெரிகிறது. அளவை மாற்ற அல்லது சைடு சேர்க்க உதவியாளரிடம் கேளுங்கள்.' },
  tablePrefix: { EN: 'Table', HI: 'टेबल', MR: 'टेबल', BN: 'টেবিল', TA: 'மேஜை' },
};
`;

  const packs = "const PACKS = { EN: null, HI: HI, MR: MR, BN: BN, TA: TA };";
  if (!out.includes(packs)) throw new Error("artifact script has no PACKS map for FROQ_UI");
  if (!out.includes("const FROQ_UI =")) {
    out = out.replace(packs, packs + froqUi);
  }

  const tHelper = "const T = k => (TXT[k] && (TXT[k][lang] || TXT[k].EN)) || '';";
  if (!out.includes(tHelper)) throw new Error("artifact script has no T() helper");
  out = out.replace(
    tHelper,
    tHelper + "\n    const F = k => (FROQ_UI[k] && (FROQ_UI[k][lang] || FROQ_UI[k].EN)) || '';",
  );

  // Drop demo fallback "Table 12" — only show a table when the QR / check-in has one.
  const tableDemo =
    "const table = this.state.formTable ? 'Table ' + this.state.formTable : (typeof this.props.table === 'string' ? this.props.table : 'Table 12');";
  if (out.includes(tableDemo)) {
    out = out.replace(
      tableDemo,
      "const table = this.state.formTable ? 'Table ' + this.state.formTable : (typeof this.props.table === 'string' ? this.props.table : '');",
    );
  }

  // Recompute table label after F exists (original `table` is declared above `lang`).
  const afterF =
    "const T = k => (TXT[k] && (TXT[k][lang] || TXT[k].EN)) || '';\n    const F = k => (FROQ_UI[k] && (FROQ_UI[k][lang] || FROQ_UI[k].EN)) || '';";
  if (out.includes(afterF)) {
    out = out.replace(
      afterF,
      afterF +
        "\n    const tableLocal = this.state.formTable\n" +
        "      ? (F('tablePrefix') + ' ' + this.state.formTable)\n" +
        "      : (typeof this.props.table === 'string' ? this.props.table : '');",
    );
  }
  // Prefer localized table string in the view model tagline binding.
  const taglineTable =
    "tagline: table + ' · ' + (hi ? U.service : (typeof this.props.serviceNote === 'string' ? this.props.serviceNote : 'Dine-in · Table service')),";
  const taglineOnly = "tagline: table,";
  if (out.includes(taglineTable)) {
    out = out.replace(taglineTable, "tagline: tableLocal,\n      hasTagline: !!tableLocal,");
  } else if (out.includes(taglineOnly)) {
    out = out.replace(taglineOnly, "tagline: tableLocal,\n      hasTagline: !!tableLocal,");
  }

  const insightsLabel = "insightsLabel: TXT.insights[lang] || TXT.insights.EN,";
  if (!out.includes(insightsLabel)) throw new Error("artifact script has no insightsLabel for Froq UI");
  out = out.replace(
    insightsLabel,
    [
      insightsLabel,
      "      assistantDockLabel: F('assistantDock'),",
      "      followUsLabel: F('followUs'),",
      "      reviewTitle: F('reviewTitle'),",
      "      reviewSub: F('reviewSub'),",
      "      offersTitle: F('offersTitle'),",
      "      offersTerms: F('offersTerms'),",
      "      joinLabel: F('join'),",
      "      tryAskingLabel: F('tryAsking'),",
      "      cartSubtotalLabel: F('subtotal'),",
      "      cartCgstLabel: F('cgst'),",
      "      cartSgstLabel: F('sgst'),",
      "      cartServiceLabel: F('service'),",
      "      cartEstimateNote: F('estimateNote'),",
    ].join("\n"),
  );

  // Language picks must rebuild renderVals — use setState with langIndex only;
  // SoftUI already re-runs renderVals, but keep askTip from stealing focus.
  const langClick =
    "onClick: () => this.setState({ langIndex: LANGS.indexOf(code), langOpen: false, langTip: false, askTip: true }),";
  if (out.includes(langClick)) {
    out = out.replace(
      langClick,
      "onClick: () => this.setState({ langIndex: LANGS.indexOf(code), langOpen: false, langTip: false, askTip: false }),",
    );
  }

  return out;
}

/**
 * Bind merchant social URLs for the Follow us row above Powered by.
 */
function bindFollowUs(script) {
  let out = script;
  const callOpenProp = "callOpen: this.state.callOpen,";
  // Prefer injecting next to offers props when present; else fall back to callOpen.
  const offersOpenProp = "offersOpen: !!this.state.offersOpen,";
  const anchor = out.includes(offersOpenProp) ? offersOpenProp : callOpenProp;
  if (!out.includes(anchor)) throw new Error("artifact script has no render anchor for Follow us");

  const block = [
    anchor,
    // Google is deliberately not in here: it has its own review card above the
    // row, so a merchant with only a Google link must not get a bare Follow us
    // heading over an empty row of icons.
    "      hasSocial: !!(__FROQ && __FROQ.socialLinks && (__FROQ.socialLinks.instagram || __FROQ.socialLinks.facebook || __FROQ.socialLinks.whatsapp || __FROQ.socialLinks.website)),",
    "      hasInstagram: !!(__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.instagram),",
    "      hasFacebook: !!(__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.facebook),",
    "      hasWhatsapp: !!(__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.whatsapp),",
    "      hasGoogle: !!(__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.googleReviews),",
    "      hasWebsite: !!(__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.website),",
    "      instagramUrl: (__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.instagram) || '#',",
    "      facebookUrl: (__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.facebook) || '#',",
    "      whatsappUrl: (__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.whatsapp) || '#',",
    "      googleUrl: (__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.googleReviews) || '#',",
    "      websiteUrl: (__FROQ && __FROQ.socialLinks && __FROQ.socialLinks.website) || '#',",
  ].join("\n");

  // Only replace the first occurrence of the anchor line.
  out = out.replace(anchor, block);
  return out;
}

function socialBtn(href, label, svgInner) {
  return [
    `<a href="{{ ${href} }}" target="_blank" rel="noopener noreferrer" aria-label="${label}" style="width: 46px; height: 46px; border-radius: 15px; background: {{ accentSoft }}; border: 1px solid #D5E3DA; color: {{ accent }}; display: flex; align-items: center; justify-content: center; text-decoration: none; box-shadow: 0 4px 12px -8px rgba(8,22,16,0.35);">`,
    `<svg width="22" height="22" sc-camel-view-box="0 0 24 24" fill="none" aria-hidden="true" style="display:block;">${svgInner}</svg>`,
    "</a>",
  ].join("");
}

/**
 * The artifact draws "Powered by" next to a blank accent square. Swap that for
 * the real Froq mark and a link to froq.io, and add a centered Follow us row
 * above it when the merchant has social links.
 */
function useFroqPoweredBy(template) {
  const stub =
    '<span style="font-size: 12px; font-weight: 500; color: #A3B3A9;">Powered by</span>\n' +
    '        <div style="width: 16px; height: 16px; border-radius: 5px; background: {{ accent }};"></div>\n' +
    '        <span style="font-size: 13px; font-weight: 800; color: #0C1A14; letter-spacing: -0.2px;">froq.io</span>';
  if (!template.includes(stub)) throw new Error("artifact template has no Powered by row");

  // Drop the allergen footer line — tip lives in cart AI insights instead.
  const footerNoteRow =
    '<div style="text-align: center; font-size: 12px; font-weight: 500; color: #96A79D;">{{ footerNote }}</div>';
  if (template.includes(footerNoteRow)) {
    template = template.replace(footerNoteRow, "");
  }

  // Give the footer mark more air above the Powered by / Follow us block.
  const footerPad = "padding: 34px 22px 10px;";
  if (!template.includes(footerPad)) throw new Error("artifact template has no Powered by footer pad");
  template = template.replace(footerPad, "padding: 56px 22px 10px;");

  const brand = [
    '<span style="font-size: 12px; font-weight: 500; color: #A3B3A9;">Powered by</span>',
    '<a href="https://www.froq.io" target="_blank" rel="noreferrer" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: inherit;">',
    '<img src="/froq-mark.png" alt="" width="16" height="16" style="display: block; width: 16px; height: 16px; border-radius: 4px; object-fit: contain;" />',
    '<span style="font-size: 13px; font-weight: 800; color: #0C1A14; letter-spacing: -0.2px;">froq.io</span>',
    "</a>",
  ].join("");

  const poweredRow =
    '<div style="display: flex; align-items: center; gap: 7px;">\n' +
    "        " +
    stub +
    "\n      </div>";
  if (!template.includes(poweredRow)) {
    // Fall back to swapping only the brand stub if the wrapper whitespace moved.
    return template.replace(stub, brand);
  }

  const ig = socialBtn(
    "instagramUrl",
    "Instagram",
    '<rect x="3" y="3" width="18" height="18" rx="5.5" stroke="currentColor" stroke-width="1.6"></rect><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.6"></circle><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"></circle>',
  );
  const wa = socialBtn(
    "whatsappUrl",
    "WhatsApp",
    '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M8.5 9.3c.3 2.7 2.7 5.1 5.4 5.4.9.1 1.1-.6 1.1-1l-.1-1.1-2-.5-.6.8a5.3 5.3 0 0 1-2.4-2.4l.8-.6-.5-2-1.1-.1c-.4 0-1.1.2-1 1.1z" fill="currentColor"></path>',
  );
  const fb = socialBtn(
    "facebookUrl",
    "Facebook",
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"></circle><path d="M13.8 8.4h1.3V6.2h-1.6c-1.6 0-2.6 1-2.6 2.6v1.4H9.5v2.3h1.4V18h2.3v-5.5h1.6l.3-2.3h-1.9V9c0-.4.2-.6.6-.6z" fill="currentColor"></path>',
  );
  const web = socialBtn(
    "websiteUrl",
    "Website",
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"></circle><path d="M3 12h18M12 3c2.3 2.5 3.5 5.8 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.8-3.5-9s1.2-6.5 3.5-9z" stroke="currentColor" stroke-width="1.4"></path>',
  );

  // The same "Leave a Google review" card Loyalty Stamps closes on. A guest who
  // has just eaten is the one worth asking, and a 46px icon in a row of five
  // never reads as an ask. Full-colour G on white: the brand mark is the whole
  // reason this button is recognised at a glance.
  const reviewCard = [
    '<sc-if value="{{ hasGoogle }}" hint-placeholder-val="{{ false }}">',
    '<a href="{{ googleUrl }}" target="_blank" rel="noopener noreferrer" style="width: 100%; box-sizing: border-box; margin-bottom: 22px; padding: 14px; border-radius: 20px; background: {{ accent }}; display: flex; align-items: center; gap: 13px; text-decoration: none; box-shadow: 0 16px 30px -18px rgba(8,22,16,0.6);" style-hover="filter: brightness(1.08);">',
    '<span style="width: 44px; height: 44px; border-radius: 13px; background: #fff; display: flex; align-items: center; justify-content: center; flex: none;">',
    '<svg width="22" height="22" sc-camel-view-box="0 0 24 24" fill="none" aria-hidden="true" style="display: block;">',
    '<path d="M21 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.1c-.2 1.2-.9 2.2-2 2.9v2.4h3.2c1.9-1.7 3-4.3 3-7.2z" fill="#4285F4"></path>',
    '<path d="M12 21c2.6 0 4.8-.9 6.3-2.4l-3.2-2.4c-.9.6-2 .9-3.1.9-2.4 0-4.4-1.6-5.1-3.7H3v2.5A9 9 0 0 0 12 21z" fill="#34A853"></path>',
    '<path d="M6.9 13.05a5.4 5.4 0 0 1 0-3.4V7.15H3.6a9 9 0 0 0 0 8.1l3.3-2.2z" fill="#FBBC05"></path>',
    '<path d="M12 6.35c1.4 0 2.7.5 3.7 1.4l2.8-2.7C16.8 3.45 14.6 2.75 12 2.75a9 9 0 0 0-8.4 5.4l3.3 2.6c.7-2.1 2.7-3.7 5.1-3.7z" fill="#EA4335"></path>',
    "</svg>",
    "</span>",
    '<span style="flex: 1; min-width: 0; text-align: left;">',
    '<span style="display: block; font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -0.2px;">{{ reviewTitle }}</span>',
    '<span style="display: block; margin-top: 2px; font-size: 12px; font-weight: 650; color: rgba(255,255,255,0.78);">{{ reviewSub }}</span>',
    "</span>",
    '<span style="width: 30px; height: 30px; border-radius: 999px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; flex: none;">',
    '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: block;"><path d="M9 5l7 7-7 7"></path></svg>',
    "</span>",
    "</a>",
    "</sc-if>",
  ].join("");

  const follow = [
    reviewCard,
    '<sc-if value="{{ hasSocial }}" hint-placeholder-val="{{ false }}">',
    '<div style="display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%;">',
    '<div style="font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8B9D93;">{{ followUsLabel }}</div>',
    '<div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px;">',
    '<sc-if value="{{ hasInstagram }}" hint-placeholder-val="{{ false }}">' + ig + "</sc-if>",
    '<sc-if value="{{ hasWhatsapp }}" hint-placeholder-val="{{ false }}">' + wa + "</sc-if>",
    '<sc-if value="{{ hasFacebook }}" hint-placeholder-val="{{ false }}">' + fb + "</sc-if>",
    // No Google chip here: the review card above is the same link, and two of
    // them a row apart reads as a mistake rather than as two ways in.
    '<sc-if value="{{ hasWebsite }}" hint-placeholder-val="{{ false }}">' + web + "</sc-if>",
    "</div>",
    "</div>",
    "</sc-if>",
    '<div style="display: flex; align-items: center; gap: 7px; margin-top: 10px;">',
    brand,
    "</div>",
  ].join("");

  return template.replace(poweredRow, follow);
}

/**
 * Footer dock: wide "AI Menu Assistant" pill + white offers / cart icons (brand stroke).
 * Replaces the small accent FAB (and grows its tip wrapper to fill the row).
 */
function useAssistantDockFooter(template) {
  const wrap =
    '<div style="position: relative; flex: none;">\n      <sc-if value="{{ showAskTip }}" hint-placeholder-val="{{ false }}">';
  if (!template.includes(wrap)) throw new Error("artifact template has no ask-tip dock wrap");

  const fabOpen =
    '<div sc-camel-on-click="{{ openChat }}" style="width: 50px; height: 50px; margin-top: 4px; border-radius: 999px; background: {{ accent }}; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none; box-shadow: 0 18px 34px -18px rgba(8,22,16,0.7);" style-hover="filter: brightness(1.12);">';
  const fabAt = template.indexOf(fabOpen);
  if (fabAt === -1) throw new Error("artifact template has no dock FAB");
  const fabEnd = template.indexOf("</div>", template.indexOf("</svg>", fabAt)) + "</div>".length;

  const sparkles = [
    '<svg width="18" height="18" sc-camel-view-box="0 0 24 24" fill="#fff" aria-hidden="true" style="display:block;flex:none;">',
    '<path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"></path>',
    '<path d="M18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"></path>',
    "</svg>",
  ].join("");

  const pill = [
    '<div sc-camel-on-click="{{ openChat }}" style="width: 100%; box-sizing: border-box; height: 54px; margin-top: 4px; border-radius: 999px; background: {{ accent }}; color: #fff; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; box-shadow: 0 18px 34px -18px rgba(8,22,16,0.72); padding: 0 20px;" style-hover="filter: brightness(1.12);">',
    sparkles,
    '<span style="font-size: 15px; font-weight: 750; letter-spacing: -0.25px; white-space: nowrap;">{{ assistantDockLabel }}</span>',
    "</div>",
  ].join("");

  const tag = [
    '<div sc-camel-on-click="{{ openOffers }}" aria-label="Offers" style="flex: none; width: 54px; height: 54px; margin-top: 4px; border-radius: 16px; background: #fff; color: {{ accent }}; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 12px 28px -16px rgba(8,22,16,0.55); border: 1px solid {{ accentSoft }};" style-hover="filter: brightness(0.98);">',
    '<svg width="22" height="22" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;">',
    '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>',
    '<line x1="7" y1="7" x2="7.01" y2="7"></line>',
    "</svg>",
    "</div>",
  ].join("");

  let out = template.replace(
    wrap,
    '<div style="position: relative; flex: 1; min-width: 0;">\n      <sc-if value="{{ showAskTip }}" hint-placeholder-val="{{ false }}">',
  );
  // Recompute fab location after wrap edit (lengths change).
  const nextFabAt = out.indexOf(fabOpen);
  if (nextFabAt === -1) throw new Error("artifact template dock FAB lost after wrap edit");
  const nextFabEnd = out.indexOf("</div>", out.indexOf("</svg>", nextFabAt)) + "</div>".length;
  out = out.slice(0, nextFabAt) + pill + out.slice(nextFabEnd);

  // Insert the offers button just after the tip/pill wrapper closes.
  const wrapCloseNeedle =
    '</div>\n      </div>\n      \n      <sc-if value="{{ hasCart }}" hint-placeholder-val="{{ false }}">';
  // After call-button removal the blank line / spacing may vary — find hasCart and
  // walk back to the wrap close that follows the pill.
  const hasCartAt = out.indexOf('<sc-if value="{{ hasCart }}" hint-placeholder-val="{{ false }}">');
  if (hasCartAt === -1) throw new Error("artifact template has no cart dock slot");
  const beforeCart = out.lastIndexOf("</div>", hasCartAt);
  // beforeCart closes the tip wrap; insert offers between wrap and cart.
  out = out.slice(0, beforeCart + "</div>".length) + "\n      " + tag + out.slice(beforeCart + "</div>".length);

  // Cart: rounded icon + count badge (replaces "Order / N items" chip).
  const cartChip =
    '<div sc-camel-on-click="{{ openOrder }}" style="flex: none; height: 58px; padding: 0 20px; border-radius: 18px; background: #fff; border: 1px solid #DFE8E2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer;" style-hover="border-color: #0C1A14;">\n' +
    '          <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #8B9D93;">{{ orderWord }}</span>\n' +
    '          <span style="font-size: 15px; font-weight: 800; color: #0C1A14;">{{ cartLabel }}</span>\n' +
    "        </div>";
  if (!out.includes(cartChip)) throw new Error("artifact template has no cart dock chip");
  // Match the offers button radius (16px) — same dock chrome.
  const cartIcon = [
    '<div sc-camel-on-click="{{ openOrder }}" aria-label="Cart" style="position: relative; flex: none; width: 54px; height: 54px; margin-top: 4px; border-radius: 16px; background: #fff; color: {{ accent }}; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 12px 28px -16px rgba(8,22,16,0.55); border: 1px solid {{ accentSoft }};" style-hover="filter: brightness(0.98);">',
    '<svg width="22" height="22" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;">',
    '<path d="M6 6h15l-1.5 9h-12z"></path>',
    '<path d="M6 6 5 3H2"></path>',
    '<circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none"></circle>',
    '<circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none"></circle>',
    "</svg>",
    '<div style="position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 16px; background: {{ accent }}; color: #fff; font-size: 11px; font-weight: 800; letter-spacing: -0.2px; display: flex; align-items: center; justify-content: center; border: 2px solid #F5F7F5; box-shadow: 0 4px 10px -4px rgba(8,22,16,0.45);">{{ cartCount }}</div>',
    "</div>",
  ].join("");
  out = out.replace(cartChip, cartIcon);

  // Full-bleed footer captures taps so menu + buttons under the dock are not clickable.
  const dockOuter =
    'style="position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; display: flex; justify-content: center; pointer-events: none; padding: 0 28px 20px;"';
  if (!out.includes(dockOuter)) throw new Error("artifact template has no dock outer shell");
  out = out.replace(
    dockOuter,
    'style="position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; display: flex; justify-content: center; pointer-events: auto; padding: 0 16px 12px;"',
  );

  // Full-width dock: separate blur-gradient layer under the controls.
  const dockRow =
    'style="width: 100%; max-width: 460px; display: flex; gap: 14px; pointer-events: auto; padding: 30px 22px 0; background: linear-gradient(180deg, rgba(245,247,245,0) 0%, rgba(245,247,245,0.94) 40%, #F5F7F5 100%);"';
  if (!out.includes(dockRow)) throw new Error("artifact template has no dock row shell");
  const dockRowNext =
    'style="position: relative; width: 100%; max-width: 460px; display: flex; justify-content: center; gap: 10px; pointer-events: auto; padding: 48px 0 8px;"';
  out = out.replace(dockRow, dockRowNext);
  // Blur runs past the controls so menu chips under the dock stay frosted to the bottom.
  const dockBlur = [
    '<div aria-hidden="true" style="position: absolute; top: 0; left: 0; right: 0; bottom: -20px; z-index: 0; pointer-events: none;',
    // The fade lands on the merchant's own colour rather than the page grey, so
    // the page closes in their brand. accentSoft is the brand hue taken most of
    // the way to white, which is why dark dock labels still read over it.
    "background: linear-gradient(180deg, rgba(245,247,245,0) 0%, rgba(245,247,245,0.35) 26%, rgba(245,247,245,0.74) 56%, {{ accentSoft }} 100%);",
    "-webkit-backdrop-filter: blur(28px) saturate(1.25); backdrop-filter: blur(28px) saturate(1.25);",
    "-webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 22%, #000 48%, #000 100%);",
    'mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 22%, #000 48%, #000 100%);"></div>',
  ].join("");
  if (!out.includes(dockRowNext + ">")) throw new Error("artifact template dock row open tag moved");
  out = out.replace(dockRowNext + ">", dockRowNext + ">" + dockBlur);

  // Cluster controls above the blur layer at 340px.
  const tipWrap = '<div style="position: relative; flex: 1; min-width: 0;">';
  if (!out.includes(tipWrap)) throw new Error("artifact template lost tip wrap after dock edit");
  out = out.replace(
    tipWrap,
    '<div style="position: relative; z-index: 1; width: 100%; max-width: 340px; display: flex; gap: 10px; align-items: flex-start;">\n      <div style="position: relative; flex: 1; min-width: 0;">',
  );
  const cartIf = '<sc-if value="{{ hasCart }}" hint-placeholder-val="{{ false }}">';
  const cartIfAt = out.indexOf(cartIf);
  if (cartIfAt === -1) throw new Error("artifact template has no cart if after cluster wrap");
  const cartIfEnd = out.indexOf("</sc-if>", cartIfAt);
  if (cartIfEnd === -1) throw new Error("artifact template cart if unclosed");
  const afterCartIf = cartIfEnd + "</sc-if>".length;
  out = out.slice(0, afterCartIf) + "\n      </div>" + out.slice(afterCartIf);

  if (out.includes(wrapCloseNeedle)) {
    // no-op — keeps the needle referenced for future layout audits
  }

  return out;
}

/**
 * Hero topbar: bold restaurant name, then table tagline + open hours.
 */
function useTopbarHours(template) {
  const brand =
    '<div style="font-size: 12px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: rgba(255,255,255,0.6);">{{ brand }}</div>';
  if (!template.includes(brand)) throw new Error("artifact template has no hero brand name");
  let out = template.replace(
    brand,
    '<div style="font-size: 15px; font-weight: 800; letter-spacing: -0.25px; line-height: 1.15; color: #fff;">{{ brand }}</div>',
  );

  const needle =
    '<div style="font-size: 12.5px; font-weight: 500; color: rgba(255,255,255,0.85); margin-top: 3px;">{{ tagline }}</div>';
  if (!out.includes(needle)) throw new Error("artifact template has no tagline row");
  const hours = [
    '<sc-if value="{{ hasTagline }}" hint-placeholder-val="{{ false }}">',
    needle,
    "</sc-if>",
    '<sc-if value="{{ hasHours }}" hint-placeholder-val="{{ false }}">',
    '<div style="font-size: 11.5px; font-weight: 550; color: rgba(255,255,255,0.72); margin-top: 4px; letter-spacing: 0.01em;">{{ hoursLabel }}</div>',
    "</sc-if>",
  ].join("");
  return out.replace(needle, hours);
}

/**
 * Diet filter chips: small marks matching the dish badges (veg / non-veg / …).
 */
function useFilterIcons(template) {
  const needle =
    '<sc-for list="{{ filters }}" as="f" hint-placeholder-count="5">\n' +
    '          <div sc-camel-on-click="{{ f.onClick }}" style="{{ f.style }}">{{ f.label }}</div>\n' +
    "        </sc-for>";
  if (!template.includes(needle)) throw new Error("artifact template has no diet filter chips");

  const mark = (flag, body) =>
    `<sc-if value="{{ f.${flag} }}" hint-placeholder-val="{{ false }}">${body}</sc-if>`;

  const icons = [
    mark(
      "isAll",
      '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" style="display:block;flex:none;"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect></svg>',
    ),
    mark(
      "isVeg",
      '<span style="width:14px;height:14px;border-radius:4px;background:#E4F2E8;border:1px solid #B9DCC6;display:flex;align-items:center;justify-content:center;flex:none;"><svg width="9" height="9" sc-camel-view-box="0 0 24 24" fill="#1B7A45" style="display:block;"><circle cx="12" cy="12" r="6"></circle></svg></span>',
    ),
    mark(
      "isNonveg",
      '<span style="width:14px;height:14px;border-radius:4px;background:#FCE8E8;border:1px solid #F0B6B6;display:flex;align-items:center;justify-content:center;flex:none;"><svg width="9" height="9" sc-camel-view-box="0 0 24 24" fill="#C62828" style="display:block;"><circle cx="12" cy="12" r="6"></circle></svg></span>',
    ),
    mark(
      "isVegan",
      '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="#0C7A6E" style="display:block;flex:none;"><path d="M20 4c0 8-4.5 13-11 13H6c0-7 5-11 11-11-3.5 1.4-6 4-7.5 7.5C11 10.5 15 6.5 20 4z"></path></svg>',
    ),
    mark(
      "isGf",
      '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="#9A6A0B" stroke-width="2.1" stroke-linecap="round" style="display:block;flex:none;"><path d="M12 21V7"></path><path d="M12 11c-3 0-4.5-1.5-4.5-4.5C10.5 6.5 12 8 12 11z"></path><path d="M12 11c3 0 4.5-1.5 4.5-4.5C13.5 6.5 12 8 12 11z"></path><path d="M4 20L20 4"></path></svg>',
    ),
    mark(
      "isQuick",
      '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" style="display:block;flex:none;"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    ),
    mark(
      "isPicks",
      '<span style="width:14px;height:14px;border-radius:4px;background:#F2E14A;display:flex;align-items:center;justify-content:center;flex:none;"><svg width="9" height="9" sc-camel-view-box="0 0 24 24" fill="#0C1A14" style="display:block;"><path d="M12 2.6l2.7 6 6.5.6-4.9 4.3 1.4 6.4-5.7-3.4-5.7 3.4 1.4-6.4L2.8 9.2l6.5-.6 2.7-6z"></path></svg></span>',
    ),
  ].join("");

  const chip = [
    '<sc-for list="{{ filters }}" as="f" hint-placeholder-count="5">',
    '<div sc-camel-on-click="{{ f.onClick }}" style="{{ f.style }}">',
    icons,
    '<span>{{ f.label }}</span>',
    "</div>",
    "</sc-for>",
  ].join("");

  return template.replace(needle, chip);
}

/**
 * Drop the Avoid allergen chip row under the diet filters.
 */
function stripAvoidSection(template) {
  const needle =
    '<div style="display: flex; align-items: center; gap: 7px; overflow-x: auto; margin: 0 -22px 0 0; padding: 8px 22px 2px 0; scrollbar-width: none;">\n' +
    '        <span style="flex: none; display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #9BACA2; padding-right: 2px;">\n' +
    '          <svg width="13" height="13" sc-camel-view-box="0 0 24 24" fill="none" stroke="#9BACA2" stroke-width="2" stroke-linecap="round" style="display: block;"><circle cx="12" cy="12" r="9"></circle><path d="M12 8.2v5M12 15.6v.2"></path></svg>\n' +
    "          {{ avoidLabel }}\n" +
    "        </span>\n" +
    '        <sc-for list="{{ allergenChips }}" as="a" hint-placeholder-count="5">\n' +
    '          <div sc-camel-on-click="{{ a.onClick }}" style="{{ a.style }}">{{ a.label }}</div>\n' +
    "        </sc-for>\n" +
    "      </div>";
  if (!template.includes(needle)) throw new Error("artifact template has no Avoid section");
  return template.replace(needle, "");
}

/**
 * Drop the post-meal star rating + thanks sheets ("AI reviews" / how did server do).
 */
function stripRatingSheets(template) {
  let out = template;
  for (const flag of ["rateOpen", "followOpen"]) {
    const start = out.indexOf(`<sc-if value="{{ ${flag} }}"`);
    if (start === -1) continue;
    let i = start;
    let depth = 0;
    let end = -1;
    while (i < out.length) {
      if (out.startsWith("<sc-if", i)) {
        depth += 1;
        i = out.indexOf(">", i) + 1;
        continue;
      }
      if (out.startsWith("</sc-if>", i)) {
        depth -= 1;
        i += "</sc-if>".length;
        if (depth === 0) {
          end = i;
          break;
        }
        continue;
      }
      i += 1;
    }
    if (end === -1) throw new Error(`artifact template ${flag} sheet unclosed`);
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

/**
 * Drop the dark status strip above the hero (staff on floor · kitchen wait · LIVE).
 */
function stripStatusTopbar(template) {
  const marker = 'background: #0A1611; color: #fff; padding: 11px 20px 12px;';
  const at = template.indexOf(marker);
  if (at === -1) throw new Error("artifact template has no status topbar");
  const open = template.lastIndexOf("<div", at);
  if (open === -1) throw new Error("artifact template status topbar open moved");
  let i = open;
  let depth = 0;
  while (i < template.length) {
    if (template.startsWith("<div", i)) {
      depth += 1;
      i = template.indexOf(">", i) + 1;
      continue;
    }
    if (template.startsWith("</div>", i)) {
      depth -= 1;
      i += "</div>".length;
      if (depth === 0) return template.slice(0, open) + template.slice(i);
      continue;
    }
    i += 1;
  }
  throw new Error("artifact template status topbar is unclosed");
}

/**
 * Offers sheet: ticket-style promo cards + loyalty join banner (matches design).
 */
function useOffersSheet(template) {
  const lang = template.indexOf('<sc-if value="{{ langOpen }}" hint-placeholder-val="{{ false }}">');
  if (lang === -1) throw new Error("artifact template has no lang sheet for offers insert");

  const card = [
    '<sc-for list="{{ offers }}" as="o" hint-placeholder-count="3">',
    offerCoupon(),
    "</sc-for>",
  ].join("");

  const sheet = [
    '<sc-if value="{{ offersOpen }}" hint-placeholder-val="{{ false }}">',
    '<div style="position: fixed; inset: 0; background: rgba(8,22,16,0.5); display: flex; justify-content: center; align-items: flex-end; z-index: 60; animation: fadeIn .18s ease;">',
    '<div sc-camel-on-click="{{ closeOffers }}" style="position: absolute; inset: 0;"></div>',
    '<div style="position: relative; width: 100%; max-width: 460px; background: #fff; border-radius: 26px 26px 0 0; padding: 12px 20px 22px; animation: sheetUp .26s cubic-bezier(.22,.9,.3,1); max-height: min(88vh, 720px); overflow: auto;">',
    '<div style="display: flex; justify-content: center; padding-bottom: 10px;">',
    '<div style="width: 42px; height: 4px; border-radius: 999px; background: #DCE5DF;"></div>',
    "</div>",
    '<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px;">',
    '<div style="font-size: 22px; font-weight: 800; color: #0C1A14; letter-spacing: -0.55px; line-height: 1.15;">{{ offersTitle }}</div>',
    '<div sc-camel-on-click="{{ closeOffers }}" style="width: 34px; height: 34px; border-radius: 999px; background: #F1F5F2; color: #5C6E64; display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none;" style-hover="background: #E6EDE8;">',
    '<svg width="14" height="14" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
    "</div>",
    "</div>",
    '<div style="display: flex; flex-direction: column; gap: 12px;">',
    card,
    "</div>",
    '<div style="text-align: center; font-size: 12px; font-weight: 500; color: #8B9D93; margin: 16px 0 14px; line-height: 1.4;">{{ offersTerms }}</div>',
    '<sc-if value="{{ hasLoyalty }}" hint-placeholder-val="{{ false }}">',
    '<div style="height: 1px; background: #E8EEEA; margin-bottom: 14px;"></div>',
    // Compact reward tile — same title / subtitle / thumb as the loyalty stamp card.
    '<div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 18px 16px 20px; border-radius: 22px; background: {{ accent }}; color: #fff;">',
    '<div style="display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;">',
    '<div style="flex: 1; min-width: 0;">',
    '<div style="font-family: Fraunces, Georgia, serif; font-size: 18px; font-weight: 700; letter-spacing: -0.4px; line-height: 1.2; white-space: pre-line;">{{ loyaltyRewardTitle }}</div>',
    '<div style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.72); margin-top: 6px; line-height: 1.35;">{{ loyaltyRewardSub }}</div>',
    "</div>",
    '<div style="width: 72px; height: 72px; border-radius: 18px; overflow: hidden; flex: none; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.16);">',
    '<img src="{{ loyaltyRewardImage }}" alt="" width="72" height="72" style="display: block; width: 100%; height: 100%; object-fit: cover;" />',
    "</div>",
    "</div>",
    '<a href="{{ loyaltyJoinUrl }}" style="height: 40px; padding: 0 22px; border-radius: 12px; background: #fff; color: {{ accent }}; display: inline-flex; align-items: center; justify-content: center; font-size: 13.5px; font-weight: 800; text-decoration: none; letter-spacing: -0.2px;">{{ joinLabel }}</a>',
    "</div>",
    "</sc-if>",
    "</div>",
    "</div>",
    "</sc-if>",
  ].join("");

  return template.slice(0, lang) + sheet + template.slice(lang);
}

/**
 * When the merchant turns off table ordering or server notifications, hide the
 * matching dock controls (and dish + buttons) so guests only see what works.
 */
function useGuestFeatureGates(template) {
  let out = template;

  const call =
    '<div sc-camel-on-click="{{ openCall }}" style="{{ callBtnStyle }}">\n' +
    '        <div style="{{ callDotStyle }}"></div>\n' +
    "        {{ callLabel }}\n" +
    "      </div>";
  if (!out.includes(call)) throw new Error("artifact template has no call dock button");
  // Need something? dock control retired.
  out = out.replace(call, "");

  // Ask / + chips: one shared radius on the outer shell (overflow clips kids),
  // so every corner matches — including when + is hidden.
  out = useAskAddRadius(out);

  // Featured + list quantity-add chips sit next to the price; wrap each.
  const addButtons = [
    {
      open: '<div sc-camel-on-click="{{ f.onAdd }}" style="width: 32px;',
      scope: "f",
    },
    {
      open: '<div sc-camel-on-click="{{ item.onAdd }}" style="width: 34px;',
      scope: "item",
    },
  ];
  for (const { open, scope } of addButtons) {
    const at = out.indexOf(open);
    if (at === -1) throw new Error(`artifact template has no ${scope}.onAdd control`);
    // Walk to the end of this add control (the SVG lives inside).
    let depth = 0;
    let i = at;
    let end = -1;
    while (i < out.length) {
      if (out.startsWith("<div", i)) {
        depth += 1;
        i = out.indexOf(">", i) + 1;
        continue;
      }
      if (out.startsWith("</div>", i)) {
        depth -= 1;
        i += "</div>".length;
        if (depth === 0) {
          end = i;
          break;
        }
        continue;
      }
      i += 1;
    }
    if (end === -1) throw new Error(`artifact template ${scope}.onAdd unclosed`);
    const block = out.slice(at, end);
    // Hide the hairline divider with the + so Ask isn't left half-rounded.
    const divider = '<div style="width: 1px; background: #E4EBE6;"></div>\n                  ';
    const divAt = out.lastIndexOf(divider, at);
    const wrapStart = divAt !== -1 && at - divAt < 120 ? divAt : at;
    const wrapped =
      `<sc-if value="{{ ${scope}.showAdd }}" hint-placeholder-val="{{ true }}">` +
      out.slice(wrapStart, end) +
      "</sc-if>";
    out = out.slice(0, wrapStart) + wrapped + out.slice(end);
  }

  return out;
}

/**
 * Ask / + control: keep a single border-radius on the outer shell so all four
 * corners match (child left/right radii were fighting the shell).
 */
function useAskAddRadius(template) {
  let out = template;

  const shells = [
    {
      from: "height: 32px; border: 1px solid #D6E1DA; border-radius: 10px; flex: none; background: #fff;",
      to: "height: 32px; border: 1px solid #D6E1DA; border-radius: 12px; overflow: hidden; flex: none; background: #fff;",
    },
    {
      from: "height: 34px; border: 1px solid #D6E1DA; border-radius: 11px; flex: none; background: #fff;",
      to: "height: 34px; border: 1px solid #D6E1DA; border-radius: 12px; overflow: hidden; flex: none; background: #fff;",
    },
  ];
  for (const { from, to } of shells) {
    if (!out.includes(from)) throw new Error("artifact template has no Ask/+ shell");
    out = out.replace(from, to);
  }

  const askRadii = [
    "border-radius: 9px 0 0 9px; color: {{ accent }}; font-size: 11.5px;",
    "border-radius: 10px 0 0 10px; color: {{ accent }}; font-size: 12px;",
  ];
  for (const from of askRadii) {
    if (!out.includes(from)) throw new Error("artifact template has no Ask chip radius");
    out = out.replace(from, from.replace(/border-radius: [^;]+;/, "border-radius: 0;"));
  }

  const addRadii = [
    "border-radius: 0 9px 9px 0; color: #0C1A14;",
    "border-radius: 0 10px 10px 0;",
  ];
  for (const from of addRadii) {
    if (!out.includes(from)) throw new Error("artifact template has no + chip radius");
    out = out.replace(from, from.replace(/border-radius: [^;]+;/, "border-radius: 0;"));
  }

  return out;
}

/**
 * Mobile sheet close UX: cart ✕, tappable handles, safer hit targets, toast
 * below sheet layer so Need-something rail can't steal taps from the sheet.
 */
function useMobileSheetChrome(template) {
  let out = template;
  if (out.includes('data-froq="close-order"')) return out;

  const toastZ =
    'padding: 0 28px; pointer-events: none; z-index: 70;">';
  if (out.includes(toastZ)) {
    out = out.replaceAll(
      toastZ,
      'padding: 0 28px; pointer-events: none; z-index: 55;">',
    );
  }

  const orderHandle =
    '<div style="display: flex; justify-content: center; padding-bottom: 16px;">\n' +
    '          <div style="width: 42px; height: 4px; border-radius: 999px; background: #DCE5DF;"></div>\n' +
    "        </div>";
  if (!out.includes(orderHandle)) throw new Error("artifact template has no cart sheet handle");
  out = out.replace(
    orderHandle,
    '<div sc-camel-on-click="{{ closeOrder }}" data-froq="close-order" style="display: flex; justify-content: center; padding: 4px 0 12px; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;">\n' +
      '          <div style="width: 42px; height: 4px; border-radius: 999px; background: #DCE5DF;"></div>\n' +
      "        </div>",
  );

  const orderTitle =
    '<div style="display: flex; align-items: baseline; justify-content: space-between;">\n' +
    '          <div style="font-family: Fraunces, Georgia, serif; font-size: 24px; font-weight: 700; color: #0C1A14; letter-spacing: -0.6px;">{{ orderTitle }}</div>\n' +
    '          <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #8B9D93;">{{ tableLabel }}</div>\n' +
    "        </div>";
  if (!out.includes(orderTitle)) throw new Error("artifact template has no cart title row");
  out = out.replace(
    orderTitle,
    '<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">\n' +
      '          <div style="flex: 1; min-width: 0;">\n' +
      '            <div style="font-family: Fraunces, Georgia, serif; font-size: 24px; font-weight: 700; color: #0C1A14; letter-spacing: -0.6px;">{{ orderTitle }}</div>\n' +
      '            <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #8B9D93; margin-top: 2px;">{{ tableLabel }}</div>\n' +
      "          </div>\n" +
      '<div sc-camel-on-click="{{ closeOrder }}" data-froq="close-order" role="button" aria-label="Close cart" style="width: 44px; height: 44px; border-radius: 12px; background: #F1F5F2; color: #5C6E64; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; flex: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent;" style-hover="background: #E6EDE8; color: #0C1A14;">✕</div>\n' +
      "        </div>",
  );

  const chatHandle =
    '<div style="width: 36px; height: 4px; border-radius: 999px; background: #D7E0DA;"></div>';
  if (!out.includes(chatHandle)) throw new Error("artifact template has no chat sheet handle");
  out = out.replace(
    chatHandle,
    '<div sc-camel-on-click="{{ closeChat }}" data-froq="close-chat" style="display: flex; justify-content: center; width: 100%; padding: 2px 0 4px; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;"><div style="width: 36px; height: 4px; border-radius: 999px; background: #D7E0DA;"></div></div>',
  );

  const chatClose =
    '<div sc-camel-on-click="{{ closeChat }}" style="width: 34px; height: 34px; border-radius: 11px; background: #F1F5F2; color: #5C6E64; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; flex: none;" style-hover="background: #E6EDE8; color: #0C1A14;">✕</div>';
  if (!out.includes(chatClose)) throw new Error("artifact template has no chat close button");
  out = out.replace(
    chatClose,
    '<div sc-camel-on-click="{{ closeChat }}" data-froq="close-chat" role="button" aria-label="Close assistant" style="width: 44px; height: 44px; border-radius: 12px; background: #F1F5F2; color: #5C6E64; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; flex: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent;" style-hover="background: #E6EDE8; color: #0C1A14;">✕</div>',
  );

  // Keep assistant / cart sheets above the Need-something toast rail.
  out = out.replaceAll(
    'align-items: flex-end; z-index: 60; animation: fadeIn .18s ease;"',
    'align-items: flex-end; z-index: 80; animation: fadeIn .18s ease;"',
  );

  const backdrops = [
    '<div sc-camel-on-click="{{ closeChat }}" style="position: absolute; inset: 0;"></div>',
    '<div sc-camel-on-click="{{ closeOrder }}" style="position: absolute; inset: 0;"></div>',
    '<div sc-camel-on-click="{{ closeCall }}" style="position: absolute; inset: 0;"></div>',
  ];
  for (const from of backdrops) {
    if (!out.includes(from)) continue;
    out = out.replaceAll(
      from,
      from.replace(
        'style="position: absolute; inset: 0;"',
        'style="position: absolute; inset: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent;"',
      ),
    );
  }

  return out;
}

/** iOS Safari zooms focused inputs under 16px — bump SoftUI form controls. */
function useIosInputZoomFix(template) {
  return template.replace(
    /<(input|select)(\b[^>]*?\bstyle="[^"]*?)font-size:\s*(1[0-5](?:\.\d+)?)px/g,
    "<$1$2font-size: 16px",
  );
}

/**
 * Persist cart across reloads for this browser tab (per menu slug).
 */
function bindCartSessionPersist(script) {
  let out = script;
  if (out.includes("__froqCartKey")) return out;

  const ctx = "const __CTX = (__FROQ && __FROQ.context) || null;";
  if (!out.includes(ctx)) throw new Error("artifact script has no __CTX for cart persist");
  out = out.replace(
    ctx,
    [
      ctx,
      "const __froqCartKey = () => 'froq-menu-cart:' + ((__CTX && __CTX.slug) || 'menu');",
      "const __froqLoadCart = () => {",
      "  try {",
      "    const raw = sessionStorage.getItem(__froqCartKey());",
      "    if (!raw) return [];",
      "    const parsed = JSON.parse(raw);",
      "    return Array.isArray(parsed) ? parsed.filter(n => typeof n === 'string' && n) : [];",
      "  } catch (e) { return []; }",
      "};",
      "const __froqSaveCart = (cart) => {",
      "  try { sessionStorage.setItem(__froqCartKey(), JSON.stringify(Array.isArray(cart) ? cart : [])); }",
      "  catch (e) {}",
      "};",
    ].join("\n"),
  );

  const init = "reason: '', activeCat: 'all', cart: [], draft: '',";
  if (!out.includes(init)) throw new Error("artifact script has no cart init state");
  out = out.replace(init, "reason: '', activeCat: 'all', cart: __froqLoadCart(), draft: '',");

  return out;
}

/**
 * Lock body scroll while SoftUI sheets are open — stops iOS from swallowing
 * backdrop / close taps into background scroll.
 */
function bindSheetBodyScrollLock(script) {
  let out = script;
  if (out.includes("__froqLockSheets")) return out;

  const ctx = "const __CTX = (__FROQ && __FROQ.context) || null;";
  if (!out.includes(ctx)) throw new Error("artifact script has no __CTX for sheet lock");
  // Prefer attaching after cart helpers when both run; otherwise after __CTX.
  const afterCart = "const __froqSaveCart = (cart) => {\n  try { sessionStorage.setItem(__froqCartKey(), JSON.stringify(Array.isArray(cart) ? cart : [])); }\n  catch (e) {}\n};";
  const lockHelpers = [
    "const __froqLockSheets = (on) => {",
    "  try {",
    "    const root = document.documentElement;",
    "    const body = document.body;",
    "    if (!root || !body) return;",
    "    if (on) {",
    "      if (root.dataset.froqSheetLock === '1') return;",
    "      root.dataset.froqSheetLock = '1';",
    "      root.dataset.froqScrollY = String(window.scrollY || 0);",
    "      root.style.overflow = 'hidden';",
    "      body.style.overflow = 'hidden';",
    "      body.style.position = 'fixed';",
    "      body.style.top = '-' + (root.dataset.froqScrollY || '0') + 'px';",
    "      body.style.left = '0';",
    "      body.style.right = '0';",
    "      body.style.width = '100%';",
    "    } else {",
    "      if (root.dataset.froqSheetLock !== '1') return;",
    "      const y = Number(root.dataset.froqScrollY || 0) || 0;",
    "      delete root.dataset.froqSheetLock;",
    "      delete root.dataset.froqScrollY;",
    "      root.style.overflow = '';",
    "      body.style.overflow = '';",
    "      body.style.position = '';",
    "      body.style.top = '';",
    "      body.style.left = '';",
    "      body.style.right = '';",
    "      body.style.width = '';",
    "      window.scrollTo(0, y);",
    "    }",
    "  } catch (e) {}",
    "};",
  ].join("\n");

  if (out.includes(afterCart)) {
    out = out.replace(afterCart, afterCart + "\n" + lockHelpers);
  } else {
    out = out.replace(ctx, ctx + "\n" + lockHelpers);
  }

  const didUpdate =
    "  componentDidUpdate(pp, ps) {\n" +
    "    if (this.state.askTip && !ps.askTip) {\n" +
    "      clearTimeout(this._askOff);\n" +
    "      this._askOff = setTimeout(() => this.setState({ askTip: false }), 8000);\n" +
    "    }\n" +
    "  }";
  if (!out.includes(didUpdate)) throw new Error("artifact script has no componentDidUpdate for sheet lock");
  out = out.replace(
    didUpdate,
    [
      "  componentDidUpdate(pp, ps) {",
      "    if (this.state.askTip && !ps.askTip) {",
      "      clearTimeout(this._askOff);",
      "      this._askOff = setTimeout(() => this.setState({ askTip: false }), 8000);",
      "    }",
      "    const sheetNow = !!(this.state.chatOpen || this.state.orderOpen || this.state.callOpen || this.state.langOpen || this.state.offersOpen);",
      "    const sheetWas = !!(ps.chatOpen || ps.orderOpen || ps.callOpen || ps.langOpen || ps.offersOpen);",
      "    if (sheetNow !== sheetWas) __froqLockSheets(sheetNow);",
      "    if (ps.cart !== this.state.cart) __froqSaveCart(this.state.cart);",
      "  }",
    ].join("\n"),
  );

  const unmount = "  componentWillUnmount() {";
  if (!out.includes(unmount)) throw new Error("artifact script has no componentWillUnmount for sheet lock");
  out = out.replace(
    unmount,
    "  componentWillUnmount() {\n    __froqLockSheets(false);",
  );

  return out;
}

/** Apply mobile guest-menu fixes to an already-generated template document. */
function applyGuestMenuMobileFixes(template) {
  let out = useIosInputZoomFix(useMobileSheetChrome(template));
  const scriptOpen = out.match(/<script type="text\/x-dc"[^>]*>/);
  if (!scriptOpen) throw new Error("template has no SoftUI script for mobile fixes");
  const scriptStart = scriptOpen.index + scriptOpen[0].length;
  const scriptEnd = out.indexOf("</script>", scriptStart);
  const script = bindSheetBodyScrollLock(
    bindCartSessionPersist(out.slice(scriptStart, scriptEnd)),
  );
  return out.slice(0, scriptStart) + script + out.slice(scriptEnd);
}

function writeGeneratedBundle(template, propsMeta) {
  mkdirSync(dirname(GENERATED), { recursive: true });
  writeFileSync(
    GENERATED,
    [
      "// Generated by scripts/build-menu-bundle.mjs — do not edit by hand.",
      "// Source: the AI Menu design artifact, kept verbatim apart from asset",
      "// paths and the data binding described in that script.",
      "",
      "/** Prop metadata from the artifact; `default` is what the page renders with. */",
      `export const GUEST_MENU_PROPS: Record<string, { default?: unknown } & Record<string, unknown>> = ${JSON.stringify(
        propsMeta,
        null,
        2,
      )};`,
      "",
      "/** Full page document. Contains `__FROQ_PROPS__` and `<!--FROQ_HEAD-->` slots. */",
      `export const GUEST_MENU_TEMPLATE = ${JSON.stringify(template)};`,
      "",
    ].join("\n"),
  );
}

function patchGeneratedBundle() {
  const raw = readFileSync(GENERATED, "utf8");
  const propsMatch = raw.match(
    /export const GUEST_MENU_PROPS[^=]*=\s*(\{[\s\S]*?\});/,
  );
  const templateMatch = raw.match(
    /export const GUEST_MENU_TEMPLATE = ("(?:\\.|[^"\\])*");/,
  );
  if (!propsMatch || !templateMatch) {
    throw new Error("bundle.generated.ts missing GUEST_MENU_PROPS / TEMPLATE");
  }
  const propsMeta = JSON.parse(propsMatch[1]);
  const template = applyGuestMenuMobileFixes(JSON.parse(templateMatch[1]));
  writeGeneratedBundle(template, propsMeta);
  const kb = (n) => `${Math.round(n / 1024)}kb`;
  console.log(`patched → src/lib/menu/guest-app/bundle.generated.ts (${kb(template.length)})`);
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error(
      'usage: node scripts/build-menu-bundle.mjs "<path to AI Menu.html>"\n' +
        "   or: node scripts/build-menu-bundle.mjs --from-generated",
    );
    process.exit(1);
  }
  if (input === "--from-generated") {
    patchGeneratedBundle();
    return;
  }

  const src = readFileSync(input.replace(/^~/, process.env.HOME ?? "~"), "utf8");
  const blocks = readBundlerBlocks(src);
  if (!blocks.manifest || !blocks.template) {
    console.error("not an artifact bundle: missing __bundler/manifest or __bundler/template");
    process.exit(1);
  }

  const assets = decodeAssets(JSON.parse(blocks.manifest));
  const extResources = JSON.parse(blocks.ext_resources ?? "[]");
  let template = JSON.parse(blocks.template);
  const paths = planAssetPaths(assets, extResources, template);

  rmSync(PUBLIC_DIR, { recursive: true, force: true });
  mkdirSync(join(PUBLIC_DIR, "fonts"), { recursive: true });
  for (const [uuid, asset] of Object.entries(assets)) {
    writeFileSync(join(PUBLIC_DIR, paths[uuid]), asset.bytes);
  }

  for (const [uuid, path] of Object.entries(paths)) {
    template = template.split(uuid).join(`/menu-app/${path}`);
  }

  // Prop defaults (venue name, table, accent, currency) live in this attribute.
  // The route rewrites it per merchant, so leave a placeholder behind.
  const propsMatch = template.match(/ data-props="([^"]*)"/);
  if (!propsMatch) throw new Error("artifact script tag has no data-props attribute");
  const propsMeta = JSON.parse(
    propsMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
  );
  // Demo artifact ships "Table 12"; live guests only see a table when the QR has one.
  if (propsMeta.table && typeof propsMeta.table === "object") {
    propsMeta.table.default = "";
  }
  template = template.replace(propsMatch[0], ' data-props="__FROQ_PROPS__"');

  template = useTwoUpLanguagePicker(
    useGuestFeatureGates(
    useAssistantDockFooter(
      useFroqPoweredBy(
        useEqualFeaturedCards(
          useBusinessLogo(
            useTopbarHours(
              useOffersSheet(
                useNeedSomethingToast(
                  useNeedSomethingSheet(
                    useFilterIcons(
                      stripAvoidSection(
                        stripRatingSheets(
                          stripStatusTopbar(
                            useHeroPhotoBackground(
                              useRichChatUi(
                                useCartTaxBreakdown(
                                  addDietSpiceBadges(
                                    guardCartNote(guardFeaturedSignal(bindPhotoSlots(template))),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
  );

  const scriptOpen = template.match(/<script type="text\/x-dc"[^>]*>/);
  const scriptStart = scriptOpen.index + scriptOpen[0].length;
  const scriptEnd = template.indexOf("</script>", scriptStart);
  template =
    template.slice(0, scriptStart) +
    bindChromeTranslations(
      bindMenuLanguages(
        bindSheetBodyScrollLock(
          bindCartSessionPersist(bindScriptToLiveData(template.slice(scriptStart, scriptEnd))),
        ),
      ),
    ) +
    template.slice(scriptEnd);

  template = useIosInputZoomFix(useMobileSheetChrome(template));

  // The runtime reads window.__resources the moment it loads, so both the
  // resource map and the per-merchant data must land ahead of its <script>.
  const headOpen = template.match(/<head[^>]*>/i);
  const resources = JSON.stringify({
    [REACT_URL]: "/menu-app/react.js",
    [REACT_DOM_URL]: "/menu-app/react-dom.js",
  });
  const injected = `<script>window.__resources=${resources};</script><!--FROQ_HEAD-->`;
  const headEnd = headOpen.index + headOpen[0].length;
  template = template.slice(0, headEnd) + injected + template.slice(headEnd);

  writeGeneratedBundle(template, propsMeta);

  const kb = (n) => `${Math.round(n / 1024)}kb`;
  console.log(`assets  → public/menu-app (${Object.keys(assets).length} files)`);
  console.log(`page    → src/lib/menu/guest-app/bundle.generated.ts (${kb(template.length)})`);
}

// Guarded so the markup helpers above can be imported by the sync script that
// keeps bundle.generated.ts current while the design artifact lives outside
// the repo. Running the file directly still rebuilds from the artifact.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
