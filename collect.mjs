/*
 * THE FULL RECORD — collector
 * every word, worldwide, zero opinion.
 *
 * WHAT THIS IS, IN PLAIN LANGUAGE
 * -------------------------------
 * This program runs once a day on GitHub's computers. It reads official
 * transcript pages, pulls out the words exactly as published, and saves them
 * as files in this repository.
 *
 * WHY SAVING THEM AS FILES MATTERS
 * Every save is recorded in the repository's history, with a date. If a
 * source ever changes the wording of something it already published, that
 * change shows up in the history as a visible difference. Nobody has to be
 * trusted for that to work — it is just how version history behaves. That
 * public, dated trail is the point of this project, not a side effect.
 *
 * WHAT THIS PROGRAM DOES NOT DO
 *  - No API keys. Nothing to steal, for us or for anyone using the site.
 *  - No credit card, ever, for anyone.
 *  - No AI. Nothing summarises, shortens, rewrites or interprets.
 *    The words that come out are the words that went in.
 *  - No searching. We check a fixed list of addresses we already know.
 *
 * COPYRIGHT — OPEN ITEM, NOT SETTLED. READ BEFORE PUBLISHING WIDELY.
 * Works produced by the US federal government carry no copyright, so the
 * government's own record of what an official said can be republished
 * freely. Archives that host and organise those records may hold rights in
 * their own compilation and notes. Every record here therefore stores and
 * displays its direct source link, and readers are sent to the original.
 * That is a defensible position, not a cleared one. Get a lawyer's opinion
 * before publishing at scale. Flagged open per METHOD FILE §10 —
 * flag, never strike.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// SOURCES — the doors we already know the address of
// ---------------------------------------------------------------------------
// We never search. We check the same addresses every day. That is what keeps
// this free and what keeps it honest: no algorithm decides what is worth
// showing you.
//
// verified:
//   "confirmed"   = this listing page was checked directly and it worked
//   "unconfirmed" = not yet checked. Do not trust it until it is.
// Untested is a gap, not a blank (METHOD FILE §12D).

const SOURCES = [
  {
    id: "app-remarks",
    label: "Presidential remarks and addresses",
    org: "The American Presidency Project (UC Santa Barbara)",
    listUrl:
      "https://www.presidency.ucsb.edu/documents/app-categories/presidential/spoken-addresses-and-remarks",
    origin: "https://www.presidency.ucsb.edu",
    verified: "confirmed",
  },
  {
    id: "app-news-conferences",
    label: "Presidential news conferences",
    org: "The American Presidency Project (UC Santa Barbara)",
    listUrl:
      "https://www.presidency.ucsb.edu/documents/app-categories/presidential/news-conferences",
    origin: "https://www.presidency.ucsb.edu",
    verified: "unconfirmed",
  },
  {
    id: "wh-briefings",
    label: "White House briefings and statements",
    org: "The White House",
    listUrl: "https://www.whitehouse.gov/briefings-statements/",
    origin: "https://www.whitehouse.gov",
    verified: "confirmed",
  },
];

// How many new documents to pull from each source per run.
const PER_SOURCE = Number(process.env.PER_SOURCE || 6);

// How many records the front page lists. The archive keeps everything.
const INDEX_SIZE = 100;

// Be a polite guest: one request at a time, with a pause between.
const POLITE_DELAY_MS = 1500;
const USER_AGENT =
  "TheFullRecord/1.0 (civic transcript archive; contact: SET-THIS-BEFORE-LAUNCH)";

const OUT_DIR = "docs/data";
const DOCS_DIR = path.join(OUT_DIR, "documents");

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Source returned ${res.status}`);
  return await res.text();
}

// Turn a messy chunk of web page into plain readable text.
// No library, nothing clever: remove the tags, keep the paragraphs.
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&#8216;|&lsquo;/g, "\u2018")
    .replace(/&#8220;|&ldquo;/g, "\u201C")
    .replace(/&#8221;|&rdquo;/g, "\u201D")
    .replace(/&#8212;|&mdash;/g, "\u2014")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

// ---------------------------------------------------------------------------
// FINDING THE TRANSCRIPT INSIDE A PAGE
// ---------------------------------------------------------------------------
// HONEST NOTE: the exact tag names these archives use to wrap a transcript
// have NOT been verified against the live sites. Rather than guess one and
// silently get nothing, we try several in order and record which one actually
// worked, in every saved record. Run `npm run debug -- <url>` to see the
// answer for any page, then move the real one to the top of this list and
// delete the guesses. METHOD FILE §12B: measure, do not assume.

const CONTENT_CANDIDATES = [
  { name: "field-docs-content", re: /class="[^"]*field-docs-content[^"]*"/i },
  { name: "field--name-body", re: /class="[^"]*field--name-body[^"]*"/i },
  { name: "node__content", re: /class="[^"]*node__content[^"]*"/i },
  { name: "article-body", re: /class="[^"]*article-?body[^"]*"/i },
  { name: "entry-content", re: /class="[^"]*entry-content[^"]*"/i },
];

function extractBlock(html, re) {
  const match = re.exec(html);
  if (!match) return null;
  const start = html.lastIndexOf("<", match.index);
  if (start < 0) return null;
  return html.slice(start, start + 400000);
}

function longestParagraphRun(html) {
  const paras = html.match(/<p[\s>][\s\S]*?<\/p>/gi);
  if (!paras || paras.length === 0) return null;
  return paras.join("\n");
}

export function extractTranscript(html) {
  for (const cand of CONTENT_CANDIDATES) {
    const block = extractBlock(html, cand.re);
    if (block) {
      const text = htmlToText(block);
      if (text.length > 400) return { text, method: cand.name };
    }
  }
  const fallback = longestParagraphRun(html);
  if (fallback) {
    const text = htmlToText(fallback);
    if (text.length > 400) return { text, method: "longest-paragraph-run" };
  }
  return { text: "", method: "none" };
}

export function extractTitle(html) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) {
    const t = htmlToText(h1[1]);
    if (t) return t;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return title ? htmlToText(title[1]).split("|")[0].trim() : "Untitled record";
}

export function extractDate(html) {
  const timeTag = /<time[^>]*datetime="([^"]+)"/i.exec(html);
  if (timeTag) return timeTag[1].slice(0, 10);
  const meta =
    /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i.exec(
      html
    );
  if (meta) return meta[1].slice(0, 10);
  return null;
}

// Only follow links that stay on the source's own site, and that look like a
// document rather than a menu, a category or a page number.
export function extractLinks(html, origin, limit = 15) {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    let href = m[1];
    const label = htmlToText(m[2]);

    if (!href || href.startsWith("#")) continue;
    if (href.startsWith("/")) href = origin + href;
    if (!href.startsWith(origin)) continue;
    if (seen.has(href)) continue;

    const looksLikeDoc =
      /\/documents\/[a-z0-9-]{8,}/i.test(href) ||
      /\/briefings-statements\/\d{4}\//i.test(href) ||
      /\/remarks\/\d{4}\//i.test(href);
    if (!looksLikeDoc) continue;
    if (/app-categories|advanced-search|\/page\//i.test(href)) continue;
    if (label.length < 12) continue;

    seen.add(href);
    out.push({ url: href, title: label });
  }
  return out;
}

// A stable, safe filename derived from the source URL.
export function slugFor(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 120);
}

// ---------------------------------------------------------------------------
// DEBUG MODE — replaces guesses with facts
// ---------------------------------------------------------------------------

async function runDebug(target) {
  if (!SOURCES.some((s) => target.startsWith(s.origin))) {
    console.error("That site is not on the source list. Refusing.");
    process.exit(1);
  }
  const html = await politeFetch(target);
  const { text, method } = extractTranscript(html);
  console.log(
    JSON.stringify(
      {
        target,
        htmlLength: html.length,
        extractionMethod: method,
        whichCandidatesMatched: CONTENT_CANDIDATES.filter((c) =>
          c.re.test(html)
        ).map((c) => c.name),
        title: extractTitle(html),
        date: extractDate(html),
        wordCount: text ? text.split(/\s+/).length : 0,
        documentLinksFound: extractLinks(html, new URL(target).origin, 10),
        textPreview: text.slice(0, 1500),
      },
      null,
      2
    )
  );
}

// ---------------------------------------------------------------------------
// THE COLLECTOR
// ---------------------------------------------------------------------------

async function loadExistingIndex() {
  const file = path.join(OUT_DIR, "index.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

async function collect() {
  await mkdir(DOCS_DIR, { recursive: true });

  const existing = await loadExistingIndex();
  const known = new Set(existing.map((r) => r.sourceUrl));

  const report = {
    startedAt: new Date().toISOString(),
    sources: [],
    newRecords: 0,
    skippedAlreadyHave: 0,
  };
  const added = [];

  for (const source of SOURCES) {
    const sr = {
      id: source.id,
      org: source.org,
      listUrl: source.listUrl,
      linksFound: 0,
      stored: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const listHtml = await politeFetch(source.listUrl);
      const links = extractLinks(listHtml, source.origin, PER_SOURCE);
      sr.linksFound = links.length;

      if (links.length === 0) {
        sr.errors.push(
          "No document links found. The listing page may be built by " +
            "JavaScript, or the link pattern may have changed. " +
            "Run the debug command on this URL to see what is actually there."
        );
      }

      for (const link of links) {
        if (known.has(link.url)) {
          sr.skipped++;
          report.skippedAlreadyHave++;
          continue;
        }
        await sleep(POLITE_DELAY_MS);
        try {
          const docHtml = await politeFetch(link.url);
          const { text, method } = extractTranscript(docHtml);

          if (!text || text.length < 400) {
            sr.errors.push(
              `Too little text from ${link.url} (method: ${method})`
            );
            continue;
          }

          const record = {
            slug: slugFor(link.url),
            title: extractTitle(docHtml) || link.title,
            date: extractDate(docHtml),
            // The source URL is the record's identity. There is no record
            // without one. This is the unbreakable rule, enforced by structure
            // rather than by remembering to follow it.
            sourceUrl: link.url,
            sourceOrg: source.org,
            sourceLabel: source.label,
            firstCollectedAt: new Date().toISOString(),
            extractionMethod: method,
            wordCount: text.split(/\s+/).length,
          };

          await writeFile(
            path.join(DOCS_DIR, record.slug + ".json"),
            JSON.stringify({ ...record, text }, null, 2) + "\n",
            "utf8"
          );

          added.push(record);
          known.add(link.url);
          sr.stored++;
          report.newRecords++;
        } catch (err) {
          sr.errors.push(`${link.url}: ${err.message}`);
        }
      }
    } catch (err) {
      sr.errors.push(`Listing page failed: ${err.message}`);
    }

    report.sources.push(sr);
  }

  // Merge new records into the existing index. Nothing is ever removed —
  // the archive only grows, so the history stays complete.
  const all = [...added, ...existing];
  const deduped = [];
  const seen = new Set();
  for (const r of all) {
    if (seen.has(r.sourceUrl)) continue;
    seen.add(r.sourceUrl);
    deduped.push(r);
  }
  deduped.sort((a, b) =>
    (b.date || b.firstCollectedAt || "").localeCompare(
      a.date || a.firstCollectedAt || ""
    )
  );

  await writeFile(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note:
          "Verbatim records. Nothing here is summarised, shortened or edited. " +
          "Every record carries the direct link to its source.",
        total: deduped.length,
        records: deduped.slice(0, INDEX_SIZE),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  report.finishedAt = new Date().toISOString();
  report.totalInArchive = deduped.length;

  await writeFile(
    path.join(OUT_DIR, "last-run.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8"
  );

  // Print the whole report, including every failure, so the workflow log
  // shows what did not work as clearly as what did.
  console.log(JSON.stringify(report, null, 2));

  const anyStored = report.newRecords > 0;
  const allSourcesFailed = report.sources.every(
    (s) => s.stored === 0 && s.skipped === 0
  );
  if (allSourcesFailed) {
    console.error(
      "\nEVERY SOURCE RETURNED NOTHING. Not treating this as success."
    );
    process.exit(1);
  }
  if (!anyStored) {
    console.log("\nNo new records today. Everything found was already held.");
  }
}

// ---------------------------------------------------------------------------

// Only act when this file is RUN directly. If another file imports it (the
// self-test does), it must quietly hand over its functions and do nothing
// else. Found by testing: without this guard, importing it started a real
// collection run.
const runDirectly =
  process.argv[1] && import.meta.url === "file://" + path.resolve(process.argv[1]);

if (runDirectly) {
  const arg = process.argv[2];
  if (arg === "--debug") {
    const target = process.argv[3];
    if (!target) {
      console.error("Usage: node collect.mjs --debug <url>");
      process.exit(1);
    }
    await runDebug(target);
  } else {
    await collect();
  }
}
