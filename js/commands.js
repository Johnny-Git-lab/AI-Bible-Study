/*
 * Voice commands. Speech-to-text is a separate provider (TBD); this module
 * only receives the recognised text, decides which handler it belongs to,
 * and returns a result card.
 *
 * Word-level questions are answered from local data. Anything else is
 * treated as interpretive and would be sent to the Claude API (not wired
 * in the prototype).
 */
(function () {
  const W = `["“‘']?([A-Za-z’']+)["”’']?`;

  const ROUTES = [
    { kind: 'count', re: new RegExp(`how many times (?:does|is|do) (?:the word )?${W} (?:appear|used|occur|show up|mentioned)`, 'i') },
    { kind: 'whereOriginal', re: new RegExp(`where (?:does|is) ${W} (?:appear |used |found )?in (?:the )?(greek|hebrew)`, 'i') },
    { kind: 'original', re: new RegExp(`(?:show me |what is |what's |give me )?the (greek|hebrew)(?: word)? for ${W}`, 'i') },
    { kind: 'find', re: new RegExp(`(?:find|show|list|search)(?: me)?(?: all)?(?: the)?(?: verses| for)? (?:with |containing |that say |about |on |for )?${W}(?: (?:in|from) (?:the )?(old|new) testament| (?:in|from) (?:this|the current) book)?$`, 'i') },
    { kind: 'define', re: new RegExp(`^(?:define|definition of|what does) ${W}`, 'i') },
    { kind: 'capture', re: /(?:copy|save|add|put) (?:this|that|it)(?: passage| verse)? (?:to|in|into) (?:my )?notes/i },
    { kind: 'xref', re: /cross[- ]?ref(?:erence)?s? (?:for|of|on|to) (.+)/i },
  ];

  const EXAMPLES = [
    'How many times does love appear in the Bible?',
    'Show me the Greek for love',
    'Where does love appear in Greek?',
    'Find all verses with light',
    'Define propitiation',
    'Copy this to notes',
    'Show cross-references for John 3:16',
    'Show the transcript',
    'Why does John call Jesus the Word?',
  ];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mark(text, word) {
    if (!word) return esc(text);
    const re = new RegExp(`\\b(${word.replace(/[^\w]/g, '')}\\w*)`, 'gi');
    return esc(text).replace(re, '<mark>$1</mark>');
  }

  function verseList(verses, word, limit = 12) {
    if (!verses.length) return '<p class="muted">No verses found.</p>';
    const items = verses.slice(0, limit).map(v =>
      `<li><button class="verse-link" data-goto="${v.key}"><span class="ref">${esc(v.ref)}</span><span class="vt">${mark(v.text, word)}</span></button></li>`).join('');
    const more = verses.length > limit ? `<p class="muted">and ${verses.length - limit} more</p>` : '';
    return `<ul class="verse-list">${items}</ul>${more}`;
  }

  function lexCard(e, extra = '') {
    return `<button class="lex-row" data-lex="${e.num}">
      <span class="lemma" lang="${e.num[0] === 'G' ? 'grc' : 'he'}">${esc(e.lemma)}</span>
      <span class="lex-meta"><span class="num">${e.num}</span> <b>${esc(e.translit)}</b> ${extra}</span>
      <span class="lex-def">${esc(e.definition)}</span>
    </button>`;
  }

  const SAMPLE_NOTE = '';

  const handlers = {
    count([, word], ctx) {
      const r = BSData.countWord(word, ctx.version);
      return {
        kind: 'local', title: `“${word}” in the ${ctx.versionAbbrev}`,
        html: `<p class="big-stat"><span class="n">${r.total}</span> ${r.total === 1 ? 'time' : 'times'}, in ${r.verses.length} ${r.verses.length === 1 ? 'verse' : 'verses'}</p>
          <p class="fine">Exact word only. Other forms of the word are counted separately.</p>
          ${verseList(r.verses, word)}${SAMPLE_NOTE}`,
      };
    },

    original([, lang, word]) {
      const list = BSData.originalsFor(word, lang.toLowerCase());
      const L = lang[0].toUpperCase() + lang.slice(1).toLowerCase();
      return {
        kind: 'local', title: `${L} behind “${word}”`,
        html: list.length
          ? list.map(f => lexCard(f.entry, `· ${f.verseCount} ${f.verseCount === 1 ? 'verse' : 'verses'} · KJV: ${f.forms.map(esc).join(', ')}`)).join('')
            + '<p class="fine">Tap an entry to open it in the Lexicon.</p>'
          : `<p class="muted">No ${L} word is tagged with “${esc(word)}” in the KJV.</p>`,
      };
    },

    whereOriginal([, word, lang]) {
      const list = BSData.originalsFor(word, lang.toLowerCase());
      const L = lang[0].toUpperCase() + lang.slice(1).toLowerCase();
      if (!list.length) return { kind: 'local', title: `“${word}” in ${L}`, html: `<p class="muted">No ${L} word for “${esc(word)}” in the KJV.</p>` };
      const html = list.map(f => {
        const occ = BSData.occurrences(f.entry.num);
        const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'that', 'for', 'with']);
        const renders = [...new Set(occ.flatMap(o => o.words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''))))].filter(w => w && !SMALL.has(w));
        return `${lexCard(f.entry, `· rendered ${renders.map(r => `“${esc(r)}”`).join(', ')}`)}
          ${verseList(occ.map(o => o.verse), null, 8)}`;
      }).join('');
      return {
        kind: 'local', title: `Where “${word}” appears in ${L}`,
        html: html + '<p class="fine">Includes verses where the KJV uses a different English word for the same original, such as “charity” for agapē.</p>',
      };
    },

    find([m, word, testament], ctx) {
      const scope = testament ? (testament.toLowerCase() === 'old' ? 'OT' : 'NT') : /(this|the current) book$/i.test(m) ? 'book' : 'all';
      return { kind: 'navigate', title: '', html: '', navigate: () => BSApp.openSearch({ query: word, scope }) };
    },

    findCard([, word], ctx) {
      const verses = BSData.searchVerses(word, ctx.version);
      return { kind: 'local', title: `Verses with “${word}”`, html: `<p class="muted">${verses.length} in the ${esc(ctx.versionAbbrev)}, including other forms of the word.</p>${verseList(verses, word, 20)}` };
    },

    define([, word]) {
      const d = BSData.define(word);
      if (!d.dict.length && !d.lex.length) {
        return { kind: 'local', title: `Define “${word}”`, html: `<p class="muted">No entry for “${esc(word)}” in the sample dictionary or lexicon.</p>` };
      }
      return {
        kind: 'local', title: `Define “${word}”`,
        html: d.dict.map(e => `<div class="dict"><p class="src">${esc(e.source)}</p><p>${esc(e.text)}</p></div>`).join('')
          + (d.lex.length ? `<p class="src">Strong’s</p>${d.lex.map(e => lexCard(e)).join('')}` : ''),
      };
    },

    capture(_m, ctx) {
      const p = ctx.player;
      const seg = p.segment;
      const refs = seg && seg.refs.length ? seg.refs : [ctx.selectedRef];
      const note = BSNotes.add({
        kind: 'capture',
        text: seg ? seg.text : `Marked at ${BSPlayer.fmt(p.position)}`,
        refs, sermonId: p.sermon.id, sermonTitle: p.sermon.title, timestamp: Math.floor(p.position),
        topic: 'Unsorted',
      });
      return {
        kind: 'capture', title: 'Saved to Notes',
        html: `<div class="capture">
          <p class="cap-meta">${esc(p.sermon.title)} · ${BSPlayer.fmt(note.timestamp)}</p>
          <p class="cap-text">${esc(note.text)}</p>
          <p class="cap-refs">${refs.map(r => `<button class="chip" data-goto="${r}">${esc(BSData.formatRef(r))}</button>`).join('')}</p>
        </div>
        <p class="fine">Linked to the sermon position and the verses in that part of the transcript.</p>`,
      };
    },

    xref([, refText], ctx) {
      const key = BSData.parseRef(refText) || (/this|that|it|verse/i.test(refText) ? ctx.selectedRef : null);
      if (!key) return { kind: 'error', title: 'Which verse?', html: `<p>I couldn’t read “${esc(refText)}” as a verse. Try “John 3:16”.</p>` };
      const refs = BSData.crossRefs(key);
      return {
        kind: 'local', title: `Cross-references for ${BSData.formatRef(key)}`,
        html: refs.length ? verseList(refs.map(r => r.verse).filter(Boolean)) + '<p class="fine">Source: Treasury of Scripture Knowledge (sample).</p>'
          : '<p class="muted">No cross-references for this verse in the sample.</p>',
      };
    },
  };

  function claudeCard(text, ctx) {
    const p = ctx.player;
    return {
      kind: 'claude', title: 'Interpretive question',
      html: `<p class="q">“${esc(text)}”</p>
        <p>This isn’t a word lookup, so it would go to Claude with the context below. The Claude API is not connected in this prototype.</p>
        <dl class="ctx">
          <dt>Sermon</dt><dd>${esc(p.sermon.title)} at ${BSPlayer.fmt(p.position)}</dd>
          <dt>Transcript</dt><dd>${esc(p.segment ? p.segment.text : '(none)')}</dd>
          <dt>Selected verse</dt><dd>${esc(BSData.formatRef(ctx.selectedRef))}</dd>
        </dl>`,
    };
  }

  function run(text, ctx) {
    if (!BSApp.state.dataReady && !/(copy|save|add|put) .*notes/i.test(text)) {
      return { route: 'loading', kind: 'error', title: 'Still loading the Bible', html: '<p>The full Bible text is still downloading. Try again in a moment.</p>' };
    }
    const clean = text.trim().replace(/[?.!]+$/, '');
    for (const r of ROUTES) {
      const m = clean.match(r.re);
      if (m) return { route: r.kind, ...handlers[r.kind](m, ctx) };
    }
    return { route: 'claude', ...claudeCard(clean, ctx) };
  }

  window.BSCommands = { run, EXAMPLES, esc, verseList, lexCard };
})();
