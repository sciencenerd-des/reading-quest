#!/usr/bin/env python3
"""Reading Quest logger: edits data/reading.json, prints stats, commits and pushes.

Examples
  ./log.py read --pages 12 --chapters 1 --minutes 20 --note "Rocky!"   # log today's reading
  ./log.py read --minutes 30 --date 2026-10-25 --time 23:15            # back-date, with time (night owl)
  ./log.py finish                                                       # finish the current book
  ./log.py start --title "The Martian" --author "Andy Weir" --pages 384 --chapters 26
  ./log.py add --title "Dune" --author "Frank Herbert" --pages 688       # add to Next up
  ./log.py add --title "Piranesi" --chapters 7 --label part              # count "parts" instead of chapters
  (a cover is picked up automatically from assets/covers/<book-id>.svg; --cover PATH overrides)
  ./log.py remove --book dune                                           # drop from Next up
  ./log.py yearly 15                                                    # change the yearly book goal
  ./log.py undo                                                         # remove the last log entry
  ./log.py show                                                         # print stats, no changes

Reviews & journal (text options accept a literal string, "-" for stdin, or *-file PATH):
  ./log.py note --book project-hail-mary --where "ch. 5" --text "Rocky is the best thing in this book."
  ./log.py review --book project-hail-mary --rating 4.5 --verdict "Science as friendship." \
      --thoughts-file /tmp/thoughts.txt --moods "moved,gripped" --quote "Fist my bump. | ch. 12" \
      --character Rocky --point "Would I have stayed?" --reread yes
  cat thoughts.txt | ./log.py review --book piranesi --rating 5 --thoughts -
  ./log.py reread --book project-hail-mary                              # start read #2 of a finished book
  ./log.py journal --page 90 --where "Grace briefs the carrier" --thoughts "Still setting up." \\
      --working "Non-linear reveals|Characters" --not-working "Amnesia flashbacks feel gimmicky"
Add --no-push to any command to only edit the file (no git commit/push).
"""
import argparse, datetime, json, os, re, subprocess, sys
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data", "reading.json")


def load():
    with open(DATA, encoding="utf-8") as f:
        return migrate(json.load(f))


def migrate(d):
    """Backward compatibility: give every book reads[] and notes[]."""
    for b in d.get("books", []):
        if not isinstance(b.get("reads"), list):
            b["reads"] = [{"n": 1, "started": b.get("started"), "finished": b.get("finished"), "review": None}] if b.get("started") else []
        for i, r in enumerate(b["reads"]):
            r.setdefault("n", i + 1); r.setdefault("finished", None); r.setdefault("review", None)
        b.setdefault("notes", [])
    return d


def open_read(b):
    return b["reads"][-1] if b["reads"] and not b["reads"][-1].get("finished") else None


def pick_read(b, n=None):
    if not b["reads"]:
        sys.exit(f"{b['title']} has no reads yet. Use `start` first.")
    if n is None:
        return b["reads"][-1]
    for r in b["reads"]:
        if r["n"] == n:
            return r
    sys.exit(f"{b['title']} has no read #{n} (has {len(b['reads'])}).")


def get_text(value, path):
    """Literal text, '-' for stdin, or a file path. Keeps paragraphs (blank lines)."""
    if path:
        with open(path, encoding="utf-8") as f:
            value = f.read()
    elif value == "-":
        value = sys.stdin.read()
    if value is None:
        return None
    value = value.replace("\r\n", "\n").strip()
    return re.sub(r"\n{3,}", "\n\n", value)


def split_where(s):
    """'text | where' -> {'text','where'}"""
    if "|" in s:
        t, w = s.rsplit("|", 1)
        return {"text": t.strip(), "where": w.strip()}
    return {"text": s.strip()}


def rating_value(x):
    v = float(x)
    if not (0.5 <= v <= 5) or (v * 2) != int(v * 2):
        raise argparse.ArgumentTypeError("rating must be 0.5–5 in half-star steps")
    return v


def save(d):
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write("\n")


def today(d):
    return datetime.datetime.now(ZoneInfo(d.get("settings", {}).get("timezone", "Asia/Kolkata"))).date().isoformat()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def check_date(s):
    datetime.date.fromisoformat(s)
    return s


def find_book(d, ref=None, status=None):
    books = d["books"]
    if ref:
        for b in books:
            if b["id"] == ref or b["title"].lower() == ref.lower():
                return b
        sys.exit(f"No book matching '{ref}'. Known: {', '.join(b['id'] for b in books)}")
    cur = [b for b in books if b["status"] == (status or "reading")]
    if not cur:
        sys.exit("No book is currently 'reading'. Use --book or `start` first.")
    return cur[0]


def apply_extras(b, args):
    if getattr(args, "label", None):
        b["chapterLabel"] = args.label
    cover = getattr(args, "cover", None)
    auto = f"assets/covers/{b['id']}.svg"
    if cover:
        b["cover"] = cover
    elif not b.get("cover") and os.path.exists(os.path.join(ROOT, auto)):
        b["cover"] = auto


def git_push(msg):
    def run(*a):
        return subprocess.run(a, cwd=ROOT, check=True)
    run("git", "add", "-A")
    if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
        print("Nothing to commit.")
        return
    run("git", "commit", "-q", "-m", msg)
    run("git", "push", "-q")
    print("Pushed. GitHub Pages updates in ~1 minute: https://sciencenerd-des.github.io/reading-quest/")


def show():
    subprocess.run(["node", os.path.join(ROOT, "stats.js")], check=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-push", action="store_true", help="edit data only; skip git commit/push")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("read", help="append a log entry")
    r.add_argument("--pages", type=int, default=0)
    r.add_argument("--chapters", type=int, default=0)
    r.add_argument("--minutes", type=int, default=0)
    r.add_argument("--book", help="book id or title (default: current book)")
    r.add_argument("--date", type=check_date, help="YYYY-MM-DD (default: today, IST)")
    r.add_argument("--time", help="HH:MM, 24h, IST (optional; drives Night Owl / Early Bird)")
    r.add_argument("--note", default="")

    f = sub.add_parser("finish", help="mark a book finished")
    f.add_argument("--book"); f.add_argument("--date", type=check_date)

    s = sub.add_parser("start", help="start reading a book (from Next up or new)")
    s.add_argument("--title", required=True); s.add_argument("--author", default="")
    s.add_argument("--pages", type=int); s.add_argument("--chapters", type=int)
    s.add_argument("--date", type=check_date)
    s.add_argument("--cover"); s.add_argument("--label", help='unit name, e.g. "part" (default "chapter")')

    a = sub.add_parser("add", help="add a book to Next up")
    a.add_argument("--title", required=True); a.add_argument("--author", default="")
    a.add_argument("--pages", type=int); a.add_argument("--chapters", type=int)
    a.add_argument("--cover"); a.add_argument("--label", help='unit name, e.g. "part" (default "chapter")')

    rm = sub.add_parser("remove", help="remove a Next-up book"); rm.add_argument("--book", required=True)
    y = sub.add_parser("yearly", help="set yearly book goal"); y.add_argument("n", type=int)
    sub.add_parser("undo", help="remove the most recent log entry")

    rv = sub.add_parser("review", help="add or update the review for a read (default: the latest read)")
    rv.add_argument("--book", help="book id or title (default: current book)")
    rv.add_argument("--read", type=int, help="read number (default: latest)")
    rv.add_argument("--rating", type=rating_value, help="0.5–5, half stars allowed")
    rv.add_argument("--verdict", help="one line")
    rv.add_argument("--thoughts", help='full thoughts; "-" reads stdin'); rv.add_argument("--thoughts-file")
    rv.add_argument("--moods", help="comma-separated, e.g. moved,gripped,unsettled")
    rv.add_argument("--quote", action="append", default=[], help='"quote text | p. 123" (repeatable)')
    rv.add_argument("--moment", action="append", default=[], help='"moment | ch. 9" (repeatable)')
    rv.add_argument("--character", help="favourite character")
    rv.add_argument("--point", action="append", default=[], help="discussion point / open question (repeatable)")
    rv.add_argument("--reread", choices=["yes", "maybe", "no"], help="would you re-read it?")
    rv.add_argument("--date", type=check_date, help="review date (default: today)")
    rv.add_argument("--replace", action="store_true", help="overwrite an existing review instead of merging")

    nt = sub.add_parser("note", help="add a dated journal/discussion note")
    nt.add_argument("--book", help="book id or title (default: current book)")
    nt.add_argument("--text", help='note text; "-" reads stdin'); nt.add_argument("--text-file")
    nt.add_argument("--where", help='e.g. "ch. 5" or "p. 120"')
    nt.add_argument("--read", type=int, help="attach to read #N (default: current/latest; 0 = between reads)")
    nt.add_argument("--date", type=check_date)

    jr = sub.add_parser("journal", help="add a daily Reading Journal entry (thoughts, what's working / not, progress)")
    jr.add_argument("--book", help="book id or title (default: current book)")
    jr.add_argument("--page", type=int, help="page reached")
    jr.add_argument("--where", help='where you are in the story, e.g. "Grace reaches the carrier"')
    jr.add_argument("--thoughts", help='free-form thoughts; "-" reads stdin'); jr.add_argument("--thoughts-file")
    jr.add_argument("--working", action="append", default=[], help='what works; "a|b" or repeat the flag')
    jr.add_argument("--not-working", action="append", default=[], help="what doesn't; \"a|b\" or repeat the flag")
    jr.add_argument("--read", type=int, help="attach to read #N (default: current/latest; 0 = between reads)")
    jr.add_argument("--date", type=check_date)

    rr = sub.add_parser("reread", help="start a new read of a book you've read before")
    rr.add_argument("--book", required=True); rr.add_argument("--date", type=check_date)
    sub.add_parser("show", help="print stats only")

    args = ap.parse_args()
    if args.cmd == "show":
        return show()

    d = load()
    t = today(d)
    if args.cmd == "read":
        if not (args.pages or args.chapters or args.minutes):
            sys.exit("Give at least one of --pages, --chapters, --minutes.")
        if args.time and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", args.time):
            sys.exit("--time must be HH:MM (24h).")
        b = find_book(d, args.book)
        e = {"date": args.date or t, "book": b["id"], "pages": args.pages, "chapters": args.chapters, "minutes": args.minutes, "note": args.note}
        if b["reads"]:
            e["read"] = (open_read(b) or b["reads"][-1])["n"]
        if args.time:
            e["time"] = args.time
        d["log"].append(e)
        msg = f"Log {e['date']}: {args.pages}p {args.chapters}ch {args.minutes}min ({b['title']})"
    elif args.cmd == "finish":
        b = find_book(d, args.book)
        r = open_read(b)
        if not r:
            if b["reads"]:
                sys.exit(f"{b['title']} has no open read. Use `reread` to start another.")
            r = {"n": 1, "started": b.get("started") or args.date or t, "finished": None, "review": None}
            b["reads"].append(r)
        r["finished"] = args.date or t
        b["status"], b["finished"] = "finished", r["finished"]
        msg = f"Finished {b['title']} (read #{r['n']})"
    elif args.cmd == "start":
        b = next((x for x in d["books"] if x["title"].lower() == args.title.lower()), None)
        if not b:
            b = {"id": slug(args.title), "title": args.title, "author": args.author}
            d["books"].append(b)
        for k, v in (("author", args.author), ("totalPages", args.pages), ("totalChapters", args.chapters)):
            if v:
                b[k] = v
        b.pop("suggested", None)
        b.setdefault("reads", []); b.setdefault("notes", [])
        if b["reads"] and not open_read(b):
            sys.exit(f"You've finished {b['title']} before. Use `reread --book {b['id']}`.")
        if not b["reads"]:
            b["reads"].append({"n": 1, "started": args.date or t, "finished": None, "review": None})
        b.update(status="reading", started=b["reads"][-1]["started"], finished=None)
        apply_extras(b, args)
        msg = f"Started {b['title']}"
    elif args.cmd == "add":
        if any(x["title"].lower() == args.title.lower() for x in d["books"]):
            sys.exit("That book is already in the data file.")
        b = {"id": slug(args.title), "title": args.title, "author": args.author, "status": "next", "started": None, "finished": None, "reads": [], "notes": []}
        if args.pages: b["totalPages"] = args.pages
        if args.chapters: b["totalChapters"] = args.chapters
        apply_extras(b, args)
        d["books"].append(b)
        msg = f"Next up: {args.title}"
    elif args.cmd == "remove":
        b = find_book(d, args.book)
        if b["status"] != "next":
            sys.exit("Only Next-up books can be removed.")
        d["books"].remove(b)
        msg = f"Removed {b['title']} from Next up"
    elif args.cmd == "yearly":
        d["settings"]["yearlyGoal"] = args.n
        msg = f"Yearly goal: {args.n} books"
    elif args.cmd == "undo":
        if not d["log"]:
            sys.exit("Log is empty.")
        e = d["log"].pop()
        msg = f"Undo log entry {e['date']}"
    elif args.cmd == "review":
        if args.book:
            b = find_book(d, args.book)
        else:  # default: the most recently finished read
            done = [(r["finished"], x) for x in d["books"] for r in x["reads"] if r.get("finished")]
            if not done:
                sys.exit("Nothing finished yet. Use --book to review a book in progress.")
            b = max(done, key=lambda p: p[0])[1]
        r = pick_read(b, args.read)
        old = r.get("review") if not args.replace else None
        v = dict(old or {})
        thoughts = get_text(args.thoughts, args.thoughts_file)
        for k, val in (("rating", args.rating), ("verdict", args.verdict), ("thoughts", thoughts), ("character", args.character), ("reread", args.reread)):
            if val is not None:
                v[k] = val
        if args.moods:
            v["moods"] = [m.strip().lower() for m in args.moods.split(",") if m.strip()]
        if args.quote:
            v["quotes"] = v.get("quotes", []) + [split_where(q) for q in args.quote]
        if args.moment:
            v["moments"] = v.get("moments", []) + [split_where(m) for m in args.moment]
        if args.point:
            v["discussion"] = v.get("discussion", []) + args.point
        v["date"] = args.date or v.get("date") or t
        for k in ("moods", "quotes", "moments", "discussion"):
            v.setdefault(k, [])
        if len(v) <= 5 and not any(v.get(k) for k in ("rating", "verdict", "thoughts")):
            sys.exit("A review needs at least one of --rating, --verdict, --thoughts.")
        r["review"] = v
        words = len((v.get("thoughts") or "").split())
        msg = f"{'Update' if old else 'Review'}: {b['title']} read #{r['n']}" + (f" · {v['rating']}★" if "rating" in v else "") + f" · {words} words"
    elif args.cmd == "note":
        b = find_book(d, args.book) if args.book else find_book(d)
        text = get_text(args.text, args.text_file)
        if not text:
            sys.exit("Give --text, --text - (stdin) or --text-file.")
        n = {"date": args.date or t, "text": text}
        if args.where:
            n["where"] = args.where
        if args.read != 0:
            if args.read:
                pick_read(b, args.read)
                n["read"] = args.read
            elif b["reads"]:
                n["read"] = (open_read(b) or b["reads"][-1])["n"]
        b["notes"].append(n)
        msg = f"Note on {b['title']} ({n['date']})"
    elif args.cmd == "journal":
        b = find_book(d, args.book) if args.book else find_book(d)
        split = lambda xs: [p.strip() for x in xs for p in x.split("|") if p.strip()]
        text = get_text(args.thoughts, args.thoughts_file)
        working, notw = split(args.working), split(args.not_working)
        if not (text or working or notw):
            sys.exit("Give at least one of --thoughts, --working, --not-working.")
        if args.page is not None and b.get("totalPages") and not (0 < args.page <= b["totalPages"]):
            sys.exit(f"--page must be 1-{b['totalPages']} for {b['title']}.")
        n = {"date": args.date or t}
        if args.page is not None:
            n["page"] = args.page
        if args.where:
            n["where"] = args.where
        n["text"] = text or ""
        if working:
            n["working"] = working
        if notw:
            n["notWorking"] = notw
        if args.read != 0:
            if args.read:
                pick_read(b, args.read)
                n["read"] = args.read
            elif b["reads"]:
                n["read"] = (open_read(b) or b["reads"][-1])["n"]
        b["notes"].append(n)
        msg = f"Journal: {b['title']} ({n['date']}" + (f", p. {args.page}" if args.page is not None else "") + ")"
    elif args.cmd == "reread":
        b = find_book(d, args.book)
        if open_read(b):
            sys.exit(f"{b['title']} read #{open_read(b)['n']} is still open.")
        if not b["reads"]:
            sys.exit(f"{b['title']} hasn't been read yet. Use `start`.")
        r = {"n": b["reads"][-1]["n"] + 1, "started": args.date or t, "finished": None, "review": None}
        b["reads"].append(r)
        b.update(status="reading", started=r["started"], finished=None)
        others = [x["title"] for x in d["books"] if x is not b and x["status"] == "reading"]
        if others:
            print(f"Note: also reading {', '.join(others)}. The site's Now reading card shows the first 'reading' book in the file.")
        msg = f"Re-read #{r['n']}: {b['title']}"
    save(d)
    print(msg)
    show()
    if not args.no_push:
        git_push(msg)


if __name__ == "__main__":
    main()
