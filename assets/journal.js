/* Reading Journal view: daily thought dumps (book notes with optional page / working / not-working). */
(() => {
  "use strict";
  const { fmt, esc, plural, coverSrc, fallbackCover, XP } = window.ReadingEngine;
  const $ = id => document.getElementById(id);
  const cover = (b, cls) => `<img class="${cls}" src="${esc(coverSrc(b))}" data-fallback="${esc(fallbackCover(b))}" alt="Cover art: ${esc(b.title)}" loading="lazy">`;
  const prose = t => String(t || "").trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const list = (arr, cls, icon) => `<ul class="jr-list ${cls}">${arr.map(x => `<li><span class="jr-ic" aria-hidden="true">${icon}</span><span>${esc(x)}</span></li>`).join("")}</ul>`;
  const PROMPTS = ["Where are you in the story?", "What's working: a scene, a voice, a structure?", "What isn't: pacing, a device, a character?", "A guess about where it's heading.", "How did today's pages feel?"];
  const state = { book: "all" };

  function entry(x, S) {
    const b = x.book, n = x.note;
    const pct = n.page && b.totalPages ? Math.min(100, n.page / b.totalPages * 100) : null;
    const working = n.working || [], notWorking = n.notWorking || [];
    return `<article class="card jr-entry">
      <header class="jr-head">
        ${cover(b, "jr-cover")}
        <div class="jr-meta">
          <span class="eyebrow">${fmt(n.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          <h3>${esc(b.title)}</h3>
          <span class="muted small">${esc(b.author)}${n.read > 1 ? ` · <span class="pill amber">read #${n.read}</span>` : ""}</span>
        </div>
        ${n.page ? `<span class="jr-page mono">p. <b>${n.page}</b>${b.totalPages ? `<small>/${b.totalPages}</small>` : ""}</span>` : ""}
      </header>
      ${n.page || n.where ? `<div class="jr-progress">
        <h4>Progress</h4>
        ${pct != null ? `<div class="bar thin"><i style="width:${pct.toFixed(1)}%"></i></div>` : ""}${n.page ? `<span class="muted small mono">Reached p. ${n.page}${b.totalPages ? ` of ${b.totalPages} · ${Math.round(pct)}% through` : ""}</span>` : ""}
        ${n.where ? `<p>${esc(n.where)}</p>` : ""}
      </div>` : ""}
      ${n.text ? `<div class="jr-thoughts"><h4>Thoughts</h4><div class="prose small-prose">${prose(n.text)}</div></div>` : ""}
      ${working.length || notWorking.length ? `<div class="jr-wn">
        ${working.length ? `<div class="jr-col good"><h4>What's working</h4>${list(working, "good", "✓")}</div>` : ""}
        ${notWorking.length ? `<div class="jr-col bad"><h4>What's not</h4>${list(notWorking, "bad", "✗")}</div>` : ""}
      </div>` : ""}
    </article>`;
  }

  function render(S) {
    const all = S.notes.slice().sort((a, c) => c.note.date.localeCompare(a.note.date) || S.books.indexOf(a.book) - S.books.indexOf(c.book) || c.book.notes.indexOf(c.note) - a.book.notes.indexOf(a.note));
    const books = [...new Set(all.map(x => x.book))];
    if (state.book !== "all" && !books.some(b => b.id === state.book)) state.book = "all";
    $("jrStats").innerHTML = `
      <div><b>${all.length}</b><span>${all.length === 1 ? "entry" : "entries"}</span></div>
      <div><b>${S.journalStreak}</b><span>day journal streak</span></div>
      <div><b>${S.journalDays.size}</b><span>days journaled</span></div>
      <div><b>+${XP.note}</b><span>XP per entry</span></div>`;
    const sel = $("jrBook");
    sel.innerHTML = `<option value="all">All books</option>` + books.map(b => `<option value="${esc(b.id)}" ${state.book === b.id ? "selected" : ""}>${esc(b.title)}</option>`).join("");
    $("jrFilters").hidden = all.length === 0;
    const shown = all.filter(x => state.book === "all" || x.book.id === state.book);
    const cb = S.reading[0];
    $("jrList").innerHTML = shown.length ? shown.map(x => entry(x, S)).join("") : `<div class="card empty-state">
      <h3>The journal is empty.</h3>
      <p>After a session, dump whatever's on your mind about ${cb ? `<b>${esc(cb.title)}</b>` : "the book"}: tell Robin and it lands here, dated, with your page.</p>
      <ul class="prompts">${PROMPTS.map(p => `<li>${p}</li>`).join("")}</ul>
      <p class="muted small">+${XP.note} XP per entry. Journal 3 days in a row for the 📓 Dear Diary badge.</p></div>`;
    const dd = S.badges.find(b => b.id === "dear-diary");
    $("jrNudge").innerHTML = dd ? (dd.got ? `📓 Dear Diary earned. Journal streak: ${plural(S.journalStreak, "day")}.` : `📓 Dear Diary: ${dd.prog[0]}/3 days in a row. ${S.journalDays.has(S.today) ? "Today's entry is in." : "Add one today to keep it going."}`) : "";
  }

  window.JournalView = {
    render,
    bind(S) {
      $("jrBook").addEventListener("change", e => { state.book = e.target.value; render(S); });
      render(S);
    }
  };
})();
