#!/usr/bin/env python3
"""Validate every internal markdown link and anchor in the book source.

Checks, for each src/**/*.md chapter:
  - SUMMARY.md entries point at files that exist
  - relative .md links resolve (directory-aware)
  - #fragment anchors match a real heading slug in the target file
    (GitHub/mdBook slug rules: lowercase, punctuation stripped,
    spaces to hyphens, backticks removed)
  - same-page #fragment links match a heading in that file

Run from the repo root: python3 scripts/check-links.py
Exits nonzero if anything is broken. Used before every docs push during
the 0.9.0 documentation pass; wire into CI if doc churn keeps up.
"""
import re
import os
import glob
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

files = [f for f in glob.glob("**/*.md", recursive=True) if f != "SUMMARY.md"]
slugs = {}
for f in files:
    slugs[f] = set()
    for line in open(f):
        m = re.match(r"^(#+)\s+(.*)", line)
        if m:
            h = m.group(2).strip().replace("`", "")
            s = re.sub(r"[^\w\s-]", "", h).strip().lower()
            slugs[f].add(re.sub(r"\s+", "-", s))

bad = 0
for m in re.finditer(r"\]\(([^)#\s]+\.md)\)", open("SUMMARY.md").read()):
    if not os.path.exists(m.group(1)):
        print(f"SUMMARY BROKEN: {m.group(1)}")
        bad += 1

for f in files:
    d = os.path.dirname(f)
    text = open(f).read()
    for m in re.finditer(r"\]\(([^)\s]+?\.md)(#([A-Za-z_0-9-]+))?\)", text):
        target = os.path.normpath(os.path.join(d, m.group(1)))
        if not os.path.exists(target):
            print(f"BROKEN FILE: {f} -> {m.group(1)}")
            bad += 1
        elif m.group(3) and m.group(3) not in slugs.get(target, set()):
            print(f"BROKEN ANCHOR: {f} -> {m.group(1)}#{m.group(3)}")
            bad += 1
    for m in re.finditer(r"\]\(#([A-Za-z_0-9-]+)\)", text):
        if m.group(1) not in slugs[f]:
            print(f"BROKEN SELF-LINK: {f} -> #{m.group(1)}")
            bad += 1

if bad:
    print(f"{bad} broken link(s)")
    sys.exit(1)
print(f"ALL LINKS OK across {len(files)} files")
