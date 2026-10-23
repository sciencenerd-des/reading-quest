/* Reading Quest engine: pure functions that turn data/reading.json into stats.
   Used by the browser (window.ReadingEngine) and by node (stats.js). */
(function (root) {
  "use strict";
  // ---------- constants ----------
  const XP = { page: 1, chapter: 15, minutesPerXp: 2, goalMet: 10, bookFinished: 200 };
  const LEVELS = [
    [0, "Spine Cracker"], [100, "Page Turner"], [250, "Chapter Chaser"], [450, "Dog-Ear Devotee"],
    [700, "Margin Scribbler"], [1000, "Lamp-Light Regular"], [1400, "Plot Hunter"], [1900, "Shelf Builder"],
    [2500, "Bookworm"], [3200, "Story Cartographer"], [4000, "Tome Tamer"], [5000, "Archivist"],
    [6200, "Lorekeeper"], [7600, "Bibliophile"], [9200, "Grand Librarian"], [11000, "Keeper of Ten Thousand Pages"],
    [13500, "Living Library"]
  ];
  const BOOK_MILESTONES = [1, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  const MAX_FREEZES = 2;
  const DAY = 86400000;

  // ---------- date helpers (dates are 'YYYY-MM-DD' strings, handled in UTC to avoid DST drift) ----------
  const toDate = s => new Date(s + "T00:00:00Z");
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  const weekday = s => (toDate(s).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const mondayOf = s => addDays(s, -weekday(s));
  const fmt = (s, opts = { day: "numeric", month: "short" }) =>
    toDate(s).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
  const todayIn = tz => {
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("today") : (typeof process !== "undefined" ? process.env.RQ_TODAY : null);
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    try { return new Date().toLocaleDateString("en-CA", { timeZone: tz }); }
    catch { return iso(new Date()); }
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, w, p = w + "s") => `${n} ${n === 1 ? w : p}`;

  // ---------- core computation ----------
  function compute(data, todayOverride) {
    const s = data.settings || {};
    const g = Object.assign({ startPages: 10, startMinutes: 15, weeklyIncrease: 0.1, daysToLevelUp: 5, capPages: 50, capMinutes: 60 }, s.goal || {});
    const today = todayOverride || todayIn(s.timezone || "Asia/Kolkata");
    const books = data.books || [];
    const bookById = Object.fromEntries(books.map(b => [b.id, b]));
    const log = (data.log || []).slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")));

    // per-day totals
    const days = {};
    for (const e of log) {
      const d = days[e.date] ||= { pages: 0, chapters: 0, minutes: 0, entries: [] };
      d.pages += +e.pages || 0; d.chapters += +e.chapters || 0; d.minutes += +e.minutes || 0; d.entries.push(e);
    }
    const isRead = d => !!days[d] && (days[d].pages > 0 || days[d].minutes > 0 || days[d].chapters > 0);
    const start = log.length ? log[0].date : today;

    // progressive goal: one 7-day block at a time from the first log date
    const weeks = [];
    let gp = g.startPages, gm = g.startMinutes;
    for (let w = 0; ; w++) {
      const ws = addDays(start, w * 7);
      if (ws > today) break;
      const we = addDays(ws, 6);
      let met = 0, read = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i);
        if (d > today) break;
        const t = days[d];
        if (t && isRead(d)) read++;
        if (t && (t.pages >= gp || t.minutes >= gm)) met++;
      }
      const complete = we < today;
      const leveled = complete && met >= g.daysToLevelUp;
      weeks.push({ index: w, start: ws, end: we, pages: gp, minutes: gm, met, read, complete, leveled, capped: gp >= g.capPages && gm >= g.capMinutes });
      if (leveled) {
        gp = Math.min(g.capPages, Math.max(gp + 1, Math.round(gp * (1 + g.weeklyIncrease))));
        gm = Math.min(g.capMinutes, Math.max(gm + 1, Math.round(gm * (1 + g.weeklyIncrease))));
      }
    }
    const goalFor = d => weeks[Math.max(0, Math.min(weeks.length - 1, Math.floor(diffDays(start, d) / 7)))] || { pages: g.startPages, minutes: g.startMinutes };
    const curWeek = weeks[weeks.length - 1];
    const dayMet = d => { const t = days[d]; if (!t) return false; const w = goalFor(d); return t.pages >= w.pages || t.minutes >= w.minutes; };

    // streak with freezes
    let streak = 0, longest = 0, freezes = 0, earned = 0;
    const frozen = new Set();
    for (let d = start; d <= today; d = addDays(d, 1)) {
      if (isRead(d)) {
        streak++;
        if (streak % 7 === 0) { earned++; if (freezes < MAX_FREEZES) freezes++; }
      } else if (d === today) {
        // today isn't over yet
      } else if (streak > 0 && freezes > 0) {
        freezes--; frozen.add(d);
      } else {
        streak = 0;
      }
      longest = Math.max(longest, streak);
    }
    const readToday = isRead(today);
    const toNextFreeze = 7 - (streak % 7);

    // books
    const progress = {};
    for (const e of log) {
      const p = progress[e.book] ||= { pages: 0, chapters: 0, minutes: 0 };
      p.pages += +e.pages || 0; p.chapters += +e.chapters || 0; p.minutes += +e.minutes || 0;
    }
    const finished = books.filter(b => b.status === "finished").sort((a, b) => String(a.finished).localeCompare(String(b.finished)));
    const reading = books.filter(b => b.status === "reading");
    const next = books.filter(b => b.status === "next");
    const year = today.slice(0, 4);
    const finishedThisYear = finished.filter(b => String(b.finished || "").startsWith(year)).length;

    // XP
    let xp = 0;
    for (const e of log) xp += (+e.pages || 0) * XP.page + (+e.chapters || 0) * XP.chapter + Math.floor((+e.minutes || 0) / XP.minutesPerXp);
    const metDays = Object.keys(days).filter(dayMet);
    xp += metDays.length * XP.goalMet + finished.length * XP.bookFinished;
    let li = 0; for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i][0]) li = i;
    const level = { n: li + 1, title: LEVELS[li][1], floor: LEVELS[li][0], next: LEVELS[li + 1] ? LEVELS[li + 1][0] : null, nextTitle: LEVELS[li + 1] ? LEVELS[li + 1][1] : null };

    // calendar weeks (Mon–Sun)
    const calWeek = ws => {
      const r = { start: ws, pages: 0, minutes: 0, chapters: 0, read: 0, met: 0, days: [] };
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i), t = days[d];
        r.days.push({ date: d, pages: t ? t.pages : 0, minutes: t ? t.minutes : 0, future: d > today });
        if (t) { r.pages += t.pages; r.minutes += t.minutes; r.chapters += t.chapters; if (isRead(d)) r.read++; if (dayMet(d)) r.met++; }
      }
      return r;
    };
    const thisWeek = calWeek(mondayOf(today));
    const lastWeek = calWeek(addDays(mondayOf(today), -7));
    let bestWeekPages = 0;
    for (let ws = mondayOf(start); ws <= today; ws = addDays(ws, 7)) bestWeekPages = Math.max(bestWeekPages, calWeek(ws).pages);

    const totals = { pages: 0, chapters: 0, minutes: 0 };
    for (const t of Object.values(days)) { totals.pages += t.pages; totals.chapters += t.chapters; totals.minutes += t.minutes; }
    const timeOf = e => String(e.time || "");
    const nightOwl = log.some(e => { const t = timeOf(e); return t && (t >= "23:00" || t < "04:00"); });
    const earlyBird = log.some(e => { const t = timeOf(e); return t && t >= "04:00" && t < "07:00"; });
    const halfway = books.some(b => { const p = progress[b.id]; if (!p) return false; return b.totalPages ? p.pages / b.totalPages >= 0.5 : b.totalChapters ? p.chapters / b.totalChapters >= 0.5 : false; }) || finished.length > 0;

    const badges = [
      { id: "first-chapter", icon: "🔖", name: "First Chapter", desc: "Finish a chapter.", got: totals.chapters >= 1 },
      { id: "streak-3", icon: "🕯️", name: "Kindling", desc: "3-day streak.", got: longest >= 3, prog: [Math.min(longest, 3), 3] },
      { id: "streak-7", icon: "🔥", name: "Steady Flame", desc: "7-day streak.", got: longest >= 7, prog: [Math.min(longest, 7), 7] },
      { id: "streak-30", icon: "🌕", name: "Unbroken Moon", desc: "30-day streak.", got: longest >= 30, prog: [Math.min(longest, 30), 30] },
      { id: "goal-week", icon: "📈", name: "Level-Up Week", desc: "Hit the goal 5 of 7 days.", got: weeks.some(w => w.met >= g.daysToLevelUp) },
      { id: "century-week", icon: "💯", name: "Century Week", desc: "100 pages in one week (Mon–Sun).", got: bestWeekPages >= 100, prog: [Math.min(bestWeekPages, 100), 100] },
      { id: "deep-dive", icon: "🤿", name: "Deep Dive", desc: "60 minutes in one day.", got: Object.values(days).some(t => t.minutes >= 60) },
      { id: "halfway", icon: "🧭", name: "Halfway There", desc: "Reach the middle of a book.", got: halfway },
      { id: "first-book", icon: "🏁", name: "The End", desc: "Finish your first book.", got: finished.length >= 1 },
      { id: "five-books", icon: "📚", name: "Shelf of Five", desc: "Finish 5 books.", got: finished.length >= 5, prog: [Math.min(finished.length, 5), 5] },
      { id: "night-owl", icon: "🦉", name: "Night Owl", desc: "Read after 11 PM.", got: nightOwl },
      { id: "early-bird", icon: "🌅", name: "Early Bird", desc: "Read before 7 AM.", got: earlyBird },
      { id: "ice", icon: "🧊", name: "Saved by Ice", desc: "A streak freeze kept your streak alive.", got: frozen.size > 0 },
      { id: "year-goal", icon: "🏆", name: "Year Complete", desc: `Finish ${s.yearlyGoal || 12} books in a year.`, got: finishedThisYear >= (s.yearlyGoal || 12) }
    ];

    return { data, s, g, today, start, days, log, weeks, curWeek, goalFor, dayMet, isRead, streak, longest, freezes, earned, frozen, readToday, toNextFreeze,
      books, bookById, progress, finished, reading, next, year, finishedThisYear, xp, level, thisWeek, lastWeek, bestWeekPages, totals, badges };
  }

  const api = { compute, XP, LEVELS, BOOK_MILESTONES, MAX_FREEZES, addDays, diffDays, weekday, mondayOf, fmt, esc, plural };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ReadingEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
