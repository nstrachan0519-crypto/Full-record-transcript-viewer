import {htmlToText, extractTranscript, extractLinks, extractTitle, extractDate, slugFor} from './collect.mjs';
let fails = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
  else console.log(`pass ${name}`);
};

// NEGATIVE CONTROL — must find nothing
check('empty page finds nothing', extractTranscript('<html><p>Hi.</p></html>').method, 'none');

// POSITIVE CONTROL — must fire
const body = '<p>' + 'The President. Thank you very much. '.repeat(40) + '</p>';
check('known wrapper fires', extractTranscript(`<div class="field-docs-content">${body}</div>`).method, 'field-docs-content');

// FALLBACK — unknown wrapper still recovers
check('fallback recovers', extractTranscript(`<div class="mystery">${body}</div>`).method, 'longest-paragraph-run');

// TEXT FIDELITY — the whole point: words must survive unchanged
const spoken = 'We hold these truths to be self-evident.';
const out = htmlToText(`<div class="field-docs-content"><p>${spoken}</p></div>`);
check('words survive verbatim', out.includes(spoken), true);

// Entities
check('entities decode', htmlToText('<p>It&#8217;s &quot;so&quot; &amp; true</p>'), 'It\u2019s "so" & true');

// Paragraphs preserved
check('paragraph breaks kept', htmlToText('<p>One</p><p>Two</p>'), 'One\nTwo');

// SECURITY — offsite link must be rejected
const links = extractLinks(
  '<a href="https://evil.example.com/documents/steal-this-now">Long enough label here</a>' +
  '<a href="/documents/remarks-on-the-act-2026">Remarks on the Act, 2026</a>' +
  '<a href="/documents/app-categories/presidential/x">Category page link long</a>' +
  '<a href="/documents/next">Next</a>',
  'https://www.presidency.ucsb.edu');
check('only the real doc link survives', links.length, 1);
check('and it is the right one', links[0].url, 'https://www.presidency.ucsb.edu/documents/remarks-on-the-act-2026');

// Title + date
check('title from h1', extractTitle('<h1>Remarks at the Summit</h1>'), 'Remarks at the Summit');
check('date from time tag', extractDate('<time datetime="2026-02-24T21:12:00Z">'), '2026-02-24');
check('no date returns null', extractDate('<p>nothing</p>'), null);

// Slug safety — no path traversal, no slashes
check('slug is safe', slugFor('https://www.presidency.ucsb.edu/documents/../../etc/passwd').includes('/'), false);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
