# The Full Record

**Every word, worldwide, zero opinion.**

Complete official transcripts, exactly as published. Nothing is summarised, shortened or rewritten, and no record is saved without a direct link to the source it came from.

**Read it here:** https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/

---

## What this is

Two pieces.

**A collector.** Once a day, a small program reads a fixed list of official transcript pages, pulls out the words, and saves them into this repository as files.

**A reader.** A single web page that shows those files and lets you search them.

Every save is recorded in this repository's history, with a date. If a source ever changes the wording of something it already published, the change shows up in the history as a visible difference. Nobody has to be trusted for that to work — it is simply how version history behaves. That dated public trail is the point of the project, not a side effect.

## What it does not do

- **No API keys.** Not ours, not yours, not a reader's. There is nothing here to steal.
- **No credit card, ever, for anyone.**
- **No AI.** Nothing summarises, shortens, rewrites or interprets. The words that come out are the words that went in.
- **No live searching of the internet.** The collector checks a fixed list of addresses we already know. The search box on the site searches what has been collected — not the web. No algorithm decides what is worth showing you.
- **No outside code.** The reader page loads nothing from any other company's server — no frameworks, no fonts, no tracking. Nothing can be swapped out from somewhere else.

## Honest limits

- **Timing is not guaranteed.** The daily job runs when GitHub gets to it. Delays of ten to thirty minutes are normal, and longer happens. Do not promise readers an exact update time.
- **Some sources are unverified.** Every entry in `sources.json` is marked `confirmed` or `unconfirmed`. Unconfirmed means nobody has watched it succeed yet. Untested is a gap, not a blank.
- **The extraction methods are guesses until proven.** The collector tries several ways to find the words on a page. Every saved record states which method was used, so you can always tell.
- **Some sites refuse automated visitors.** That is their decision, not a fault in this code. The honest responses are to ask permission or to use a source that welcomes it.

## Copyright — an open question, not a settled one

Works produced by the US federal government carry no copyright, so the government's own record of what an official said can be republished freely. Archives that host and organise those records may hold rights in their own compilation and notes.

Every record here stores and displays its direct source link, and readers are sent to the original. That is a defensible position. It is not a cleared one. Get a lawyer's opinion before publishing at scale.

## Before launching

- [ ] Put a real contact address in `CONTACT` at the top of `collect.mjs`, so sources can reach a person
- [ ] Get the copyright question answered properly
- [ ] Confirm each unconfirmed source, or remove it
- [ ] Replace the guessed extraction methods with the proven ones

---

Setting it up: see [SETUP.md](SETUP.md).
