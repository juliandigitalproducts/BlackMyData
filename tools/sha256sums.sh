#!/usr/bin/env bash
# Writes SHA256 checksums of release artifacts (code review BMD-N11), one "hash  name" line per file, in the format
# `sha256sum -c` / `shasum -a 256 -c` check. Run in the folder that holds the files:
#   (cd dist && ../tools/sha256sums.sh SHA256SUMS-Linux-1.0.2.txt file1 file2)
set -euo pipefail
out=$1; shift
if command -v sha256sum >/dev/null 2>&1; then sum() { sha256sum "$@"; }; else sum() { shasum -a 256 "$@"; }; fi
sum "$@" > "$out.tmp"
mv "$out.tmp" "$out"
echo "Checksums: $out"
