#!/usr/bin/env node
/**
 * Force-installs a headless Chromium into the puppeteer browser cache,
 * independent of PUPPETEER_EXECUTABLE_PATH / PUPPETEER_SKIP_DOWNLOAD.
 *
 * Why this exists: puppeteer's own postinstall (install.mjs -> downloadBrowsers)
 * SKIPS the download whenever PUPPETEER_EXECUTABLE_PATH is set (it assumes a
 * system browser is provided). On hosts where that env var points at a path
 * that doesn't exist at runtime (e.g. a stale Render Dashboard value), this
 * leaves no binary available and PDF generation fails. This script bypasses
 * that skip logic by calling @puppeteer/browsers' install() directly, so the
 * cache is always populated during `npm ci` via the `postinstall` hook.
 *
 * Usage: node scripts/install-browser.js   (also runs as npm postinstall)
 */
const os = require('os');
const path = require('path');

async function main() {
  const browsers = require('@puppeteer/browsers');
  const { Browser, BrowserPlatform, resolveBuildId, install, getInstalledBrowsers } = browsers;

  const platform = browsers.detectBrowserPlatform
    ? browsers.detectBrowserPlatform()
    : null;
  if (!platform) {
    console.warn('[install-browser] could not detect platform; skipping.');
    return;
  }

  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');

  // Use the exact Chrome build that this puppeteer version pins (from
  // puppeteer-core's revisions), NOT the latest "stable". puppeteer's driver
  // (puppeteer-core) is tested against this specific build; a mismatched
  // newer build can crash with "Navigating frame was detached" /
  // "Connection closed" at runtime.
  let buildId;
  try {
    const revisions = require('puppeteer-core/lib/cjs/puppeteer/revisions.js');
    buildId = revisions.PUPPETEER_REVISIONS.chrome;
  } catch {
    buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  }
  if (!buildId) {
    console.warn('[install-browser] could not resolve a chrome buildId; skipping.');
    return;
  }

  // Already installed? getInstalledBrowsers reads the cache directly and is
  // env-agnostic, so a previous run (even one skipped by puppeteer's own
  // postinstall due to PUPPETEER_EXECUTABLE_PATH) is detected here.
  const installed = await getInstalledBrowsers({ cacheDir });
  const hasChrome = installed.some(
    (b) => b.browser === Browser.CHROME && b.platform === platform && b.buildId === buildId,
  );
  if (hasChrome) {
    const chrome = installed.find(
      (b) => b.browser === Browser.CHROME && b.platform === platform && b.buildId === buildId,
    );
    console.log(`[install-browser] chrome ${buildId} already cached at ${chrome.executablePath}`);
    return;
  }

  console.log(`[install-browser] downloading chrome ${buildId} for ${platform} into ${cacheDir} ...`);
  const result = await install({
    cacheDir,
    browser: Browser.CHROME,
    buildId,
    platform,
  });
  console.log(`[install-browser] installed chrome ${buildId} -> ${result.executablePath}`);
}

main().catch((err) => {
  console.error('[install-browser] failed:', err && err.message ? err.message : err);
  // Non-fatal: a missing browser is surfaced clearly at PDF-render time with
  // a precise error; failing the build here would block unrelated deploys.
  process.exit(0);
});
