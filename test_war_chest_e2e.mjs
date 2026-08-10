/**
 * THORX Engine C — Captain Wars deep browser E2E (halal war-chest/prize model)
 *
 * Runs against the isolated local stack (http://localhost:5099) which uses a
 * fresh local Postgres (thorx_e2e). Covers:
 *   1. Register 4 users + founder login (UI)
 *   2. Captain guild creation + member onboarding (API, session-authenticated)
 *   3. Challenge initiation via the Wars tab UI
 *   4. All 4 member votes via the UI  →  WAR ACTIVE
 *   5. War Chest block renders (Rs 0 + levy percentages)
 *   6. Engine C task completions fund the chest from THORX's cut (2% of gross)
 *      → chest grows; ledger shows reduced THORX profit
 *   7. Admin resolution → winner takes BOTH chests; prize UI + pools verified
 *   8. Bonus: a second war resolved as a DRAW → each guild keeps its own chest
 *   9. Console / page-error audit across every session
 */
import puppeteer from "puppeteer";
import { execSync } from "node:child_process";

const BASE = "http://localhost:5099";
const DB_URL = process.env.E2E_DB_URL || "postgres://postgres:postgres@127.0.0.1:5432/thorx_e2e";
const TS = Date.now();
const TAG = String(TS).slice(-8);

const USERS = {
  captA: { email: `e2e_ca_${TAG}@thorx-e2e.local`, password: "E2ePass123!", firstName: "Capt", lastName: "A" },
  captB: { email: `e2e_cb_${TAG}@thorx-e2e.local`, password: "E2ePass123!", firstName: "Capt", lastName: "B" },
  memA:  { email: `e2e_ma_${TAG}@thorx-e2e.local`, password: "E2ePass123!", firstName: "Mem",  lastName: "A" },
  memB:  { email: `e2e_mb_${TAG}@thorx-e2e.local`, password: "E2ePass123!", firstName: "Mem",  lastName: "B" },
};
const FOUNDER = { email: "e2e_founder@thorx-e2e.local", password: "E2eFounderPass123!" };

const steps = [];
const consoleErrors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addStep(name, passed, details = "") {
  steps.push({ name, passed, details });
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${details ? " — " + details : ""}`);
}

function sql(q) {
  return execSync(`psql "${DB_URL}" -tAc "${String(q).replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();
}

async function newContext(browser, label) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ label, message: msg.text().slice(0, 300), url: page.url() });
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push({ label, message: "PAGEERROR: " + String(err).slice(0, 300), url: page.url() });
  });
  return { ctx, page, label };
}

/** Session-authenticated in-page fetch with the double-submit CSRF cookie. */
async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    // The helper only runs on real http(s) documents; about:blank throws on
    // document.cookie, so force a same-origin round-trip first in that case.
    let cookieOk = true;
    try { cookieOk = document.cookie.includes("thorx.csrf.v2"); } catch { cookieOk = false; }
    if (!cookieOk) {
      await fetch("/api/health", { credentials: "include" });
      await new Promise((r) => setTimeout(r, 250));
    }
    const csrf =
      document.cookie.split("; ").find((c) => c.startsWith("thorx.csrf.v2="))?.split("=")[1] || "";
    const resp = await fetch(path, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await resp.json(); } catch { data = null; }
    return { status: resp.status, data };
  }, { method, path, body });
}

async function register(page, u) {
  // Ensure the page is on a real document with a session-able origin first
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await sleep(900);
  const r = await api(page, "POST", "/api/register", {
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    password: u.password,
    identity: `E2E_${u.firstName}_${u.lastName}_${TAG}`,
    phone: "0300" + String(Math.floor(10000000 + Math.random() * 89999999)),
  });
  if (r.status >= 400) throw new Error(`register ${u.email} failed: ${JSON.stringify(r.data)}`);
  const me = await api(page, "GET", "/api/user");
  if (me.status !== 200 || me.data?.email !== u.email) {
    throw new Error(`session not established for ${u.email}: ${JSON.stringify(me)}`);
  }
  return me.data;
}

async function loginViaUi(page, email, password) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  // React needs a moment to hydrate; retry tab switch + input discovery.
  let switched = false;
  let inputsMounted = false;
  for (let attempt = 0; attempt < 8 && !inputsMounted; attempt++) {
    await sleep(1200);
    // Radix TabsTrigger ignores synthetic el.click(), so use a real mouse click.
    switched = await mouseClick(page, { selector: '[data-testid="tab-login"]' });
    if (!switched) {
      switched = await page.evaluate(() => {
        const sw = document.querySelector('[data-testid="button-switch-to-login"]');
        if (sw) { sw.click(); return true; }
        return false;
      });
    }
    // The login form mounts after the tab switch — wait for its inputs.
    await page.waitForSelector('[data-testid="input-login-email"]', { timeout: 4000 }).catch(() => {});
    await page.waitForSelector('[data-testid="input-login-password"]', { timeout: 4000 }).catch(() => {});
    inputsMounted = await page.evaluate(
      () => !!document.querySelector('[data-testid="input-login-email"]') && !!document.querySelector('[data-testid="input-login-password"]')
    );
  }
  // Fill the LOGIN tab's inputs via their data-testids (register fields are
  // also in the DOM, hidden, and would otherwise be matched first)
  const filled = await page.evaluate((em, pw) => {
    const emailInput = document.querySelector('[data-testid="input-login-email"]');
    const passInput = document.querySelector('[data-testid="input-login-password"]');
    if (!emailInput || !passInput) return false;
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setVal(emailInput, em);
    setVal(passInput, pw);
    return true;
  }, email, password);
  if (!filled) throw new Error("login form inputs not found");
  await sleep(600);
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="button-login-submit"]');
    if (btn) btn.click();
  });
  await sleep(2200);
  const me = await api(page, "GET", "/api/user");
  if (me.status !== 200 || me.data?.email !== email) {
    throw new Error(`UI login failed for ${email}: ${JSON.stringify(me)}`);
  }
  return me.data;
}

/**
 * Real mouse click at an element's center. Synthetic el.click() does NOT
 * trigger Radix Tabs/Buttons (proven by live probe), so use real input events.
 * selector takes priority; then exact text; then contains fragment.
 */
async function mouseClick(page, { selector = null, text = null, contains = null } = {}) {
  const box = await page.evaluate(({ selector, text, contains }) => {
    const pick = (els, pred) => {
      // Prefer true interactive elements; fall back to any visible node.
      const interactive = els.filter((e) => pred(e) && /^(button|a|li|input|select)$/i.test(e.tagName) && e.offsetParent !== null);
      const anyVisible = els.filter((e) => pred(e) && e.offsetParent !== null);
      return interactive[0] || anyVisible[0] || null;
    };
    let el = selector ? document.querySelector(selector) : null;
    if (!el && text) {
      const els = Array.from(document.querySelectorAll("button, a, [role=tab], [role=button], div, span, li, input, select"));
      el = pick(els, (e) => e.textContent && e.textContent.trim() === text);
    }
    if (!el && contains) {
      const els = Array.from(document.querySelectorAll("button, a, [role=tab], [role=button], div, span, li, input, select"));
      el = pick(els, (e) => e.textContent && e.textContent.toLowerCase().includes(contains.toLowerCase()));
    }
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { selector, text, contains });
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

async function clickExact(page, text) {
  const ok = await mouseClick(page, { text });
  if (!ok) throw new Error(`Could not click exact text: "${text}"`);
  await sleep(1100);
}

/** Click the first visible element whose text CONTAINS the given fragment. */
async function clickContaining(page, fragment, tag = "button") {
  // Retry: the element may mount only after its React Query settles.
  let ok = false;
  for (let attempt = 0; attempt < 8 && !ok; attempt++) {
    ok = await mouseClick(page, { contains: fragment });
    if (!ok) await sleep(1200);
  }
  if (!ok) {
    const head = (await bodyText(page)).slice(0, 300).replace(/\n/g, " | ");
    throw new Error(`Could not click containing: "${fragment}" (${tag}); page: ${head}`);
  }
  await sleep(1200);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

/**
 * The UserPortal is a 6-slot section carousel (dashboard=0, work=1,
 * referrals=2, guild=3, payout=4, help=5). Advance to the Guild (Engine C)
 * section with the next button, then switch to the panel's inner tab.
 */
async function openSection(page, targetIndex = 3) {
  await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  // Wait for the portal to actually mount its section marker + next button
  // (the SPA hydrates async; clicking before mount breaks the loop).
  const order = ["dashboard", "work", "referrals", "guild", "payout", "help"];
  for (let m = 0; m < 10; m++) {
    const ready = await page.evaluate(() =>
      !!document.querySelector('[data-testid^="section-"]') &&
      !!document.querySelector('[data-testid="button-next-section"]')
    );
    if (ready) break;
    await sleep(900);
  }
  let curName = null;
  for (let i = 0; i < 10; i++) {
    const cur = await page.evaluate(() => {
      const active = document.querySelector('[data-testid^="section-"]');
      return active ? active.getAttribute("data-testid") : null;
    });
    curName = cur ? cur.replace(/^section-/, "") : null;
    const idx = order.indexOf(curName);
    if (idx >= targetIndex) break;
    const before = curName;
    const next = await mouseClick(page, { selector: '[data-testid="button-next-section"]' });
    if (!next) {
      // Button not mounted/interactable yet — wait and retry, don't give up.
      await sleep(900);
      continue;
    }
    // Wait for the transition to finish (section marker changes) before advancing.
    for (let w = 0; w < 6; w++) {
      await sleep(500);
      const c2 = await page.evaluate(() => {
        const a = document.querySelector('[data-testid^="section-"]');
        return a ? a.getAttribute("data-testid") : null;
      });
      if (c2 && c2 !== cur) break;
    }
  }
  await sleep(900);
}

async function openWarsTab(page) {
  await openSection(page, 3);
  for (let attempt = 0; attempt < 6; attempt++) {
    const ok = await mouseClick(page, { text: "Wars" });
    if (ok) break;
    await sleep(1100);
  }
  await sleep(900);
}

async function openTasksTab(page) {
  await openSection(page, 3);
  await mouseClick(page, { text: "Tasks" }).catch(() => {});
  await sleep(900);
}

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  // Desktop viewport: the GuildTabBar is overflow-x-auto and at 800px width
  // its right-hand tabs (Wars, Discover, …) sit off-screen where synthetic
  // clicks land on nothing. A 1280px viewport keeps every tab clickable.
  for (const ctx of browser.browserContexts()) {
    for (const p of await ctx.pages()) {
      await p.setViewport({ width: 1280, height: 900 });
    }
  }

  try {
    // ── 0. Sessions ─────────────────────────────────────────────────────────
    const S = {};
    for (const k of ["captA", "captB", "memA", "memB", "founder"]) S[k] = await newContext(browser, k);
    const { page: fPage } = S.founder;

    // ── 1. Register 4 users + founder UI login ──────────────────────────────
    let ids = {};
    for (const k of ["captA", "captB", "memA", "memB"]) {
      const me = await register(S[k].page, USERS[k]);
      ids[k] = me.id;
      addStep(`Register ${USERS[k].email}`, true, `id=${me.id} role=${me.role}`);
    }
    const founderMe = await loginViaUi(fPage, FOUNDER.email, FOUNDER.password);
    addStep("Founder UI login", true, `id=${founderMe.id} role=${founderMe.role}`);

    // ── 2. Guild creation (captains) + onboarding (members) ──────────────────
    const gNameA = `E2E Alpha ${TAG}`;
    const gNameB = `E2E Bravo ${TAG}`;
    const gA = (await api(S.captA.page, "POST", "/api/guilds", { name: gNameA, description: "Deep E2E guild A" })).data.guild;
    const gB = (await api(S.captB.page, "POST", "/api/guilds", { name: gNameB, description: "Deep E2E guild B" })).data.guild;
    addStep("Create guilds", !!gA?.id && !!gB?.id, `A=${gA.id} B=${gB.id}`);

    const cover = "I want to fight for this guild in the E2E regression test - please accept my application, thank you!";
    for (const [memKey, guild] of [["memA", gA], ["memB", gB]]) {
      const app = await api(S[memKey].page, "POST", `/api/guilds/${guild.id}/apply`, { coverLetter: cover });
      if (app.status >= 400) throw new Error(`apply ${memKey}: ${JSON.stringify(app.data)}`);
      const list = await api(S[memKey === "memA" ? "captA" : "captB"].page, "GET", `/api/guilds/${guild.id}/applications`);
      // listPendingGuildApplications already filters to status='pending' and its
      // select has no status column — match on userId alone.
      const pending = (list.data.applications || list.data || []).find((x) => x.userId === ids[memKey]);
      if (!pending) throw new Error(`no pending application for ${memKey}`);
      const dec = await api(S[memKey === "memA" ? "captA" : "captB"].page, "PATCH", `/api/guilds/${guild.id}/applications/${pending.id}`, { action: "accept" });
      if (dec.status >= 400) throw new Error(`accept ${memKey}: ${JSON.stringify(dec.data)}`);
    }
    addStep("Member onboarding (apply + captain accept)", true, "memA→Alpha, memB→Bravo");

    // ── 3. Challenge initiation via the Wars tab UI ──────────────────────────
    await openWarsTab(S.captA.page);
    await clickContaining(S.captA.page, "Initiate Challenge");
    await clickContaining(S.captA.page, gNameB); // opponent card
    await clickContaining(S.captA.page, "Send Challenge");
    await sleep(900);

    let war1 = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}/war`)).data;
    addStep(
      "Captain A initiates challenge (UI)",
      war1?.war?.status === "pending_challenger_approval",
      `status=${war1?.war?.status}`,
    );
    const warId1 = war1.war.id;

    // ── 4. Votes via UI (challenger guild first, then challenged) ────────────
    for (const k of ["captA", "memA", "captB", "memB"]) {
      await openWarsTab(S[k].page);
      const txt = await bodyText(S[k].page);
      // Buttons render uppercase (CSS text-transform): APPROVE / REJECT.
      if (txt.toLowerCase().includes("approve")) {
        await clickContaining(S[k].page, "Approve");
      } else {
        throw new Error(`No Approve button for ${k}; page head: ${txt.slice(0, 200)}`);
      }
    }
    await sleep(900);
    war1 = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}/war`)).data;
    addStep("All 4 members approve → WAR ACTIVE", war1?.war?.status === "active", `status=${war1?.war?.status} war=${warId1}`);

    // ── 5. War Chest block renders (UI) ──────────────────────────────────────
    const chestTxt = (await bodyText(S.captA.page)).toLowerCase();
    const chestOk = chestTxt.includes("war chest") && chestTxt.includes("winner takes both chests") && chestTxt.includes("2% engine a") && chestTxt.includes("never from member earnings");
    addStep("War Chest UI renders (levy note + rules)", chestOk, chestOk ? "chest block visible" : `missing; head: ${chestTxt.slice(0, 300)}`);

    // ── 6. Fund the chests via Engine C task completions ─────────────────────
    const weekStart = new Date(Date.now() - 86400000).toISOString();
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();
    const mkTask = async (title) => {
      const r = await api(fPage, "POST", "/api/admin/weekly-tasks", {
        title, description: "E2E funding task", pointReward: 500,
        weekStart, weekEnd, targetGuildRank: "E", isActive: true,
        grossPkrPerCompletion: "50", taskCategory: "platform",
      });
      if (r.status >= 400) throw new Error(`create task ${title}: ${JSON.stringify(r.data)}`);
      return r.data.task;
    };
    const task1 = await mkTask(`E2E Fund Task 1 ${TAG}`);
    const task2 = await mkTask(`E2E Fund Task 2 ${TAG}`);
    addStep("Founder creates Engine C weekly tasks", !!task1?.id && !!task2?.id);

    const complete = async (k, taskId) => {
      const r = await api(S[k].page, "POST", `/api/guilds/weekly-tasks/${taskId}/complete`, {});
      if (r.status >= 400) throw new Error(`complete ${k} task ${taskId}: ${JSON.stringify(r.data)}`);
      return r.data;
    };
    // memA completes task1 + task2 (2 × 50 gross → 2 × 1.00 into Alpha chest)
    const c1 = await complete("memA", task1.id);
    const c2 = await complete("memA", task2.id);
    // memB completes task1 (1 × 50 gross → 1.00 into Bravo chest)
    const c3 = await complete("memB", task1.id);
    addStep(
      "Engine C completions credit TX-points + war points",
      c1?.earnResult && c2?.earnResult && c3?.earnResult,
      `A1=${c1?.earnResult?.pointsCredited} A2=${c2?.earnResult?.pointsCredited} B1=${c3?.earnResult?.pointsCredited}`,
    );

    await sleep(900);
    const warAfter = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}/war`)).data;
    const chestA = Number(warAfter?.challengerGuild?.warChestPkr ?? 0);
    const chestB = Number(warAfter?.challengedGuild?.warChestPkr ?? 0);
    addStep(
      "War chest funded from THORX's cut (2% of gross)",
      Math.abs(chestA - 2.0) < 0.001 && Math.abs(chestB - 1.0) < 0.001,
      `Alpha chest=Rs.${chestA.toFixed(2)} Bravo chest=Rs.${chestB.toFixed(2)}`,
    );

    // Backend audit: ledger rows show the reduced THORX profit (7.50 − 1.00 levy)
    const ledger = sql(
      `SELECT thorx_profit_pkr, guild_pool_pkr, engine_type FROM user_transactions WHERE source_type='weekly_task' AND user_id IN (SELECT id FROM users WHERE email LIKE 'e2e_ma_${TAG}%' OR email LIKE 'e2e_mb_${TAG}%') ORDER BY created_at DESC LIMIT 3`
    );
    const ledgerOk = /6\.5000/.test(ledger) && /40\.0000/.test(ledger) && /Engine_C/.test(ledger);
    addStep("Ledger audit: THORX profit reduced by the levy (6.50 vs 7.50 gross-cut)", ledgerOk, ledger.replace(/\n/g, " | "));

    // ── 7. Admin resolution → winner takes BOTH chests ───────────────────────
    // The weekly bonus pools already hold the Engine C contributions (80% of
    // gross per completion: 40.00 each) — assert the PRIZE as a delta on top.
    const preRes = await Promise.all([
      api(S.captA.page, "GET", `/api/guilds/${gA.id}`),
      api(S.captB.page, "GET", `/api/guilds/${gB.id}`),
    ]);
    const prePoolA = Number(preRes[0].data.guild.weeklyBonusPool);
    const prePoolB = Number(preRes[1].data.guild.weeklyBonusPool);
    const res1 = (await api(fPage, "PATCH", `/api/admin/guild-wars/wars/${warId1}/resolve`, {})).data;
    const winnerOk = res1?.winnerId === gA.id && !res1?.isDraw;
    addStep("Admin resolve: Alpha wins (higher score)", winnerOk, `winner=${res1?.winnerId} prize=${res1?.prizePkr}`);

    const postWar = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}/war`)).data;
    const gArow = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}`)).data.guild;
    const gBrow = (await api(S.captB.page, "GET", `/api/guilds/${gB.id}`)).data.guild;
    const prizeOk =
      postWar?.war?.status === "completed" &&
      Math.abs(Number(postWar.war.prizePkr) - 3.0) < 0.001 &&
      Math.abs(Number(gArow.warChestPkr)) < 0.001 &&
      Math.abs(Number(gBrow.warChestPkr)) < 0.001 &&
      Math.abs(Number(gArow.weeklyBonusPool) - (prePoolA + 3.0)) < 0.001 &&
      Math.abs(Number(gBrow.weeklyBonusPool) - prePoolB) < 0.001;
    addStep(
      "Prize = both chests (3.00) credited to winner's pool; chests zeroed",
      prizeOk,
      `prize=${postWar?.war?.prizePkr} A.chest=${gArow.warChestPkr} B.chest=${gBrow.warChestPkr} A.pool=${gArow.weeklyBonusPool} (${prePoolA}+3) B.pool=${gBrow.weeklyBonusPool} (${prePoolB})`,
    );

    // UI: COMPLETED chip + winner banner + prize
    await openWarsTab(S.captA.page);
    const resultTxt = (await bodyText(S.captA.page)).toLowerCase();
    const uiOk = resultTxt.includes("completed") && resultTxt.includes("wins the war") && resultTxt.includes("prize: rs.3");
    addStep("Wars tab UI shows COMPLETED + winner banner + prize Rs.3", uiOk, uiOk ? "all present" : `head: ${resultTxt.slice(0, 400)}`);

    // ── 8. Bonus: second war → DRAW → each guild keeps its own chest ─────────
    try {
      // War 2 via the same challenge endpoint the UI calls — after a completed
      // war the panel shows the result view with no new-challenge action (UI
      // initiation was already covered end-to-end in war 1).
      const ch2 = (await api(S.captA.page, "POST", `/api/guilds/${gA.id}/war/challenge`, { challengedGuildId: gB.id })).data;
      if (!ch2?.war?.id) throw new Error(`war 2 challenge failed: ${JSON.stringify(ch2)}`);
      await sleep(900);
      let war2 = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}/war`)).data;
      const warId2 = war2.war.id;
      // Votes via the same endpoint the UI Approve button calls — UI voting
      // was already covered end-to-end in war 1; this keeps the suite fast.
      for (const k of ["captA", "memA", "captB", "memB"]) {
        const v = await api(S[k].page, "POST", `/api/guilds/${gA.id}/war/${warId2}/vote`, { approved: true });
        if (v.status >= 400) throw new Error(`vote ${k} (war 2): ${JSON.stringify(v.data)}`);
      }
      await sleep(1200);
      const task3 = await mkTask(`E2E Fund Task 3 ${TAG}`);
      await complete("memA", task3.id);
      await complete("memB", task3.id);
      // Equalize scores deterministically (card variance is random) so this war resolves as a draw
      sql(`UPDATE guild_wars SET challenged_score = challenger_score WHERE id = '${warId2}'`);
      const res2 = (await api(fPage, "PATCH", `/api/admin/guild-wars/wars/${warId2}/resolve`, {})).data;
      const gArow2 = (await api(S.captA.page, "GET", `/api/guilds/${gA.id}`)).data.guild;
      const gBrow2 = (await api(S.captB.page, "GET", `/api/guilds/${gB.id}`)).data.guild;
      // Deltas (baseline = post-war-1 pools gArow/gBrow, which already include
      // war-1's prize on Alpha): one completion each credits 40.00 to the pool;
      // on a draw each guild keeps its own chest (1.00) back.
      const basePoolA = Number(gArow.weeklyBonusPool);
      const basePoolB = Number(gBrow.weeklyBonusPool);
      const drawOk =
        res2?.isDraw === true && res2?.winnerId === null &&
        Math.abs(Number(gArow2.warChestPkr)) < 0.001 &&
        Math.abs(Number(gBrow2.warChestPkr)) < 0.001 &&
        Math.abs(Number(gArow2.weeklyBonusPool) - (basePoolA + 40 + 1)) < 0.001 &&
        Math.abs(Number(gBrow2.weeklyBonusPool) - (basePoolB + 40 + 1)) < 0.001;
      await openWarsTab(S.captA.page);
      const drawTxt = (await bodyText(S.captA.page)).toLowerCase();
      const drawUi = drawTxt.includes("ended in a draw") && drawTxt.includes("each guild kept its own chest");
      addStep("Bonus draw war: chests returned to own pools", drawOk && drawUi, `isDraw=${res2?.isDraw} winner=${String(res2?.winnerId)} A.chest=${gArow2.warChestPkr} B.chest=${gBrow2.warChestPkr} A.pool=${gArow2.weeklyBonusPool} (base ${basePoolA}+41) B.pool=${gBrow2.weeklyBonusPool} (base ${basePoolB}+41) ui=${drawUi}`);
    } catch (e) {
      addStep("Bonus draw war", false, e.message);
    }

    // ── 9. Console / page-error audit ────────────────────────────────────────
    // Benign: the dashboard prefetches admin-only config endpoints a normal
    // user cannot access (403), and one system-config path that 404s — neither
    // is a real error for the player-facing flows under test.
    const benign = (m) =>
      /favicon|Download the React DevTools|404|401|403|net::|ERR_|WebSocket.*failed|websocket|\/api\/config\/|\/api\/system-config\//i.test(m || "");
    const real = consoleErrors.filter((e) => !benign(e.message));
    addStep("Console error audit (no uncaught errors)", real.length === 0, `${real.length} real error(s) of ${consoleErrors.length} total`);

    const failed = steps.filter((s) => !s.passed);
    console.log(
      JSON.stringify(
        { overallStatus: failed.length ? "failure" : "passed", passed: steps.filter((s) => s.passed).length, failed: failed.length, steps, consoleErrors },
        null,
        2,
      )
    );
  } catch (err) {
    steps.push({ name: "Fatal", passed: false, details: err.message });
    console.error("FATAL:", err);
    console.log(JSON.stringify({ overallStatus: "failure", steps, consoleErrors }, null, 2));
  } finally {
    await browser.close();
  }
};

run();
