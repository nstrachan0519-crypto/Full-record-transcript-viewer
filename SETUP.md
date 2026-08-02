# Setting it up

All of this works from a phone. About fifteen minutes.

## 1. Make the repository

On github.com: **New repository** → give it a name → set it to **Public** → **Create**.

Public matters for two reasons. Free unlimited daily runs only apply to public repositories, and anyone being able to check the collector's code is part of the point.

## 2. Upload these files

**Add file → Upload files**, then drag in everything from this folder.

One thing to watch: the folder named `.github` starts with a dot, and phones often hide folders like that. If it does not upload, make it by hand instead:

1. **Add file → Create new file**
2. Type this as the filename, slashes included: `.github/workflows/collect.yml`
3. Paste in the contents of `WORKFLOW-collect.yml` (the copy kept in the main folder for exactly this reason)
4. **Commit**

## 3. Let the collector save its work

**Settings → Actions → General →** scroll to **Workflow permissions** → choose **Read and write permissions** → **Save**.

Without this, the collector runs but cannot save anything.

## 4. Turn on the website

**Settings → Pages →** under **Source** choose **Deploy from a branch** → branch `main`, folder `/docs` → **Save**.

Give it a minute. Your site is then at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`

## 5. Run it once by hand

**Actions → Collect the record → Run workflow.**

Do this even though a daily schedule is set. A new schedule often will not start until the workflow has been run manually at least once. This is a known GitHub quirk, not a mistake in the setup.

## 6. Read the log

Open the run you just started and read the output. It prints every source, everything it stored, and every failure. **That log is your first real evidence about whether these sources will serve an automated visitor.** Until you have read it, you do not know which sources work.

## 7. Reload the website

Anything the collector saved is now on the page, with a working search box.

---

# Changing what gets collected

Edit **`sources.json`**. That is the only file you need to touch. Each entry looks like this:

```json
{
  "id": "short-name-no-spaces",
  "name": "What readers will see",
  "country": "United Kingdom",
  "feed": "https://example.gov/rss",
  "status": "unconfirmed"
}
```

`feed` must be an **RSS or Atom address** — a machine-readable list of new pages that a site publishes on purpose. Look for a link saying RSS, Atom, or Feed on the source's news page. Feeds are the polite front door; guessing at ordinary pages usually gets refused.

Mark a source `confirmed` only after you have seen it succeed in a run log.

---

# When something is not working

**Everything failed with 403.** The site is refusing automated visitors. That is the site's decision, not a bug. The honest responses are to ask the source for permission, or to use a source that welcomes automated access.

**A source returned no entries.** The feed address is probably wrong, or the page is built by JavaScript, which this collector deliberately cannot run. Find out for certain:

```
node collect.mjs --debug https://the-page-address-here
```

That prints exactly what the collector can see on that page.

**The transcript came out short or empty.** The collector is guessing which part of the page holds the words. Run the debug command above on a single document. It reports which method worked. Move that one to the top of `CONTENT_CANDIDATES` in `collect.mjs` and delete the guesses.

**The schedule stopped running.** GitHub switches off scheduled jobs after 60 days of no activity in a repository. This collector commits most days, which counts as activity — but if it has been failing silently for two months, this is why.

---

# Keeping it safe

Five habits, in order of how much they matter:

1. **Turn on 2FA on your GitHub account.** Five minutes, biggest payoff by far.
2. **Never merge a change you have not read line by line.** The repository is public, so anyone can propose one. Treat any change touching `.yml` or `.mjs` as suspicious until you have read all of it.
3. **Check a domain before adding it.** `whitehouse.gov` and `whitehouse.gov.co` look alike at a glance. A planted lookalike is the easiest way to put fake words under your banner.
4. **Do not add secrets.** This project needs none. If a future change asks for one, ask why first.
5. **Leave the permissions alone.** The job needs `contents: write` and nothing else.
