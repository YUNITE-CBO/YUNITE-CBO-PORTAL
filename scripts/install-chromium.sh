#!/usr/bin/env bash
# scripts/install-chromium.sh
#
# Idempotently installs a headless-capable Chromium for PDF generation
# (puppeteer-core needs a system Chromium on the server; it does NOT bundle
# one). Designed for Render's Node runtime (Debian/Ubuntu-based) but safe to
# run anywhere with apt-get.
#
# Sets nothing in the environment itself — the web service's
# PUPPETEER_EXECUTABLE_PATH env var (render.yaml) points at the installed
# binary. Locally, /usr/bin/chromium is the most common path.
#
# Usage: bash scripts/install-chromium.sh
# Exits 0 if a usable chromium is already present or was installed.
set -euo pipefail

# 1. Already on PATH? (local dev / pre-baked image)
if command -v chromium >/dev/null 2>&1; then
  echo "[install-chromium] chromium already on PATH: $(command -v chromium)"
  exit 0
fi
if command -v chromium-browser >/dev/null 2>&1; then
  echo "[install-chromium] chromium-browser already on PATH: $(command -v chromium-browser)"
  exit 0
fi
if command -v google-chrome >/dev/null 2>&1; then
  echo "[install-chromium] google-chrome already on PATH: $(command -v google-chrome)"
  exit 0
fi

# 2. Try apt-get (Render / Debian / Ubuntu)
if command -v apt-get >/dev/null 2>&1; then
  echo "[install-chromium] installing via apt-get (may take a minute)…"
  apt-get update -qq
  # chromium is the package on Debian; chromium-browser on older Ubuntu.
  # Install whichever resolves; ignore failure of the fallback.
  if apt-get install -y --no-install-recommends chromium 2>/dev/null; then
    echo "[install-chromium] installed 'chromium'"
  elif apt-get install -y --no-install-recommends chromium-browser 2>/dev/null; then
    echo "[install-chromium] installed 'chromium-browser'"
  else
    echo "[install-chromium] apt-get install failed; PDF generation will not work until Chromium is available." >&2
    exit 1
  fi
  exit 0
fi

# 3. apk (Alpine) — not used by Render but kept for portability
if command -v apk >/dev/null 2>&1; then
  echo "[install-chromium] installing via apk…"
  apk add --no-cache chromium nss freetype freetype-dev harfbuzz ca-certificates ttf-freefont
  echo "[install-chromium] installed chromium via apk"
  exit 0
fi

echo "[install-chromium] no supported package manager found; cannot install Chromium." >&2
exit 1
