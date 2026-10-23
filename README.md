# Reading Quest

A static, gamified reading-habit tracker. Live at **https://sciencenerd-des.github.io/reading-quest/**

No backend: the page fetches `data/reading.json` and computes everything (goal, streak, XP, badges, heatmap) in the browser. **That file is the single source of truth.**

## Files

| Path | What it is |
| --- | --- |
| `data/reading.json` | All state: settings, books, daily log |
| `index.html`, `assets/style.css` | Page and styles (dark, mobile-first) |
| `assets/engine.js` | Pure stats engine, shared by the browser and node |
| `assets/app.js` | Rendering, tabs (`#quest` / `#reviews`) + the browser-only "pending" quick log |
| `assets/reviews.js` | The Reviews & Reflections tab |
| `log.py` | One-command updater: edits the JSON, prints stats, commits and pushes |
| `assets/covers/*.svg` | Original hand-made cover art (300×450 SVG), one per book |
| `stats.js` | `node stats.js [--json] [YYYY-MM-DD]` prints what the site shows |

## Updating (one command)

```bash
cd /workspace/reading-quest
./log.py read --pages 12 --chapters 1 --minutes 20 --note "Rocky!"   # today (IST), current book
./log.py read --minutes 30 --time 23:20                              # time is optional (Night Owl / Early Bird)
./log.py read --pages 8 --date 2026-10-25                            # back-date
./log.py finish                                                      # current book finished today
./log.py start --title "The Martian" --author "Andy Weir" --pages 384 --chapters 26
./log.py add --title "Dune" --author "Frank Herbert" --pages 688      # add to Next up
./log.py remove --book dune      ./log.py yearly 15      ./log.py undo      ./log.py show
```

### Reviews, journal notes, re-reads

```bash
./log.py note --where "ch. 5" --text "Rocky is the best thing in this book."   # current book, current read
./log.py note --book piranesi --text-file /tmp/note.txt                       # multi-paragraph from a file
pbpaste | ./log.py note --text -                                               # …or from stdin

./log.py review --book project-hail-mary --rating 4.5 \
  --verdict "Science as friendship." \
  --thoughts-file /tmp/thoughts.txt \
  --moods "moved,gripped,hopeful" \
  --quote "Fist my bump. | ch. 12" --quote "Another line | p. 301" \
  --moment "The bridge scene | ch. 26" \
  --character "Rocky" \
  --point "Was the ending brave or inevitable?" \
  --reread yes                                   # yes | maybe | no
./log.py review --book project-hail-mary --verdict "Better line."   # running it again MERGES into that review
./log.py review --book piranesi --read 1 --replace --rating 4        # --replace overwrites; --read targets an older read
./log.py reread --book project-hail-mary         # finished before? start read #2 (status → reading)
```

- `--thoughts` / `--text` take a literal string, `-` for stdin, or use `--thoughts-file` / `--text-file`. Blank lines separate paragraphs.
- `review` defaults to the most recently finished read; `--rating` is 0.5–5 in half-star steps; `--date` sets the review date (default today).
- `note` attaches to the current (or latest) read; `--read N` targets one, `--read 0` files it "between reads".
- `start` on a book that's been finished refuses and points you at `reread`.

Every command except `show` commits and runs `git push` to `main`; GitHub Pages republishes in about a minute. Put `--no-push` **before** the subcommand (`./log.py --no-push read ...`) to edit only.

Manual deploy, if you edit files by hand:

```bash
cd /workspace/reading-quest && git add -A && git commit -m "Update reading log" && git push
```

## `data/reading.json` schema

```jsonc
{
  "version": 1,
  "reader": "Biswajit",                 // used in greetings
  "settings": {
    "yearlyGoal": 12,                   // books per calendar year
    "timezone": "Asia/Kolkata",         // defines "today"
    "goal": {
      "startPages": 10, "startMinutes": 15,   // week-1 daily goal (pages OR minutes)
      "weeklyIncrease": 0.10,                 // +10% per goal week…
      "daysToLevelUp": 5,                     // …if the goal was met on >= 5 of its 7 days
      "capPages": 50, "capMinutes": 60        // ceiling
    }
  },
  "books": [{
    "id": "project-hail-mary",          // unique slug; log entries reference it
    "title": "Project Hail Mary",
    "author": "Andy Weir",
    "totalChapters": 30,                // optional
    "totalPages": 496,                  // optional (progress uses pages if present, else chapters)
    "edition": "…",                     // optional free text
    "translator": "…",                  // optional, shown in Next up
    "chapterLabel": "part",             // optional unit name for totalChapters (default "chapter")
    "cover": "assets/covers/project-hail-mary.svg", // optional; missing → generated typographic cover
    "status": "reading",                // "reading" | "finished" | "next"
    "suggested": false,                 // optional; shows a "Robin's pick" tag in Next up
    "started": "2026-10-24",            // = current/latest read's started (kept for compatibility)
    "finished": null,                   // = latest read's finished, or null
    "reads": [{                         // one entry per read-through; #2, #3… are re-reads
      "n": 1,
      "started": "2026-10-24",
      "finished": null,                 // set by `finish`
      "review": null                    // or the object below, once written
      /* "review": {
        "date": "2026-11-21",           // review date
        "rating": 4.5,                  // 0.5–5, half stars allowed
        "verdict": "One line.",
        "thoughts": "Paragraph one.\n\nParagraph two.",   // \n\n = new paragraph
        "moods": ["moved", "gripped"],  // lower-case tags; drive the mood filter
        "quotes": [{ "text": "…", "where": "ch. 12" }],
        "moments": [{ "text": "…", "where": "ch. 26" }],
        "character": "Rocky",
        "discussion": ["Open question…"],
        "reread": "yes"                 // "yes" | "maybe" | "no"
      } */
    }],
    "notes": [{                         // dated journal / discussion notes, threaded by date
      "date": "2026-10-25", "read": 1, "where": "ch. 4", "text": "…"   // read & where optional
    }]
  }],
  "log": [{
    "date": "2026-10-24",               // YYYY-MM-DD, IST
    "book": "project-hail-mary",        // book id
    "pages": 51,                        // pages read in this session (not the page number)
    "chapters": 3,                      // chapters completed in this session
    "minutes": 0,                       // minutes read (0 if unknown)
    "time": "23:15",                    // optional HH:MM, 24h IST
    "read": 1,                          // optional read number (log.py adds it); else matched by date
    "note": "…"                         // optional
  }]
}
```

Several entries on one date are summed. Book progress = sum of that book's `pages` and `chapters` in the log **for the current read** (entries with that `read` number, or, without one, dated on/after the read started); current chapter = chapters done + 1.

**Backward compatibility**: a book without `reads` is upgraded on load (by both `engine.js` and `log.py`) to one read built from its `started`/`finished`; missing `notes` becomes `[]`. Old files keep working unchanged.

## Reviews & Reflections tab

`…/reading-quest/#reviews`. Stats strip (reviews, average rating, notes, re-read books), a notes thread for the book you're reading now, then one card per reviewed book: cover, latest stars/verdict/moods, every read as a collapsible block (full thoughts, quotes, favourite character and moments, open questions, that read's journal thread). With 2+ reviewed reads a card adds a timeline (rating sparkline, verdict and moods per read) and **Then vs now** (rating shift, verdict, moods gained/faded, re-read intent). Sort by newest / rating / title, filter by review year and mood. With no reviews it shows an empty state with prompts.

## Covers

Every book shows a cover in the Now reading card, Next up and the bookshelf (finished books; the current book holds a faded "reserved" slot until then).

- **Books with art**: `cover` points at a file in `assets/covers/`. Current art: `project-hail-mary.svg`, `dark-matter.svg`, `piranesi.svg`, `out.svg`. All are original stylised artwork (no publisher covers, traced images or stock photos).
- **Books without art**: `engine.js → fallbackCover()` generates a typographic SVG (title, author, hue derived from the title). If a `cover` file fails to load, the page swaps in the generated one automatically.

### Adding art for a new book

1. Draw a `300×450` SVG and save it as `assets/covers/<book-id>.svg` (the id is the slug, e.g. `the-left-hand-of-darkness`).
2. Keep the house style so the shelf looks like one set:
   - dark gradient background, one luminous focal element, flat silhouettes, no raster images;
   - bottom band: `<rect y="330" height="120">` fading to near-black, title in `Fraunces, Georgia, serif` 700 (25–44 px, letter-spaced caps, `#f4ead7`) at y≈390–405, author in `IBM Plex Mono` 9 px, letter-spacing 4, in the cover's accent colour at y=428;
   - thin frame: `<rect x="10" y="10" width="280" height="430" rx="4" fill="none" stroke="#f2d7a0" stroke-opacity=".32"/>`;
   - add a `<title>` describing the art for screen readers.
3. `./log.py add …` / `./log.py start …` pick up `assets/covers/<book-id>.svg` automatically; otherwise set `"cover"` in the JSON (or pass `--cover PATH`).
4. Check it with `python3 -c "import xml.dom.minidom as m; m.parse('assets/covers/<id>.svg')"`, then commit and push.

## Rules (all computed from the log)

- **XP**: 1 per page, 15 per chapter, 1 per 2 minutes, +10 per day the goal is met, +200 per finished read (re-reads count), +50 per review, +50 more if its thoughts run 150+ words, +5 per journal note.
- **Levels**: Spine Cracker (0) → Page Turner (100) → Chapter Chaser (250) → Dog-Ear Devotee (450) → Margin Scribbler (700) → Lamp-Light Regular (1000) → Plot Hunter (1400) → Shelf Builder (1900) → Bookworm (2500) → Story Cartographer (3200) → Tome Tamer (4000) → Archivist (5000) → Lorekeeper (6200) → Bibliophile (7600) → Grand Librarian (9200) → Keeper of Ten Thousand Pages (11000) → Living Library (13500).
- **Daily goal**: met when pages ≥ goal pages **or** minutes ≥ goal minutes. Goal weeks are 7-day blocks counted from the first log date (24 Oct 2026, so Sat–Fri). After a block with ≥ 5 met days the goal rises ~10% (rounded, at least +1), otherwise it holds. Cap 50 pages / 60 minutes.
- **Streak**: consecutive days with any reading. Today doesn't break it until it's over. Every 7th consecutive day earns a 🧊 freeze (max 2 banked); a missed day auto-spends one and the streak survives.
- **Badges**: First Chapter, Kindling (3-day), Steady Flame (7-day), Unbroken Moon (30-day), Level-Up Week, Century Week (100 pages Mon–Sun), Deep Dive (60 min/day), Halfway There, The End (first book), Shelf of Five, Night Owl (entry time 23:00–03:59), Early Bird (04:00–06:59), Saved by Ice, Year Complete, ✍️ First Review, 🎭 Critic (5 reviews), 🗒️ Margin Notes (first journal note), 🔁 Re-reader (start a second read of any book), 🔄 Changed My Mind (ratings of one book differ by ≥ 1.5★ between reads). Finished re-reads count toward The End, Shelf of Five, the book milestones and the yearly goal.
- **Quests**: next book milestone (1, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100) and the yearly goal with an even-pace marker.
- **This week** card uses calendar weeks (Mon–Sun) and compares with last week.
- **Quick log** on the page saves to `localStorage` only, marked *pending*; it never changes stats until it's added to `data/reading.json`.

Preview any date with `?today=YYYY-MM-DD`, e.g. `…/reading-quest/?today=2026-11-01`.
