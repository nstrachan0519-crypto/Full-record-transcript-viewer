# The Full Record

**Every word, worldwide, zero opinion.**

Complete official transcripts, exactly as published. Nothing is summarised,
shortened or rewritten, and no record is saved without a direct link to the
source it came from.

---

## What this is

Two pieces:

1. **A collector.** Once a day, GitHub runs a small program that reads a fixed
   list of official transcript pages, pulls out the words, and saves them into
   this repository as files.
2. **A reader.** A single web page that shows those files.

Every save is recorded in this repository's history, with a date. If a source
ever changes the wording of something it already published, the change shows up
in the history as a visible difference. Nobody has to be trusted for that to
work — it is simply how version history behaves. **That dated public trail is
the point of the project, not a side effect.**

## What it does not do

- **No API keys.** Not ours, not yours, not a reader's. There is nothing here
  to steal.
- **No credit card**, ever, for anyone.
- **No AI.** Nothing summarises, shortens, rewrites or interprets. The words
  that come out are the words that went in.
- **No searching.** The collector checks a fixed list of addresses we already
  know. No algorithm decides what is worth showing you.
- **No outside code.** The reader page loads nothing from any other company's
  server — no frameworks, no fonts, no tracking. Nothing can be swapped out
  from somewhere else.

---

## Setting it up (all of this works from a phone)

### 1. Make the repository

On github.com: **New repository** → give it a name → set it to **Public** →
Create.

Public matters for two reasons. Free unlimited daily runs only apply to public
repositories, and anyone being able to check the collector's code is part of
the point.

### 2. Upload these files

**Add file → Upload files**, then drag in everything from this folder.

**One thing to watch:** the folder named `.github` starts with a dot, and phones
often hide folders like that. If it does not upload, make it by hand instead:

- **Add file → Create new file**
- Type this as the filename, slashes included:
  `.github/workflows/collect.yml`
- Paste in the contents of `WORKFLOW-collect.yml` (the copy kept in the root of
  this folder for exactly this reason)
- Commit

### 3. Let the collector save its work

**Settings → Actions → General →** scroll down to **Workflow permissions** →
choose **Read and write permissions** → Save.

Without this, the collector runs but cannot save anything.

### 4. Turn on the website

**Settings → Pages →** under Source choose **Deploy from a branch** → branch
`main`, folder `/docs` → Save.

Give it a minute, then your site is at
`https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`

### 5. Run it once by hand

**Actions → Collect the record → Run workflow.**

Do this even though a daily schedule is set. A new schedule often will not start
until the workflow has been run manually at least once. This is a known GitHub
quirk, not a mistake in the setup.

### 6. Read the log

Open the run you just started and read the output. It prints every source,
everything it stored, and **every failure**. That log is your first real
evidence about whether the sources will serve an automated visitor.

---

## When something is not working

**Everything failed with 403.** The site is refusing automated visitors. That is
the site's decision, not a bug. The honest responses are to ask the source for
permission, or to use a source that welcomes automated access.

**A source returned no links.** Its listing page is probably built by JavaScript,
which this collector deliberately cannot run. Find out for certain:

```
node collect.mjs --debug https://the-page-address-here
```

That prints exactly what the collector can see on that page.

**The transcript came out short or empty.** The collector is guessing which part
of the page holds the words. Run the debug command above on a single document.
It reports which method worked. Move that one to the top of `CONTENT_CANDIDATES`
in `collect.mjs` and delete the guesses.

**The schedule stopped running.** GitHub switches off scheduled jobs after 60
days of no activity in a repository. This collector commits most days, which
counts as activity, so it should not happen — but if the collector has been
failing silently for two months, this is why.

---

## Honest limits

- **Timing is not guaranteed.** GitHub gives no promise about when a scheduled
  job runs. Delays of ten to thirty minutes are normal, and longer happens. Do
  not promise readers an exact update time.
- **Some sources are unverified.** Each entry in `SOURCES` is marked
  `confirmed` or `unconfirmed`. Unconfirmed means nobody has checked it yet.
  Untested is a gap, not a blank — do not treat it as working.
- **The tag names are guesses until proven.** See above. Every saved record
  states which method was used to extract it, so you can always tell.

---

## Copyright — an open question, not a settled one

Works produced by the US federal government carry no copyright, so the
government's own record of what an official said can be republished freely.
Archives that host and organise those records may hold rights in their own
compilation and notes.

Every record here stores and displays its direct source link, and readers are
sent to the original. That is a defensible position. **It is not a cleared one.**
Get a lawyer's opinion before publishing at scale.

## Before launching

- [ ] Put a real contact address in `USER_AGENT` in `collect.mjs`, so sources
      can reach a person if the collector misbehaves
- [ ] Get the copyright question answered properly
- [ ] Confirm each `unconfirmed` source, or remove it
- [ ] Replace the guessed extraction methods with the proven ones
