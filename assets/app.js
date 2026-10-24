/* Reading Quest: everything is computed from data/reading.json. */
(() => {
  "use strict";

  const { compute, hue, fallbackCover, coverSrc, XP, MAX_FREEZES, BOOK_MILESTONES, addDays, diffDays, weekday, mondayOf, fmt, esc, plural } = window.ReadingEngine;
  const $ = id => document.getElementById(id);

  // ---------- rendering ----------
  function ring(pct, label, sub, cls = "") {
    const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct));
    return `<div class="ring ${cls}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="${r}"/><circle class="fill" cx="60" cy="60" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="ring-txt"><b>${label}</b><span>${sub}</span></div></div>`;
  }

  function render(S) {
    const t = S.days[S.today] || { pages: 0, minutes: 0, chapters: 0 };
    const goal = S.curWeek;
    const met = S.dayMet(S.today);
    const pctP = goal.pages ? t.pages / goal.pages : 0, pctM = goal.minutes ? t.minutes / goal.minutes : 0;
    const pct = Math.max(pctP, pctM);

    // header
    const name = S.data.reader || "Reader";
    $("hello").textContent = met ? `Goal met, ${name}. Anything more is a bonus.`
      : S.streak > 0 && !S.readToday ? `Keep the ${S.streak}-day streak going tonight.`
      : S.readToday ? `Good start today, ${name}.` : `Tonight's page is waiting, ${name}.`;
    $("tagline").textContent = met ? "The habit is built on days like this, not on big ones."
      : `${Math.max(0, goal.pages - t.pages)} more pages or ${Math.max(0, goal.minutes - t.minutes)} more minutes clears today.`;

    const span = S.level.next ? S.level.next - S.level.floor : 1;
    const into = S.xp - S.level.floor;
    $("levelCard").innerHTML = `
      <div class="lvl-badge">${S.level.n}</div>
      <div class="lvl-info"><span class="muted small">Level ${S.level.n}</span><strong>${esc(S.level.title)}</strong>
      <div class="bar thin"><i style="width:${S.level.next ? Math.min(100, into / span * 100) : 100}%"></i></div>
      <span class="muted small mono">${S.xp.toLocaleString("en-IN")} XP${S.level.next ? ` · ${S.level.next - S.xp} to ${esc(S.level.nextTitle)}` : " · max level"}</span></div>`;

    // today
    $("todayCard").innerHTML = `
      <div class="card-head"><h2>Today's goal</h2><span class="pill ${met ? "green" : "amber"}">${met ? "✓ met" : "open"}</span></div>
      <div class="today-body">
        ${ring(pct, met ? "✓" : Math.round(pct * 100) + "%", met ? "done" : "of goal", met ? "done" : "")}
        <div>
          <p class="goal-line"><b class="big">${goal.pages}</b> pages <span class="muted">or</span> <b class="big">${goal.minutes}</b> min</p>
          <p class="muted small">Today: ${plural(t.pages, "page")} · ${t.minutes} min · ${plural(t.chapters, "chapter")}</p>
          <p class="muted small">Goal week ${goal.index + 1} (${fmt(goal.start)}–${fmt(goal.end)}): met ${goal.met}/7 so far. ${goal.capped ? "You're at the cap: keep it steady." : `Hit it on ${S.g.daysToLevelUp} of 7 days and next week's goal grows ~10%.`}</p>
        </div>
      </div>`;

    // streak
    const flames = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(S.today, i - 6);
      const cls = S.isRead(d) ? (S.dayMet(d) ? "on met" : "on") : S.frozen.has(d) ? "ice" : d === S.today ? "wait" : "";
      return `<span class="dot ${cls}" title="${fmt(d, { weekday: "short", day: "numeric", month: "short" })}">${"MTWTFSS"[weekday(d)]}</span>`;
    }).join("");
    $("streakCard").innerHTML = `
      <div class="card-head"><h2>Streak</h2><span class="muted small">best ${plural(S.longest, "day")}</span></div>
      <div class="streak-num"><span class="flame">🔥</span><b>${S.streak}</b><span>${S.streak === 1 ? "day" : "days"}</span></div>
      <div class="dots">${flames}</div>
      <p class="muted small">${S.readToday ? "Today counted." : S.streak ? "Read anything today to keep it." : "Read anything today to start one."}
      🧊 <b>${S.freezes}</b>/${MAX_FREEZES} freezes banked · next in ${plural(S.toNextFreeze, "day")}.</p>`;

    // current book
    const cb = S.reading[0];
    if (cb) {
      const p = S.progress[cb.id] || { pages: 0, chapters: 0, minutes: 0 };
      const unit = cb.chapterLabel || "chapter";
      const done = Math.min(p.chapters, cb.totalChapters || p.chapters);
      const curCh = cb.totalChapters ? Math.min(cb.totalChapters, done + 1) : done + 1;
      const pctBook = cb.totalPages ? p.pages / cb.totalPages : cb.totalChapters ? done / cb.totalChapters : 0;
      const remain = cb.totalPages ? Math.max(0, cb.totalPages - p.pages) : null;
      const eta = remain != null ? addDays(S.today, Math.ceil(remain / goal.pages)) : null;
      const ticks = cb.totalChapters ? Array.from({ length: cb.totalChapters }, (_, i) =>
        `<i class="${i < done ? "done" : i === done ? "now" : ""}" title="${esc(cap(unit))} ${i + 1}"></i>`).join("") : "";
      $("currentCard").innerHTML = `
        <div class="card-head"><h2>Now reading</h2><span class="muted small">${cb.currentRead && cb.currentRead.n > 1 ? `<span class="pill amber">re-read #${cb.currentRead.n}</span> ` : ""}since ${fmt((cb.currentRead || {}).started || cb.started || S.start)}</span></div>
        <div class="book-now">
          ${coverImg(cb, "cover")}
          <div class="book-meta">
            <h3>${esc(cb.title)}</h3><p class="muted">${esc(cb.author)}${cb.edition ? ` · <span class="small">${esc(cb.edition)}</span>` : ""}</p>
            <p class="chapter-now">${esc(cap(unit))} <b>${curCh}</b>${cb.totalChapters ? ` of ${cb.totalChapters}` : ""} <span class="muted">· ${plural(done, unit)} done${cb.totalPages ? ` · ${p.pages} of ${cb.totalPages} pages` : ""}</span></p>
            <div class="bar"><i style="width:${(pctBook * 100).toFixed(1)}%"></i><em>${Math.round(pctBook * 100)}%</em></div>
            ${ticks ? `<div class="ticks" aria-label="chapters">${ticks}</div>` : ""}
            ${eta ? `<p class="muted small">At ${goal.pages} pages a day you'd finish around <b>${fmt(eta, { day: "numeric", month: "short", year: "numeric" })}</b>. Finishing is worth +${XP.bookFinished} XP.</p>` : ""}
          </div>
        </div>`;
    } else {
      $("currentCard").innerHTML = `<div class="card-head"><h2>Now reading</h2></div><p class="muted">Nothing on the go. Pick one from Next up and tell Robin.</p>`;
    }

    // week
    const tw = S.thisWeek, lw = S.lastWeek;
    const maxP = Math.max(1, ...tw.days.map(d => d.pages), goal.pages);
    const delta = (a, b, unit) => { const d = a - b; return b === 0 && a === 0 ? "" : `<span class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲" : "▼"} ${Math.abs(d)}${unit}</span>`; };
    $("weekCard").innerHTML = `
      <div class="card-head"><h2>This week</h2><span class="muted small">${fmt(tw.start)} – ${fmt(addDays(tw.start, 6))}</span></div>
      <div class="stats">
        <div><b>${tw.pages}</b><span>pages ${delta(tw.pages, lw.pages, "")}</span></div>
        <div><b>${tw.minutes}</b><span>minutes ${delta(tw.minutes, lw.minutes, "")}</span></div>
        <div><b>${tw.chapters}</b><span>chapters</span></div>
        <div><b>${tw.read}<small>/7</small></b><span>days read</span></div>
      </div>
      <div class="bars">${tw.days.map(d => `<div class="bcol ${d.future ? "future" : ""} ${d.date === S.today ? "is-today" : ""}" title="${fmt(d.date)}: ${d.pages} pages, ${d.minutes} min"><i style="height:${Math.max(d.pages ? 6 : 0, d.pages / maxP * 100)}%"></i><span>${"MTWTFSS"[weekday(d.date)]}</span></div>`).join("")}
        <div class="goal-mark" style="bottom:calc(20px + ${(goal.pages / maxP).toFixed(3)} * 100px)"><span>goal</span></div></div>
      <p class="muted small">Goal met ${tw.met} of 7 days · best week so far ${S.bestWeekPages} pages · all-time ${S.totals.pages} pages, ${S.totals.chapters} chapters, ${S.totals.minutes} min.</p>`;

    // quests
    const nf = S.finishedCount;
    const nextMs = BOOK_MILESTONES.find(m => m > nf) || nf + 25;
    const prevMs = [...BOOK_MILESTONES].reverse().find(m => m <= nf) || 0;
    const yg = S.s.yearlyGoal || 12;
    const yearStart = `${S.year}-01-01`;
    const yearDays = diffDays(yearStart, `${+S.year + 1}-01-01`);
    const expected = yg * (diffDays(yearStart, S.today) + 1) / yearDays;
    $("questCard").innerHTML = `
      <div class="card-head"><h2>Quests</h2></div>
      <div class="quest">
        <div class="q-top"><span>📘 Next milestone: <b>${plural(nextMs, "book")}</b></span><span class="mono">${nf}/${nextMs}</span></div>
        <div class="bar"><i style="width:${((nf - prevMs) / (nextMs - prevMs) * 100).toFixed(1)}%"></i></div>
        <p class="muted small">${nf === 0 ? `Finish ${esc((S.reading[0] || {}).title || "a book")} to open the shelf.` : `${plural(nextMs - nf, "book")} to go.`}</p>
      </div>
      <div class="quest">
        <div class="q-top"><span>🗓️ ${S.year} challenge: <b>${yg} books</b></span><span class="mono">${S.finishedThisYear}/${yg}</span></div>
        <div class="bar teal"><i style="width:${Math.min(100, S.finishedThisYear / yg * 100).toFixed(1)}%"></i><b class="pace" style="left:${Math.min(100, expected / yg * 100).toFixed(1)}%" title="on-pace marker"></b></div>
        <p class="muted small">${S.finishedThisYear >= yg ? "Done. Raise the bar next year." : S.finishedThisYear >= Math.floor(expected) ? "On pace." : `The marker shows where an even pace would be. Late starts are fine: the goal resets on 1 Jan ${+S.year + 1}.`}</p>
      </div>
      <div class="quest">
        <div class="q-top"><span>🧊 Bank a streak freeze</span><span class="mono">${S.streak % 7}/7</span></div>
        <div class="bar ice"><i style="width:${(S.streak % 7) / 7 * 100}%"></i></div>
        <p class="muted small">Every 7 days in a row earns one freeze (max ${MAX_FREEZES}). A freeze covers one missed day automatically.</p>
      </div>`;

    // heatmap: 26 weeks ending this week
    const hmStart = addDays(mondayOf(S.today), -25 * 7);
    let cells = "", months = "", lastMonth = "";
    for (let w = 0; w < 26; w++) {
      const ws = addDays(hmStart, w * 7);
      const m = fmt(ws, { month: "short" });
      months += `<span style="grid-column:${w + 2}">${m !== lastMonth ? m : ""}</span>`; lastMonth = m;
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i), x = S.days[d];
        const score = x ? x.pages + x.minutes / 1.5 : 0;
        const lvl = !x || score === 0 ? (x && x.chapters ? 1 : 0) : score < 10 ? 1 : score < 25 ? 2 : score < 45 ? 3 : 4;
        const cls = d > S.today ? "future" : S.frozen.has(d) ? "frozen" : "l" + lvl;
        const tip = `${fmt(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}: ${x ? `${x.pages} pages, ${x.minutes} min` : S.frozen.has(d) ? "freeze used" : "no reading"}`;
        cells += `<i class="${cls}${d === S.today ? " today" : ""}" style="grid-column:${w + 2};grid-row:${i + 2}" title="${tip}"></i>`;
      }
    }
    const rowLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"].map((l, i) => `<span class="rl" style="grid-row:${i + 2}">${l}</span>`).join("");
    $("heatmap").innerHTML = `<div class="months">${months}</div>${rowLabels}${cells}`;
    const daysRead = Object.keys(S.days).filter(S.isRead).length;
    $("heatSummary").textContent = `${plural(daysRead, "day")} read since ${fmt(S.start, { day: "numeric", month: "short", year: "numeric" })}`;

    // badges
    $("badges").innerHTML = S.badges.map(b => `
      <div class="badge ${b.got ? "got" : ""}" title="${esc(b.desc)}">
        <span class="b-icon">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
        ${!b.got && b.prog ? `<div class="bar thin"><i style="width:${b.prog[0] / b.prog[1] * 100}%"></i></div><small class="mono">${b.prog[0]}/${b.prog[1]}</small>` : ""}
      </div>`).join("");
    $("badgeCount").textContent = `${S.badges.filter(b => b.got).length} of ${S.badges.length} earned`;

    // shelf
    $("shelfCard").innerHTML = `<div class="card-head"><h2>Bookshelf</h2><span class="muted small">${plural(nf, "book")} finished</span></div>
      ${nf ? `<div class="shelf">${S.finished.map(b => `<figure class="shelf-book" title="${esc(b.title)} · ${esc(b.author)} · finished ${fmt(b.lastFinished, { day: "numeric", month: "short", year: "numeric" })}${b.timesFinished > 1 ? ` · read ${b.timesFinished}×` : ""}">${coverImg(b, "")}${b.timesFinished > 1 ? `<span class="times">×${b.timesFinished}</span>` : ""}</figure>`).join("")}</div><div class="plank"></div>`
        : `<div class="shelf empty">${cb ? `<figure class="shelf-book reserved" title="Reserved for ${esc(cb.title)}">${coverImg(cb, "")}<figcaption>reserved</figcaption></figure>` : ""}${Array.from({ length: cb ? 3 : 4 }, () => `<div class="slot"></div>`).join("")}</div><div class="plank"></div><p class="muted small">Empty for now. ${cb ? `The first slot is saved for ${esc(cb.title)}.` : "Your first finished book goes here."}</p>`}`;

    // next up
    $("nextCard").innerHTML = `<div class="card-head"><h2>Next up</h2><span class="muted small">${plural(S.next.length, "book")}</span></div>
      ${S.next.length ? `<ol class="next">${S.next.map(b => `<li>${coverImg(b, "mini-cover")}<div><b>${esc(b.title)}</b><span class="muted small">${esc(b.author)}${b.translator ? `, tr. ${esc(b.translator)}` : ""}${b.totalChapters ? ` · ${plural(b.totalChapters, b.chapterLabel || "chapter")}` : ""}${b.totalPages ? ` · ${b.totalPages} pp` : ""}</span></div><span class="pill">#${S.next.indexOf(b) + 1}</span></li>`).join("")}</ol>` : `<p class="muted">Tell Robin what you want to read next.</p>`}
      <p class="muted small">In reading order. Tell Robin to reorder or add more.</p>`;

    // recent log
    const recent = S.log.slice().reverse().slice(0, 8);
    $("logCard").innerHTML = `<div class="card-head"><h2>Reading log</h2><span class="muted small">latest ${recent.length}</span></div>
      <ul class="log">${recent.map(e => `<li><span class="mono date">${fmt(e.date, { day: "2-digit", month: "short" })}</span>
        <div><b>${esc((S.bookById[e.book] || {}).title || e.book)}</b><span class="muted small">${[e.pages ? plural(e.pages, "page") : "", e.chapters ? plural(e.chapters, "chapter") : "", e.minutes ? e.minutes + " min" : "", e.time ? "at " + e.time : ""].filter(Boolean).join(" · ")}</span>
        ${e.note ? `<p class="note">${esc(e.note)}</p>` : ""}</div></li>`).join("")}</ul>`;

    $("updated").textContent = `Data as of ${fmt(S.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · tracking since ${fmt(S.start, { day: "numeric", month: "short", year: "numeric" })}`;
    window.__READING_QUEST__ = { today: S.today, goal: { pages: goal.pages, minutes: goal.minutes, met }, streak: S.streak, longest: S.longest, freezes: S.freezes, xp: S.xp, level: S.level, badges: S.badges.filter(b => b.got).map(b => b.name) };
  }

  const coverImg = (b, cls, extra = "") => `<img class="${cls}" src="${esc(coverSrc(b))}" data-fallback="${esc(fallbackCover(b))}" alt="Cover art: ${esc(b.title)}" loading="lazy" ${extra}>`;
  // if a cover file is missing, swap in the generated one
  document.addEventListener("error", ev => { const el = ev.target; if (el.tagName === "IMG" && el.dataset.fallback && el.src !== el.dataset.fallback) el.src = el.dataset.fallback; }, true);

  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  // ---------- pending quick log (localStorage only) ----------
  const PKEY = "reading-quest-pending";
  const loadPending = () => { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch { return []; } };
  const savePending = v => localStorage.setItem(PKEY, JSON.stringify(v));
  function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2200); }
  function pendingText(p) { return `Robin, log my reading for ${p.date}${p.time ? " at " + p.time : ""}: ${[p.pages && plural(p.pages, "page"), p.chapters && plural(p.chapters, "chapter"), p.minutes && p.minutes + " min"].filter(Boolean).join(", ") || "some reading"}${p.note ? `. Note: ${p.note}` : ""}`; }
  function renderPending() {
    const list = loadPending();
    $("pendingList").innerHTML = list.map((p, i) => `<li><span>${esc(pendingText(p))}</span><span class="acts"><button data-copy="${i}">Copy</button><button data-del="${i}" class="ghost">Remove</button></span></li>`).join("");
  }
  function setupPending(today) {
    $("quickForm").addEventListener("submit", ev => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const p = { date: today, time: new Date().toTimeString().slice(0, 5), pages: +f.get("pages") || 0, chapters: +f.get("chapters") || 0, minutes: +f.get("minutes") || 0, note: String(f.get("note") || "").trim() };
      if (!p.pages && !p.chapters && !p.minutes) { toast("Add pages, chapters or minutes first."); return; }
      const list = loadPending(); list.push(p); savePending(list); ev.target.reset(); renderPending();
      toast("Saved here as pending. Tell Robin to make it count.");
    });
    $("pendingList").addEventListener("click", ev => {
      const c = ev.target.dataset.copy, d = ev.target.dataset.del, list = loadPending();
      if (c != null) { navigator.clipboard?.writeText(pendingText(list[c])).then(() => toast("Copied. Paste it to Robin."), () => toast("Copy failed. Select the text instead.")); }
      if (d != null) { list.splice(+d, 1); savePending(list); renderPending(); }
    });
    renderPending();
  }

  // ---------- tabs (hash routing: #quest / #journal / #reviews) ----------
  function setupTabs() {
    const show = () => {
      const tab = ["#reviews", "#journal"].includes(location.hash) ? location.hash.slice(1) : "quest";
      $("questView").hidden = tab !== "quest"; $("reviewsView").hidden = tab !== "reviews"; $("journalView").hidden = tab !== "journal";
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    };
    window.addEventListener("hashchange", () => { show(); window.scrollTo({ top: 0 }); });
    show();
  }

  // ---------- boot ----------
  fetch("data/reading.json", { cache: "no-store" })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => { const S = compute(data); render(S); setupPending(S.today); window.ReviewsView.bind(S); window.JournalView.bind(S); setupTabs(); document.body.classList.add("ready"); })
    .catch(err => { $("hello").textContent = "Couldn't load the reading log."; $("tagline").textContent = String(err); });
})();
