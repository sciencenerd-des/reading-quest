/* Reviews & Reflections view. Reads the same computed state as the main page. */
(() => {
  "use strict";
  const { fmt, esc, plural, coverSrc, fallbackCover } = window.ReadingEngine;
  const $ = id => document.getElementById(id);
  const longDate = d => d ? fmt(d, { day: "numeric", month: "short", year: "numeric" }) : "";
  const monthYear = d => d ? fmt(d, { month: "short", year: "numeric" }) : "";
  const cover = (b, cls) => `<img class="${cls}" src="${esc(coverSrc(b))}" data-fallback="${esc(fallbackCover(b))}" alt="Cover art: ${esc(b.title)}" loading="lazy">`;
  const REREAD = { yes: "Would re-read", maybe: "Maybe re-read", no: "Once was enough" };

  function stars(r, big) {
    if (typeof r !== "number") return "";
    const pct = Math.max(0, Math.min(5, r)) / 5 * 100;
    return `<span class="stars${big ? " big" : ""}" style="--pct:${pct}%" role="img" aria-label="${r} out of 5 stars">★★★★★</span><span class="rating-num mono">${r.toFixed(1)}</span>`;
  }
  // paragraphs on blank lines, <br> on single newlines
  const prose = t => String(t || "").trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const chips = (arr, cls = "") => (arr || []).map(m => `<span class="mood ${cls}">${esc(m)}</span>`).join("");

  function readSpan(r) {
    if (!r.started && !r.finished) return "";
    return r.finished ? `${longDate(r.started)} → ${longDate(r.finished)}` : `since ${longDate(r.started)}`;
  }

  function notesFor(b, read) {
    return b.notes.filter(n => read == null ? true : (n.read != null ? +n.read === read.n : (!read.started || n.date >= read.started) && (!read.finished || n.date <= read.finished)))
      .slice().sort((a, c) => a.date.localeCompare(c.date));
  }

  function thread(notes) {
    if (!notes.length) return "";
    return `<ol class="thread">${notes.map(n => `<li><span class="t-dot"></span><div class="t-head mono">${longDate(n.date)}${n.page ? ` · p. ${n.page}` : ""}${n.where && !n.page ? ` · ${esc(n.where)}` : ""}</div>${n.text ? `<div class="prose small-prose">${prose(n.text)}</div>` : ""}${(n.working || []).length ? `<p class="small t-wn good">✓ ${(n.working).map(esc).join(" · ")}</p>` : ""}${(n.notWorking || []).length ? `<p class="small t-wn bad">✗ ${(n.notWorking).map(esc).join(" · ")}</p>` : ""}</li>`).join("")}</ol>`;
  }

  function reviewBody(b, r) {
    const v = r.review;
    return `
      <div class="rv-meta"><span class="muted small">reviewed ${longDate(v.date)}</span>${v.reread ? ` <span class="pill ${v.reread === "yes" ? "green" : v.reread === "no" ? "" : "amber"}">${REREAD[v.reread] || esc(v.reread)}</span>` : ""}</div>
      ${v.verdict ? `<p class="verdict">“${esc(v.verdict)}”</p>` : ""}
      ${v.moods && v.moods.length ? `<div class="moods">${chips(v.moods)}</div>` : ""}
      ${v.thoughts ? `<div class="prose">${prose(v.thoughts)}</div>` : ""}
      ${v.quotes && v.quotes.length ? `<div class="quotes">${v.quotes.map(q => `<blockquote><p>${esc(q.text)}</p>${q.where ? `<cite>${esc(q.where)}</cite>` : ""}</blockquote>`).join("")}</div>` : ""}
      ${v.moments && v.moments.length ? `<div class="sub-block"><h4>Favourite moments</h4><ul>${v.moments.map(m => `<li>${esc(typeof m === "string" ? m : m.text)}${m.where ? ` <span class="muted small">(${esc(m.where)})</span>` : ""}</li>`).join("")}</ul></div>` : ""}
      ${v.character ? `<div class="sub-block"><h4>Favourite character</h4><p>${esc(v.character)}</p></div>` : ""}
      ${v.discussion && v.discussion.length ? `<div class="sub-block"><h4>Still chewing on</h4><ul class="qs">${v.discussion.map(q => `<li>${esc(q)}</li>`).join("")}</ul></div>` : ""}`;
  }

  function sparkline(points) {
    const W = 220, H = 64, pad = 16;
    const xs = i => points.length === 1 ? W / 2 : pad + i * (W - 2 * pad) / (points.length - 1);
    const ys = r => H - pad - (r / 5) * (H - 2 * pad);
    const path = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.rating).toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      ${[1, 2, 3, 4, 5].map(v => `<line x1="0" x2="${W}" y1="${ys(v)}" y2="${ys(v)}" class="grid"/>`).join("")}
      <path d="${path}" class="line"/>${points.map((p, i) => `<circle cx="${xs(i)}" cy="${ys(p.rating)}" r="4" class="pt"/><text x="${xs(i)}" y="${ys(p.rating) - 8}" text-anchor="middle" class="lbl">${p.rating}</text>`).join("")}</svg>`;
  }

  function thenVsNow(first, last) {
    const a = first.review, z = last.review;
    const am = new Set(a.moods || []), zm = new Set(z.moods || []);
    const moodDiff = [...zm].map(m => `<span class="mood ${am.has(m) ? "" : "added"}">${esc(m)}</span>`).join("") + [...am].filter(m => !zm.has(m)).map(m => `<span class="mood dropped">${esc(m)}</span>`).join("");
    const d = (z.rating ?? 0) - (a.rating ?? 0);
    return `<div class="tvn">
      <div class="tvn-col"><span class="eyebrow">Then · read #${first.n} · ${monthYear(a.date || first.finished)}</span>${stars(a.rating)}<p class="verdict small-v">“${esc(a.verdict || "")}”</p><div class="moods">${chips(a.moods)}</div><span class="muted small">${REREAD[a.reread] || ""}</span></div>
      <div class="tvn-arrow"><span class="${d > 0 ? "up" : d < 0 ? "down" : "muted"}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${Math.abs(d).toFixed(1)}★</span></div>
      <div class="tvn-col"><span class="eyebrow">Now · read #${last.n} · ${monthYear(z.date || last.finished)}</span>${stars(z.rating)}<p class="verdict small-v">“${esc(z.verdict || "")}”</p><div class="moods">${moodDiff}</div><span class="muted small">${REREAD[z.reread] || ""}</span></div>
    </div><p class="muted small legend-moods"><span class="mood added">new feeling</span> <span class="mood dropped">faded</span></p>`;
  }

  function bookCard(b) {
    const reviewed = b.reads.filter(r => r.review);
    const latest = reviewed[reviewed.length - 1];
    const lv = latest && latest.review;
    const timeline = reviewed.length >= 2 ? `
      <div class="timeline">
        <div class="tl-head"><h4>Across ${plural(reviewed.length, "read")}</h4>${sparkline(reviewed.map(r => ({ rating: r.review.rating ?? 0 })))}</div>
        <ol class="tl-reads">${reviewed.map(r => `<li><span class="tl-year mono">${(r.finished || r.review.date || "").slice(0, 4)}</span><div><b>Read #${r.n}</b> ${stars(r.review.rating)}<p class="verdict small-v">“${esc(r.review.verdict || "")}”</p><div class="moods">${chips(r.review.moods)}</div></div></li>`).join("")}</ol>
        ${thenVsNow(reviewed[0], latest)}
      </div>` : "";
    const reads = b.reads.slice().reverse().map(r => {
      const ns = notesFor(b, r);
      if (!r.review && !ns.length) return "";
      return `<details class="read-block" ${r === latest || (!latest && r === b.reads[b.reads.length - 1]) ? "open" : ""}>
        <summary><span class="read-n">Read #${r.n}</span><span class="muted small">${readSpan(r)}</span>${r.review ? stars(r.review.rating) : `<span class="pill">notes only</span>`}</summary>
        ${r.review ? reviewBody(b, r) : ""}
        ${ns.length ? `<div class="sub-block"><h4>Journal · ${plural(ns.length, "note")}</h4>${thread(ns)}</div>` : ""}
      </details>`;
    }).join("");
    const loose = b.notes.filter(n => !b.reads.some(r => notesFor(b, r).includes(n)));
    return `<article class="card rv-card" data-book="${esc(b.id)}">
      <header class="rv-head">${cover(b, "rv-cover")}
        <div class="rv-title"><h3>${esc(b.title)}</h3><p class="muted">${esc(b.author)}${b.translator ? `, tr. ${esc(b.translator)}` : ""}</p>
          <div class="rv-meta">${lv ? stars(lv.rating, true) : ""}<span class="pill">${plural(b.reads.length, "read")}</span>${b.currentRead ? `<span class="pill amber">reading now</span>` : ""}</div>
          ${lv && lv.verdict ? `<p class="verdict">“${esc(lv.verdict)}”</p>` : ""}
          ${lv && lv.moods ? `<div class="moods">${chips(lv.moods)}</div>` : ""}
        </div></header>
      ${timeline}
      ${reads}
      ${loose.length ? `<div class="sub-block"><h4>Between reads</h4>${thread(loose)}</div>` : ""}
    </article>`;
  }

  const PROMPTS = ["How did it make you feel, in a word or three?", "One line you want to remember (with the page).", "Who stayed with you, and why?", "What are you still chewing on?", "Would you read it again?"];

  function currentArea(S) {
    const cb = S.reading[0];
    if (!cb) return `<div class="card-head"><h2>Currently reading</h2></div><p class="muted">Nothing on the go right now.</p>`;
    const r = cb.currentRead || cb.reads[cb.reads.length - 1];
    const ns = r ? notesFor(cb, r) : [];
    const p = S.progress[cb.id] || { pages: 0, chapters: 0 };
    const unit = cb.chapterLabel || "chapter";
    return `<div class="card-head"><h2>Currently reading · notes</h2><span class="muted small">${r ? `Read #${r.n} · ${readSpan(r)}` : ""}</span></div>
      <div class="cur-notes">
        ${cover(cb, "rv-cover")}
        <div class="cur-body">
          <h3>${esc(cb.title)}</h3><p class="muted small">${esc(cb.author)} · ${unit} ${Math.min(cb.totalChapters || 1e9, p.chapters + 1)}${cb.totalChapters ? ` of ${cb.totalChapters}` : ""}</p>
          ${ns.length ? thread(ns) : `<div class="empty-inline"><p>No notes yet for this read. Mid-book thoughts are worth keeping: a guess about where it's going, a line that landed, a question.</p><p class="muted small">Tell Robin something like <i>“note for ${esc(cb.title)}: …”</i> and it lands here, dated. +5 XP each.</p></div>`}
        </div>
      </div>`;
  }

  const state = { sort: "recent", year: "all", mood: "all" };

  function renderReviews(S) {
    const withReviews = S.books.filter(b => b.reads.some(r => r.review) || (b.notes.length && !b.currentRead));
    const ratings = S.reviews.map(x => x.review.rating).filter(v => typeof v === "number");
    const avg = ratings.length ? (ratings.reduce((a, c) => a + c, 0) / ratings.length) : null;
    $("rvStats").innerHTML = `
      <div><b>${S.reviews.length}</b><span>${S.reviews.length === 1 ? "review" : "reviews"}</span></div>
      <div><b>${avg != null ? avg.toFixed(1) + "★" : "–"}</b><span>average</span></div>
      <div><b>${S.notes.length}</b><span>journal entries</span></div>
      <div><b>${S.rereads}</b><span>re-read books</span></div>`;
    $("rvCurrent").innerHTML = currentArea(S);

    const years = [...new Set(S.reviews.map(x => (x.review.date || x.read.finished || "").slice(0, 4)).filter(Boolean))].sort().reverse();
    const moods = [...new Set(S.reviews.flatMap(x => x.review.moods || []))].sort();
    const ysel = $("rvYear"), msel = $("rvMood");
    ysel.innerHTML = `<option value="all">All years</option>` + years.map(y => `<option ${state.year === y ? "selected" : ""}>${y}</option>`).join("");
    msel.innerHTML = `<option value="all">Any mood</option>` + moods.map(m => `<option ${state.mood === m ? "selected" : ""}>${esc(m)}</option>`).join("");
    $("rvFilters").hidden = S.reviews.length === 0;

    const latestOf = b => { const rs = b.reads.filter(r => r.review); return rs.length ? rs[rs.length - 1].review : null; };
    let list = withReviews.filter(b => {
      const rv = b.reads.filter(r => r.review).map(r => r.review);
      if (state.year !== "all" && !rv.some(v => String(v.date || "").startsWith(state.year))) return false;
      if (state.mood !== "all" && !rv.some(v => (v.moods || []).includes(state.mood))) return false;
      return true;
    });
    const key = { recent: b => -(Date.parse((latestOf(b) || {}).date || "1970-01-01")), "rating-desc": b => -((latestOf(b) || {}).rating ?? -1), "rating-asc": b => ((latestOf(b) || {}).rating ?? 99), title: b => b.title.toLowerCase() }[state.sort];
    list.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });

    if (!withReviews.length) {
      const cb = S.reading[0];
      $("rvList").innerHTML = `<div class="card empty-state">
        <div class="es-art" aria-hidden="true">${S.books.filter(b => b.cover).slice(0, 4).map(b => cover(b, "es-cover")).join("")}</div>
        <h3>No reviews yet, and that's the right number.</h3>
        <p>When you finish ${cb ? `<b>${esc(cb.title)}</b>` : "a book"}, tell Robin how it landed. It's saved here as read #1, so a re-read years from now can sit next to it and show how your take changed.</p>
        <ul class="prompts">${PROMPTS.map(p => `<li>${p}</li>`).join("")}</ul>
        <p class="muted small">+50 XP per review, +50 more for a long one (150+ words). Badges: First Review, Critic, Re-reader, Changed My Mind.</p>
      </div>`;
    } else if (!list.length) {
      $("rvList").innerHTML = `<div class="card empty-state"><p>No reviews match those filters.</p></div>`;
    } else {
      $("rvList").innerHTML = list.map(bookCard).join("");
    }
  }

  window.ReviewsView = {
    render: renderReviews,
    bind(S) {
      const rerender = () => renderReviews(S);
      $("rvSort").addEventListener("change", e => { state.sort = e.target.value; rerender(); });
      $("rvYear").addEventListener("change", e => { state.year = e.target.value; rerender(); });
      $("rvMood").addEventListener("change", e => { state.mood = e.target.value; rerender(); });
      $("rvReset").addEventListener("click", () => { state.sort = "recent"; state.year = "all"; state.mood = "all"; $("rvSort").value = "recent"; rerender(); });
      rerender();
    }
  };
})();
