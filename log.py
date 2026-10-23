#!/usr/bin/env python3
"""Reading Quest logger: edits data/reading.json, prints stats, commits and pushes.

Examples
  ./log.py read --pages 12 --chapters 1 --minutes 20 --note "Rocky!"   # log today's reading
  ./log.py read --minutes 30 --date 2026-10-25 --time 23:15            # back-date, with time (night owl)
  ./log.py finish                                                       # finish the current book
  ./log.py start --title "The Martian" --author "Andy Weir" --pages 384 --chapters 26
  ./log.py add --title "Dune" --author "Frank Herbert" --pages 688       # add to Next up
  ./log.py remove --book dune                                           # drop from Next up
  ./log.py yearly 15                                                    # change the yearly book goal
  ./log.py undo                                                         # remove the last log entry
  ./log.py show                                                         # print stats, no changes
Add --no-push to any command to only edit the file (no git commit/push).
"""
import argparse, datetime, json, os, re, subprocess, sys
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data", "reading.json")


def load():
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)


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

    a = sub.add_parser("add", help="add a book to Next up")
    a.add_argument("--title", required=True); a.add_argument("--author", default="")
    a.add_argument("--pages", type=int); a.add_argument("--chapters", type=int)

    rm = sub.add_parser("remove", help="remove a Next-up book"); rm.add_argument("--book", required=True)
    y = sub.add_parser("yearly", help="set yearly book goal"); y.add_argument("n", type=int)
    sub.add_parser("undo", help="remove the most recent log entry")
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
        if args.time:
            e["time"] = args.time
        d["log"].append(e)
        msg = f"Log {e['date']}: {args.pages}p {args.chapters}ch {args.minutes}min ({b['title']})"
    elif args.cmd == "finish":
        b = find_book(d, args.book)
        b["status"], b["finished"] = "finished", args.date or t
        msg = f"Finished {b['title']}"
    elif args.cmd == "start":
        b = next((x for x in d["books"] if x["title"].lower() == args.title.lower()), None)
        if not b:
            b = {"id": slug(args.title), "title": args.title, "author": args.author}
            d["books"].append(b)
        for k, v in (("author", args.author), ("totalPages", args.pages), ("totalChapters", args.chapters)):
            if v:
                b[k] = v
        b.pop("suggested", None)
        b.update(status="reading", started=args.date or t, finished=None)
        msg = f"Started {b['title']}"
    elif args.cmd == "add":
        if any(x["title"].lower() == args.title.lower() for x in d["books"]):
            sys.exit("That book is already in the data file.")
        b = {"id": slug(args.title), "title": args.title, "author": args.author, "status": "next", "started": None, "finished": None}
        if args.pages: b["totalPages"] = args.pages
        if args.chapters: b["totalChapters"] = args.chapters
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
    save(d)
    print(msg)
    show()
    if not args.no_push:
        git_push(msg)


if __name__ == "__main__":
    main()
