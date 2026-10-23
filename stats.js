#!/usr/bin/env node
// Prints the same stats the website shows. Usage: node stats.js [--json] [YYYY-MM-DD]
const fs = require("fs"), path = require("path");
const E = require("./assets/engine.js");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data/reading.json"), "utf8"));
const args = process.argv.slice(2);
const day = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const S = E.compute(data, day);
const t = S.days[S.today] || { pages: 0, minutes: 0, chapters: 0 };
const cb = S.reading[0];
const p = cb ? (S.progress[cb.id] || { pages: 0, chapters: 0 }) : null;
const out = {
  today: S.today,
  goal: { pages: S.curWeek.pages, minutes: S.curWeek.minutes, week: S.curWeek.index + 1, metThisGoalWeek: S.curWeek.met, metToday: S.dayMet(S.today) },
  todayRead: { pages: t.pages, minutes: t.minutes, chapters: t.chapters },
  streak: S.streak, longestStreak: S.longest, freezesBanked: S.freezes, daysToNextFreeze: S.toNextFreeze,
  xp: S.xp, level: `${S.level.n} · ${S.level.title}`, xpToNext: S.level.next ? S.level.next - S.xp : 0, nextLevel: S.level.nextTitle,
  currentBook: cb ? { title: cb.title, chapter: Math.min(cb.totalChapters || Infinity, p.chapters + 1), chaptersDone: p.chapters, totalChapters: cb.totalChapters, pagesRead: p.pages, totalPages: cb.totalPages, percent: cb.totalPages ? Math.round(p.pages / cb.totalPages * 100) : null } : null,
  thisWeek: { pages: S.thisWeek.pages, minutes: S.thisWeek.minutes, chapters: S.thisWeek.chapters, daysRead: S.thisWeek.read, goalMet: S.thisWeek.met },
  booksFinished: S.finishedCount, reviews: S.reviews.length, notes: S.notes.length, finishedThisYear: S.finishedThisYear, yearlyGoal: S.s.yearlyGoal || 12,
  badges: S.badges.filter(b => b.got).map(b => b.name)
};
if (args.includes("--json")) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`Reading Quest · ${out.today}
Today's goal: ${out.goal.pages} pages or ${out.goal.minutes} min (goal week ${out.goal.week}) · ${out.goal.metToday ? "MET" : "not met yet"} · read today ${t.pages} pp / ${t.minutes} min / ${t.chapters} ch
Streak: ${out.streak} days (best ${out.longestStreak}) · freezes ${out.freezesBanked}/2 · next freeze in ${out.daysToNextFreeze} days
Level ${out.level} · ${out.xp} XP${out.nextLevel ? ` · ${out.xpToNext} XP to ${out.nextLevel}` : ""}
${cb ? `Now reading: ${cb.title} · chapter ${out.currentBook.chapter}/${cb.totalChapters || "?"} · ${p.pages}/${cb.totalPages || "?"} pages (${out.currentBook.percent}%)` : "Now reading: nothing"}
This week: ${out.thisWeek.pages} pages · ${out.thisWeek.minutes} min · ${out.thisWeek.chapters} chapters · ${out.thisWeek.daysRead}/7 days read · goal met ${out.thisWeek.goalMet}/7
Books: ${out.booksFinished} finished (re-reads count) · ${out.finishedThisYear}/${out.yearlyGoal} this year · ${out.reviews} reviews · ${out.notes} notes
Badges: ${out.badges.join(", ") || "none yet"}`);
