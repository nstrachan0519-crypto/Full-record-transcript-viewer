/*
 * The Full Record — the collector.
 * Reads a fixed list of official sources and saves what they published, word for word.
 * No AI. No API keys. No dependencies. Node 18 or newer.
 *
 * Run it:            node collect.mjs
 * Test one page:     node collect.mjs --debug https://example.gov/some-transcript
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// ---------------------------------------------------------------------------
// SETTINGS — change these before you launch.
// ---------------------------------------------------------------------------

// Put a real address here so a source can reach a person if this misbehaves.
const CONTACT = "contact@example.com"; // <-- CHANGE THIS
const USER_AGENT = `TheFullRecord/1.0 (transcript archive; ${CONTACT})`;

const OUT_DIR = "docs/records";       // one file per transcript
const INDEX_FILE = "docs/index.json"; // the list the website reads
const LOG_FILE = "docs/last-run.json";// what happened on the most recent run
const MAX_RECORDS_KEPT = 600;         // newest kept, oldest dropped
const MIN_CHARS = 400;                // shorter than this is treated as a failed grab
const PAUSE_MS = 1500;                // wait between requests, to be a polite visitor
const TIMEOUT_MS = 25000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function log(...a) {
  console.log(...a);
}

async function get(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en",
      },
      redirect: "follow",
      signal: ctl.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, finalUrl: res.url || url };
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Cleaning. Anything that could run as code is removed before we keep a word.
// ---------------------------------------------------------------------------

function stripDangerous(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function stripChrome(html) {
  return html
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ");
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201C", rdquo: "\u201D",
};

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function toText(html) {
  const withBreaks = html
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return decode(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

// Where the words usually live. Order matters — first good hit wins.
// If one method proves right for a source, move it to the top and delete guesses.
const CONTENT_CANDIDATES = [
  { method: "<article>", re: /<article\b[^>]*>([\s\S]*?)<\/article>/i },
  { method: "<main>", re: /<main\b[^>]*>([\s\S]*?)<\/main>/i },
  { method: 'role="main"', re: /<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i },
  { method: "class contains transcript", re: /<(?:div|section)[^>]*class=["'][^"']*transcript[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i },
  { method: "class contains body-content", re: /<(?:div|section)[^>]*class=["'][^"']*(?:body-content|page-content|entry-content|field--name-body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i },
  { method: "whole <body> (last resort)", re: /<body\b[^>]*>([\s\S]*?)<\/body>/i },
];

function extract(html) {
  const safe = stripChrome(stripDangerous(html));
  let best = { text: "", method: "nothing found" };
  for (const c of CONTENT_CANDIDATES) {
    const m = safe.match(c.re);
    if (!m) continue;
    const text = toText(m[1]);
    if (text.length > best.text.length) best = { text, method: c.method };
    if (best.text.length >= MIN_CHARS && c.method !== "whole <body> (last resort)") break;
  }
  return best;
}

function titleOf(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = toText(h1[1]);
    if (t) return t.slice(0, 300);
  }
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return t ? toText(t[1]).slice(0, 300) : "Untitled";
}

// ---------------------------------------------------------------------------
// Feed reading. A feed is a machine-readable list of new pages (RSS or Atom).
// ---------------------------------------------------------------------------

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    let link =
      (b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || [])[1] ||
      (b.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
      (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] ||
      (b.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1];
    if (!link) continue;
    link = decode(link.trim());
    if (!/^https?:\/\//i.test(link)) continue;

    const title = decode(
      ((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim()
    );
    const date =
      ((b.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i) || [])[1] || "").trim();

    items.push({ link, title, date });
  }
  return items;
}

function isoDate(s) {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d) ? d.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Debug mode — shows exactly what the collector can see on one page.
// ---------------------------------------------------------------------------

async function debugOne(url) {
  log(`\nFetching ${url}\n`);
  const r = await get(url);
  log(`HTTP status: ${r.status}`);
  log(`Bytes received: ${r.body.length}`);
  if (!r.ok) {
    log(`\nThe site refused. 403 means it blocks automated visitors — that is its choice, not a bug.`);
    return;
  }
  const safe = stripChrome(stripDangerous(r.body));
  log(`\nWhat each method finds:`);
  for (const c of CONTENT_CANDIDATES) {
    const m = safe.match(c.re);
    log(`  ${String(m ? toText(m[1]).length : 0).padStart(7)} characters — ${c.method}`);
  }
  const best = extract(r.body);
  log(`\nWinner: ${best.method} (${best.text.length} characters)`);
  log(`Title: ${titleOf(r.body)}`);
  log(`\nFirst 600 characters:\n---\n${best.text.slice(0, 600)}\n---`);
  const links = parseFeed(r.body);
  if (links.length) log(`\nThis also looks like a feed: ${links.length} entries found.`);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function loadIndex() {
  try {
    return JSON.parse(await readFile(INDEX_FILE, "utf8"));
  } catch {
    return { generated: null, records: [] };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--debug") {
    if (!args[1]) return log("Give an address: node collect.mjs --debug https://...");
    return debugOne(args[1]);
  }

  const config = JSON.parse(await readFile("sources.json", "utf8"));
  const maxPer = config.max_items_per_source || 5;
  await mkdir(OUT_DIR, { recursive: true });

  const index = await loadIndex();
  const known = new Set(index.records.map((r) => r.id));
  const report = [];
  let added = 0;

  log(`The Full Record — collector`);
  log(`Started ${new Date().toISOString()}`);
  log(`Sources: ${config.sources.length}\n`);

  for (const src of config.sources) {
    const line = { id: src.id, name: src.name, feedStatus: null, found: 0, saved: 0, failures: [] };
    log(`--- ${src.name} (${src.status})`);
    log(`    feed: ${src.feed}`);

    let feed;
    try {
      feed = await get(src.feed);
    } catch (e) {
      line.feedStatus = `error: ${e.message}`;
      log(`    FAILED to reach the feed: ${e.message}`);
      report.push(line);
      continue;
    }
    line.feedStatus = feed.status;
    if (!feed.ok) {
      log(`    Feed refused with status ${feed.status}${feed.status === 403 ? " (blocks automated visitors)" : ""}`);
      report.push(line);
      continue;
    }

    const items = parseFeed(feed.body).slice(0, maxPer);
    line.found = items.length;
    log(`    ${items.length} entries in the feed`);
    if (!items.length) {
      log(`    No entries readable. The feed address may be wrong, or the page is built by JavaScript.`);
      report.push(line);
      continue;
    }

    for (const item of items) {
      const id = `${src.id}-${sha(item.link)}`;
      if (known.has(id)) {
        log(`    already have: ${item.title || item.link}`);
        continue;
      }
      await sleep(PAUSE_MS);

      let page;
      try {
        page = await get(item.link);
      } catch (e) {
        line.failures.push({ url: item.link, why: e.message });
        log(`    FAILED ${item.link} — ${e.message}`);
        continue;
      }
      if (!page.ok) {
        line.failures.push({ url: item.link, why: `HTTP ${page.status}` });
        log(`    FAILED ${item.link} — HTTP ${page.status}`);
        continue;
      }

      const { text, method } = extract(page.body);
      if (text.length < MIN_CHARS) {
        line.failures.push({ url: item.link, why: `only ${text.length} characters found` });
        log(`    TOO SHORT ${item.link} — ${text.length} characters via ${method}`);
        continue;
      }

      const record = {
        id,
        title: item.title || titleOf(page.body),
        sourceId: src.id,
        sourceName: src.name,
        country: src.country || "",
        url: page.finalUrl,
        published: isoDate(item.date),
        collected: new Date().toISOString(),
        method,
        chars: text.length,
        text,
      };

      await writeFile(path.join(OUT_DIR, `${id}.json`), JSON.stringify(record, null, 1));
      index.records.unshift({
        id: record.id,
        title: record.title,
        sourceId: record.sourceId,
        sourceName: record.sourceName,
        country: record.country,
        url: record.url,
        published: record.published,
        collected: record.collected,
        method: record.method,
        chars: record.chars,
        snippet: text.slice(0, 700),
      });
      known.add(id);
      added++;
      line.saved++;
      log(`    SAVED ${record.chars} characters via ${method} — ${record.title}`);
    }
    report.push(line);
  }

  index.records.sort((a, b) => (b.published || b.collected).localeCompare(a.published || a.collected));
  if (index.records.length > MAX_RECORDS_KEPT) index.records.length = MAX_RECORDS_KEPT;
  index.generated = new Date().toISOString();
  index.count = index.records.length;

  await writeFile(INDEX_FILE, JSON.stringify(index, null, 1));
  await writeFile(
    LOG_FILE,
    JSON.stringify({ finished: new Date().toISOString(), added, total: index.records.length, sources: report }, null, 1)
  );

  // Delete record files no longer in the index, so the folder cannot grow forever.
  const keep = new Set(index.records.map((r) => `${r.id}.json`));
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith(".json") && !keep.has(f)) {
      await writeFile(path.join(OUT_DIR, f), "").catch(() => {});
    }
  }

  log(`\nFinished. Added ${added} new record(s). Total in the archive: ${index.records.length}.`);
  if (added === 0) log(`Nothing new was saved. Read the per-source lines above — they say why.`);
}

main().catch((e) => {
  console.error("The collector stopped:", e);
  process.exit(1);
});
