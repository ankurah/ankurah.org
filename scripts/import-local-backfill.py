#!/usr/bin/env python3
"""Copy completed local backfill records into the standalone preview without rerunning them."""

import argparse
import json
import re
from pathlib import Path


def copy_evidence(source, destination):
    if source.is_symlink() or not source.is_file():
        raise ValueError(f"Evidence must be a regular file: {source}")
    contents = source.read_bytes()
    if destination.exists() and destination.read_bytes() != contents:
        raise ValueError(f"Immutable evidence changed: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(contents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Canonical local-backfill directory")
    parser.add_argument("--history", type=Path, help="Optional audited index projection; raw evidence still comes from source")
    args = parser.parse_args()
    history = json.loads((args.history or args.source / "history.json").read_text())
    if history.get("schema_version") != 1:
        raise ValueError("Unsupported history schema")
    destination = Path(__file__).resolve().parents[1] / "performance/backfill"
    catalog_path = args.source / "catalog.json"
    if catalog_path.exists():
        catalog = json.loads(catalog_path.read_text())
        if catalog.get("schema_version") != 1 or not isinstance(catalog.get("benchmarks"), list):
            raise ValueError("Unsupported benchmark catalog")
        history["benchmarks"] = catalog["benchmarks"]
        history["catalog_url"] = "backfill/catalog.json"
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "catalog.json").write_bytes(catalog_path.read_bytes())
    records = history["runs"] + history.get("attempts", [])
    for record in records:
        identifier = record["id"]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}", identifier):
            raise ValueError("Invalid local run identifier")
        if record["kind"] != "local":
            raise ValueError("This importer only copies local measurements")
        source = args.source / "runs" / identifier
        # Preserve diagnostic summaries and the exact instrument; bulk compiler logs
        # stay in the canonical workspace and are not sent to every site visitor.
        for name in ("raw.json", "adapter.json", "adapter.patch", "commands.json", "Cargo.lock"):
            if (source / name).exists():
                copy_evidence(source / name, destination / "runs" / identifier / name)
        if record in history["runs"] and not (destination / "runs" / identifier / "raw.json").exists():
            raise ValueError(f"Successful run is missing raw evidence: {identifier}")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "history.json").write_text(json.dumps(history, indent=2, allow_nan=False) + "\n")
    print(f"Copied {len(history['runs'])} completed local runs and {len(history.get('attempts', []))} diagnostic attempts")


if __name__ == "__main__":
    main()
