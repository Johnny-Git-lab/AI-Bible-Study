/*
 * Study screen: Bible | Commentaries | Lexicon | Notes | Cross-Ref.
 * All panels share the selected verse in BSApp.state.selectedRef.
 */
window.StudyScreen = (function () {
  const $ = sel => document.querySelector(sel);
  const esc = s => BSCommands.esc(s);
  const S = () => BSApp.state;

  function init() {
    BSNotes.subscribe(() => { if (S().tab === 'study' && S().sub === 'notes') render(); });
  }

  function render() {
    document.querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sub === S().sub)));
    const panel = $('#panel');
    if (!S().dataReady && ['bible', 'lexicon', 'crossref', 'commentaries'].includes(S().sub)) {
      panel.innerHTML = S().dataError
        ? `<p class="muted">The Bible text didn\u2019t load: ${esc(S().dataError)}. Check your connection and reload.</p>`
        : '<p class="muted">Loading the Bible and Strong\u2019s dictionaries\u2026</p>';
      return;
    }
    panel.innerHTML = ({ bible, commentaries, lexicon, notes, crossref })[S().sub]();
    wire[S().sub] && wire[S().sub](panel);
    const active = document.querySelector(`[data-sub="${S().sub}"]`);
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function scrollToSelected() {
    requestAnimationFrame(() => {
      const el = document.querySelector('.verse.sel');
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }

  function verseCard(key, action) {
    const v = BSData.getVerse(key, BSApp.textVersion().id);
    return `<div class="verse-card">
      <div class="ref"><span>${esc(v ? v.ref : BSData.formatRef(key))} · ${esc(BSApp.textVersion().abbrev)}</span>
        <button data-goto="${key}">${action || 'Open in Bible'}</button></div>
      <p>${esc(v ? v.text : 'Not available in this version.')}</p></div>`;
  }

  function renderVerseText(v) {
    return BSData.tokens(v.tagged).map(t => t.strongs
      ? `<span class="w" data-s="${t.strongs}">${esc(t.text)}</span>`
      : esc(t.text)).join('');
  }

  /* ---------- Bible ---------- */
  function bible() {
    const st = S();
    const ver = BSApp.version();
    const tv = BSApp.textVersion().id;
    const books = BSData.chapters(tv);
    const cur = books.find(b => b.book.id === st.book) || books[0];
    if (!cur.chapters.includes(st.chapter)) st.chapter = 1;
    const lockNote = ver.installed ? '' :
      `<p class="fine">${esc(ver.abbrev)} is a paid add-on that isn’t installed, so the text below is KJV.</p>`;

    let body;
    if (st.bibleQuery.trim()) {
      const hits = BSData.searchVerses(st.bibleQuery, tv);
      body = `<p class="fine">${hits.length} ${hits.length === 1 ? 'verse' : 'verses'} in the ${esc(BSApp.textVersion().abbrev)}</p>${BSCommands.verseList(hits, st.bibleQuery, 100)}`;
    } else {
      const verses = BSData.chapterVerses(cur.book.id, st.chapter, tv);
      body = `<h2 class="chapter-head">${esc(cur.localName && BSApp.textVersion().language !== 'en' ? cur.localName : cur.book.name)} ${st.chapter}</h2>
        <div class="scripture ${st.strongs ? 'strongs-on' : ''}" id="scripture">
          ${verses.map(v => `<span class="verse ${v.key === st.selectedRef ? 'sel' : ''}" data-key="${v.key}"><sup>${v.key.split('.')[2]}</sup>${renderVerseText(v)}</span>`).join('')}
        </div>`;
    }

    const sel = BSData.getVerse(st.selectedRef, tv);
    return `
      <div class="toolbar">
        <select id="bookSel" aria-label="Book">${books.map(b => `<option value="${b.book.id}" ${b.book.id === cur.book.id ? 'selected' : ''}>${esc(b.book.name)}</option>`).join('')}</select>
        <select id="chSel" aria-label="Chapter">${cur.chapters.map(c => `<option ${c === st.chapter ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <span class="version-pill">${esc(ver.abbrev)}${ver.installed ? '' : ' (locked)'}</span>
      </div>
      <input class="search" id="bibleSearch" type="search" placeholder="${esc(BSi18n.t('searchBible'))}" value="${esc(st.bibleQuery)}">
      <div class="toggle-row">
        <label><input type="checkbox" id="strongsToggle" ${st.strongs ? 'checked' : ''}> Show Strong’s links</label>
        <span>Tap a verse to select it</span>
      </div>
      ${lockNote}
      ${body}
      ${sel ? `<div class="sel-bar"><span class="ref">${esc(sel.ref)}</span>
        <button data-jump="commentaries">Commentary</button>
        <button data-jump="crossref">Cross-refs</button>
        <button data-jump="notes" data-addnote>Add note</button></div>` : ''}`;
  }

  /* ---------- Commentaries ---------- */
  function commentaries() {
    const key = S().selectedRef;
    const list = BSData.commentaries(key);
    const mods = BSData.listModules('commentary');
    return `${verseCard(key, 'Change verse')}
      ${list.length ? list.map(c => `<div class="entry"><h3>${esc(c.source)}</h3><p>${esc(c.text)}</p></div>`).join('')
        : '<p class="muted" style="margin-top:14px">No commentary entries for this verse in the sample. Try John 3:16, John 1:1 or Romans 5:8.</p>'}
      <div class="modules">Commentary modules
        <ul>${mods.map(m => `<li>${esc(m.name)}${m.installed ? '' : ' (not bundled yet)'}</li>`).join('')}</ul>
      </div>`;
  }

  /* ---------- Lexicon ---------- */
  function lexicon() {
    const st = S();
    if (st.lexSelected) {
      const e = BSData.lexiconEntry(st.lexSelected);
      const occ = BSData.occurrences(e.num);
      const renders = [...new Set(occ.flatMap(o => o.words.map(w => w.replace(/[^A-Za-z]/g, ''))))];
      return `<div class="lex-detail">
        <button class="back" id="lexBack">‹ All entries</button>
        <div class="lemma" lang="${e.num[0] === 'G' ? 'grc' : 'he'}">${esc(e.lemma)}</div>
        <h2>${esc(e.translit)} <span class="num">${e.num}</span></h2>
        <div class="pron">${esc(e.language)} · ${esc(e.pron)}</div>
        <p class="def">${esc(e.definition)}</p>
        <p class="src">KJV renders it</p>
        <div class="renders">${e.kjv.map(r => `<span class="chip ghost">${esc(r)}</span>`).join('')}</div>
        ${e.derivation ? `<p class="fine">${esc(e.derivation)}</p>` : ''}
        <p class="src">Verses using ${e.num} (${occ.length})</p>
        ${BSCommands.verseList(occ.map(o => o.verse), null, 60)}
      </div>`;
    }
    const list = BSData.searchLexicon(st.lexQuery);
    return `<input class="search" id="lexSearch" type="search" placeholder="Strong’s number, word, or English (e.g. G26, logos, love)" value="${esc(st.lexQuery)}" style="margin-top:0">
      <p class="fine">${list.length} ${list.length === 1 ? 'entry' : 'entries'}${list.length > 60 ? ', showing the first 60' : ''} \u00b7 Strong\u2019s Hebrew and Greek</p>
      ${list.slice(0, 60).map(e => BSCommands.lexCard(e, `\u00b7 ${e.language}`)).join('')}`;
  }

  /* ---------- Notes ---------- */
  function notes() {
    const st = S();
    const all = BSNotes.all();
    const groups = new Map();
    const keyOf = n => st.notesGroup === 'sermon' ? (n.sermonTitle || 'Not from a sermon')
      : st.notesGroup === 'topic' ? (n.topic || 'Unsorted') : n.date;
    all.forEach(n => { const k = keyOf(n); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); });
    const order = [...groups.keys()];
    if (st.notesGroup === 'date') order.sort().reverse();

    const seg = ['sermon', 'topic', 'date'].map(g =>
      `<button data-group="${g}" aria-pressed="${st.notesGroup === g}">${g[0].toUpperCase() + g.slice(1)}</button>`).join('');

    return `<div class="notes-tools">
        <div class="seg" role="group" aria-label="Group notes by">${seg}</div>
        <button class="btn quiet" id="organize">Organize by topic</button>
      </div>
      <form class="new-note" id="newNote">
        <textarea id="noteText" placeholder="New note for ${esc(BSData.formatRef(st.selectedRef))}" aria-label="New note"></textarea>
        <div class="row"><span>Linked to ${esc(BSData.formatRef(st.selectedRef))}</span><button class="btn" type="submit">Save note</button></div>
      </form>
      ${all.length ? order.map(k => `<h3 class="group-head">${esc(k)}</h3>${groups.get(k).map(noteCard).join('')}`).join('')
        : '<p class="muted">No notes yet. Use “Copy this to notes” while listening, or write one above.</p>'}
      <p class="fine">Notes are saved in this browser only. <button class="linkish" id="resetNotes">Reset sample notes</button></p>`;
  }

  function noteCard(n) {
    return `<div class="note ${n.kind === 'capture' ? 'capture-note' : ''}">
      <div class="note-meta">
        <span>${n.kind === 'capture' ? 'Sermon capture' : 'Note'}</span>
        ${n.sermonTitle ? `<span>${esc(n.sermonTitle)}${n.timestamp != null ? ` <span class="mono">@ ${BSPlayer.fmt(n.timestamp)}</span>` : ''}</span>` : ''}
        <span>${esc(n.topic)}</span><span>${esc(n.date)}</span>
      </div>
      <p class="note-text">${esc(n.text)}</p>
      <div class="note-refs">${n.refs.map(r => `<button class="chip" data-goto="${r}">${esc(BSData.formatRef(r))}</button>`).join('')}
        <button class="del" data-del="${n.id}">Delete</button></div>
    </div>`;
  }

  /* ---------- Cross-Ref ---------- */
  function crossref() {
    const key = S().selectedRef;
    const refs = BSData.crossRefs(key);
    return `${verseCard(key, 'Change verse')}
      <p class="src">Related passages</p>
      ${refs.length ? BSCommands.verseList(refs.map(r => r.verse).filter(Boolean), null, 50)
        : '<p class="muted">No cross-references for this verse yet. The sample list covers a few verses; a full cross-reference module comes later.</p>'}
      <p class="fine">Source: Treasury of Scripture Knowledge (sample of a few verses).</p>`;
  }

  /* ---------- event wiring per panel ---------- */
  const wire = {
    bible(p) {
      p.querySelector('#bookSel').addEventListener('change', e => {
        const b = BSData.chapters().find(x => x.book.id === e.target.value);
        Object.assign(S(), { book: b.book.id, chapter: b.chapters[0], bibleQuery: '' });
        render();
      });
      p.querySelector('#chSel').addEventListener('change', e => { S().chapter = +e.target.value; render(); });
      const search = p.querySelector('#bibleSearch');
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          S().bibleQuery = search.value;
          render();
          const s = $('#bibleSearch');
          s.focus();
          s.setSelectionRange(s.value.length, s.value.length);
        }, 250);
      });
      p.querySelector('#strongsToggle').addEventListener('change', e => { S().strongs = e.target.checked; render(); });
      const scripture = p.querySelector('#scripture');
      if (scripture) scripture.addEventListener('click', e => {
        const w = e.target.closest('.w[data-s]');
        if (w && S().strongs) { BSApp.gotoLexicon(w.dataset.s); return; }
        const v = e.target.closest('.verse');
        if (v) { S().selectedRef = v.dataset.key; render(); }
      });
      p.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => {
        BSApp.setSub(b.dataset.jump);
        if (b.hasAttribute('data-addnote')) setTimeout(() => $('#noteText') && $('#noteText').focus(), 30);
      }));
    },
    lexicon(p) {
      const back = p.querySelector('#lexBack');
      if (back) back.addEventListener('click', () => { S().lexSelected = null; render(); });
      const search = p.querySelector('#lexSearch');
      if (search) search.addEventListener('input', () => {
        S().lexQuery = search.value;
        render();
        const s = $('#lexSearch');
        s.focus();
        s.setSelectionRange(s.value.length, s.value.length);
      });
    },
    notes(p) {
      p.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => { S().notesGroup = b.dataset.group; render(); }));
      p.querySelector('#organize').addEventListener('click', () =>
        BSApp.toast('This would ask Claude to group your notes by theme. Not connected in the prototype.'));
      p.querySelector('#newNote').addEventListener('submit', e => {
        e.preventDefault();
        const text = p.querySelector('#noteText').value.trim();
        if (!text) return;
        BSNotes.add({ text, refs: [S().selectedRef] });
        BSApp.toast('Note saved.');
      });
      p.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => BSNotes.remove(b.dataset.del)));
      p.querySelector('#resetNotes').addEventListener('click', () => BSNotes.reset());
    },
  };

  return { init, render, scrollToSelected };
})();
