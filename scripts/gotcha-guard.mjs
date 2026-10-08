#!/usr/bin/env node
// Gotcha guard: bugs this studio has ACTUALLY shipped, turned into checks that run on every PR.
//
// Each rule names the incident it comes from. A memory note only helps if someone remembers to
// read it; this runs whether anyone remembers or not (2026-10-08 dev/test/deploy review).
//
// Exempt one line on purpose with a trailing comment:  // gotcha-ok: <why this is safe>
// Run: node scripts/gotcha-guard.mjs        (exit 1 = a known bug pattern is back)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, keep) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p, keep);
    return keep.test(name) ? [p] : [];
  });
}

/** Source with comments blanked out (line numbers preserved), so prose about a bug never trips it. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
}

const load = (p) => {
  const raw = readFileSync(p, 'utf8');
  return { path: relative(ROOT, p).replace(/\\/g, '/'), lines: raw.split('\n'), src: code(raw) };
};
const src = walk(join(ROOT, 'src'), /\.(js|mjs)$/).map(load);
const specs = walk(join(ROOT, 'tests', 'e2e'), /\.spec\.js$/).map(load);
const problems = [];
const report = (f, idx, rule, why) => {
  if (idx >= 0 && /gotcha-ok:/.test(f.lines[idx] ?? '')) return;
  problems.push(`${f.path}${idx >= 0 ? `:${idx + 1}` : ''}  [${rule}]  ${why}`);
};
const eachLine = (f, re, fn) => f.src.split('\n').forEach((l, i) => { if (re.test(l)) fn(i, l); });

// 1. Every image 404ing while the game stayed "playable" (shipped July 2026). Every asset path the
//    code names must exist in public/.
for (const f of src) {
  eachLine(f, /['"`](?:media|audio|icons)\/[^'"`$]+\.(?:png|webp|jpe?g|mp3|ogg|m4a|wav)['"`]/, (i, l) => {
    for (const m of l.matchAll(/['"`]((?:media|audio|icons)\/[^'"`$]+\.(?:png|webp|jpe?g|mp3|ogg|m4a|wav))['"`]/g)) {
      if (!existsSync(join(ROOT, 'public', m[1]))) report(f, i, 'asset-exists', `public/${m[1]} does not exist: it will 404 in production`);
    }
  });
}

// 2. iOS puts the AudioContext in "interrupted", not "suspended": the game came back silent (QA round 3).
for (const f of src) {
  eachLine(f, /state\s*===?\s*['"]suspended['"]/, (i) => report(f, i, 'audio-resume-any-state',
    "check state !== 'running' so iOS's 'interrupted' state is resumed too"));
}

// 3. The offline e2e opens the service-worker cache by name; renaming it silently breaks offline
//    support's only test (memory project_critique_depth_2026-10-07).
const sw = join(ROOT, 'public', 'sw.js');
if (existsSync(sw) && !/CACHE_NAME\s*=\s*['"]gigworker-v1['"]/.test(readFileSync(sw, 'utf8'))) {
  problems.push("public/sw.js  [sw-cache-name]  CACHE_NAME must stay 'gigworker-v1' (content updates flow through install anyway)");
}

// 4. Every spec must use the shared fixture, or it silently skips the JavaScript-error check.
for (const f of specs) {
  eachLine(f, /from\s+['"]@playwright\/test['"]/, (i) => report(f, i, 'use-error-fixture',
    "import { test, expect } from './fixtures.js' so the test fails on JavaScript errors"));
}

// 5. Retries turn a flaky test into a silent pass (2026-10-08 review).
const pw = load(join(ROOT, 'playwright.config.js'));
eachLine(pw, /retries\s*:\s*[^0\s]/, (i) => report(pw, i, 'no-retries', 'retries must be 0; fix or test.fixme a flaky test'));

if (problems.length) {
  console.error(`gotcha-guard: ${problems.length} known bug pattern(s) found\n\n${problems.join('\n')}\n`);
  console.error('Fix the pattern, or mark a deliberate exception on that line with:  // gotcha-ok: <why>');
  process.exit(1);
}
console.log(`gotcha-guard: ${src.length} source files and ${specs.length} specs clean (5 rules)`);
