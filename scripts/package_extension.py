#!/usr/bin/env python3
"""Build an installable ZIP with the extension manifest at archive root."""

import argparse
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
EXTENSION_FILES = (
    "manifest.json",
    "popup.html",
    "popup.css",
    "popup.js",
    "cache.js",
    "collector.js",
    "prompt.js",
    "tabs.js",
    "icons/icon-16.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="Git tag, for example v1.2.0")
    args = parser.parse_args()

    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if args.tag != f"v{version}":
        parser.error(f"tag {args.tag!r} does not match manifest version {version!r}")

    archive = ROOT / "dist" / f"mesh-grades-extension-{version}.zip"
    archive.parent.mkdir(exist_ok=True)
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as output:
        for relative_path in EXTENSION_FILES:
            source = ROOT / relative_path
            if not source.is_file():
                parser.error(f"missing extension file: {relative_path}")
            output.write(source, arcname=relative_path)
    print(archive)


if __name__ == "__main__":
    main()
