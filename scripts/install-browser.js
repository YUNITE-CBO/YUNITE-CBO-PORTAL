#!/usr/bin/env node
/**
 * Force-installs a headless Chromium into the puppeteer browser cache.
 *
 * The app imports `puppeteer-core` (NOT `puppeteer`), which ships NO
 * postinstall download step — so nothing automatically populates the browser
 * cache during `npm ci`. This script is the npm `postinstall` hook that does
 * it instead, calling @puppeteer/browsers' install() directly to fetch the
 * exact Chrome build that puppeteer-core pins (from puppeteer-core's
 * revisions), independent of PUPPETEER_EXECUTABLE_PATH /
 * PUPPETEER_SKIP_DOWNLOAD. Using the pinned build (not "stable"/latest)
 * matters: puppeteer-core's driver is tested against this specific build; a
 * mismatched newer build can crash at runtime.
 *
 * Usage: node scripts/install-browser.js   (also runs as npm postinstall)
 */
const os = require('os');
const path = require('path');
const { existsSync } = require('fs');

async function main() {
  const browsers = require('@puppeteer/browsers');
  const { Browser, BrowserPlatform, resolveBuildId, install, getInstalledBrowsers, uninstall } = browsers;

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
  const chrome = installed.find(
    (b) => b.browser === Browser.CHROME && b.platform === platform && b.buildId === buildId,
  );
  if (chrome) {
    // Verify the executable actually exists on disk. Render (and other hosts)
    // persist the browser cache across builds, and a previous build can leave
    // a CORRUPT entry: the .metadata says "installed" but the binary is gone
    // (e.g. an interrupted/partial extraction). Trusting the metadata here
    // would leave no working binary at runtime, so we uninstall and re-download.
    if (chrome.executablePath && existsSync(chrome.executablePath)) {
      console.log(`[install-browser] chrome ${buildId} already cached at ${chrome.executablePath}`);
      return;
    }
    console.warn(`[install-browser] chrome ${buildId} listed in cache but executable missing (${chrome.executablePath}); re-downloading.`);
    try {
      await uninstall({ cacheDir, browser: Browser.CHROME, buildId, platform });
    } catch (e) {
      console.warn(`[install-browser] uninstall of corrupt chrome entry failed (${e?.message}); proceeding to reinstall.`);
    }
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
