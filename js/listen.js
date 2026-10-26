/*
 * Listen screen: sermon display, scrubber, and the command/result card.
 * Button presses arrive through the controller in app.js.
 */
window.ListenScreen = (function () {
  const $ = sel => document.querySelector(sel);
  const esc = s => BSCommands.esc(s);
  let sheet = null;
  let scrubbing = false;
  let lastCaption = null;

  const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const PAUSED = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

  function init() {
    BSPlayer.subscribe(render);

    const scrub = $('#scrub');
    scrub.addEventListener('input', () => { scrubbing = true; $('#tCur').textContent = BSPlayer.fmt(+scrub.value); });
    scrub.addEventListener('change', () => { scrubbing = false; BSPlayer.seek(+scrub.value); });

    $('#ytSize').addEventListener('click', () => {
      const compact = $('#ytWrap').classList.toggle('compact');
      $('#ytSize').textContent = compact ? 'Expand video' : 'Shrink video';
    });

    document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
      const [, kind, delta] = b.dataset.nav.match(/(book|ch)([+-]1)/);
      navBible(kind, +delta);
    }));
    $('#biblePick').addEventListener('click', () => openBiblePicker());
    BSPlayer.setChapterEndHandler(() => navBible('ch', 1, true));

    const cap = $('#caption');
    cap.addEventListener('click', openTranscript);
    cap.addEventListener('keydown', e => { if (e.key === 'Enter') openTranscript(); });
  }

  function render() {
    const p = BSPlayer.state();
    const screen = $('#screen-listen');
    screen.classList.toggle('is-playing', p.playing);
    $('#playState').textContent = BSi18n.t(p.playing ? 'nowPlaying' : 'paused');
    $('#sermonTitle').textContent = p.sermon.title;
    $('#sermonMeta').textContent = [p.sermon.speaker, p.sermon.date].filter(Boolean).join(' · ');
    // SVG elements have no .hidden property, so set the attribute directly.
    $('#icoPlay').toggleAttribute('hidden', p.playing);
    $('#icoPause').toggleAttribute('hidden', !p.playing);
    $('#playBtn').setAttribute('aria-label', BSi18n.t(p.playing ? 'pause' : 'play'));

    // Only redraw the caption when the transcript segment changes, so its chips stay tappable.
    const seg = p.segment;
    const capKey = `${p.source}|${seg ? seg.t : ''}|${BSi18n.lang().id}`;
    if (capKey !== lastCaption) {
      lastCaption = capKey;
      $('#caption').innerHTML = p.source !== 'sample' && p.source !== 'bible'
        ? 'The transcript will appear here once speech-to-text is connected.'
        : seg ? `<span class="ts">${p.source === 'bible' ? `Verse ${seg.verse}` : BSPlayer.fmt(seg.t)}<span class="expand">Tap to enlarge</span></span>${esc(seg.text)}` : '';
      $('#captionRefs').innerHTML = seg && seg.refs.length
        ? seg.refs.map(r => `<button class="chip" data-goto="${r}">${esc(BSData.formatRef(r))}</button>`).join('')
        : '';
    }

    const scrub = $('#scrub');
    scrub.max = Math.max(1, Math.floor(p.duration));
    if (!scrubbing) {
      scrub.value = Math.floor(p.position);
      $('#tCur').textContent = BSPlayer.fmt(p.position);
    }
    $('#tDur').textContent = BSPlayer.fmt(p.duration);
    const isBible = p.source === 'bible';
    $('#bibleNav').hidden = !isBible;
    if (isBible) {
      $('#biblePickLabel').textContent = p.sermon.title;
      if (!scrubbing) $('#tCur').textContent = `Verse ${Math.floor(p.position) + 1}`;
      $('#tDur').textContent = `${p.duration} verses`;
      followAlong(p);
    }
    $('#sourceTag').textContent = {
      sample: 'Sample sermon \u00b7 placeholder audio (silent)',
      file: 'From your device',
      bible: BSPlayer.ttsAvailable ? 'Read aloud by your phone\u2019s voice' : 'This browser can\u2019t read aloud',
      youtube: p.ytLive ? 'Playing from YouTube' : 'YouTube link \u00b7 can\u2019t play in this preview (works on the hosted site)',
    }[p.source];
    const ytOn = p.source === 'youtube' && p.ytLive;
    $('#ytBox').hidden = !ytOn;
    // A YouTube sermon has no transcript yet, so the video tile takes the caption's place.
    $('#caption').hidden = ytOn;
    $('#captionRefs').hidden = ytOn || isBible; // the controller already names the chapter
    $('#cmdBtn').classList.toggle('live', sheet === 'input');
    if (sheet && sheet !== 'add' && sheet !== 'bible') renderFoot();
  }

  function ctx() {
    return {
      player: BSPlayer.state(),
      selectedRef: BSApp.state.selectedRef,
      version: BSApp.textVersion().id,
      versionAbbrev: BSApp.textVersion().abbrev,
    };
  }

  function mount(html) {
    const kind = sheet; // callers set the sheet kind first; closing the old card must not clear it
    closeSheet();
    sheet = kind;
    const el = document.createElement('div');
    el.className = 'card-sheet';
    el.id = 'sheet';
    el.setAttribute('role', 'dialog');
    el.innerHTML = html + '<div class="sheet-foot" id="sheetFoot"></div>';
    $('#screen-listen').appendChild(el);
    el.querySelector('[data-close]').addEventListener('click', closeSheet);
    renderFoot();
    return el;
  }

  function renderFoot() {
    const foot = $('#sheetFoot');
    if (!foot) return;
    const p = BSPlayer.state();
    foot.innerHTML = p.playing ? '' : `${PAUSED}<span>${esc(BSi18n.t('tapToResume'))} ${BSPlayer.fmt(p.position)}.</span>`;
    foot.hidden = p.playing;
  }

  function openCommand() {
    sheet = 'input';
    const el = mount(`
      <div class="sheet-head">
        <div><div class="sheet-kind">${esc(BSi18n.t('command'))}</div><h2>${esc(BSi18n.t('listening'))}</h2></div>
        <button class="x" data-close aria-label="${esc(BSi18n.t('close'))}">${X}</button>
      </div>
      <div class="sheet-body">
        <div class="listening" id="listening"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
          <span class="sim-note" id="micNote"></span>
          <button class="btn quiet mic-again" id="micAgain" type="button" hidden>Speak again</button></div>
        <form class="ask-row" id="askForm">
          <input id="askInput" type="text" autocomplete="off" placeholder="Show me the Greek for love" aria-label="Command">
          <button class="btn" type="submit">${esc(BSi18n.t('ask'))}</button>
        </form>
        <div class="examples">${BSCommands.EXAMPLES.map(x => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      </div>`);
    el.querySelector('#askForm').addEventListener('submit', e => {
      e.preventDefault();
      const v = el.querySelector('#askInput').value.trim();
      if (v) submit(v);
    });
    el.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => { BSSpeech.stop(); simulateSpeech(b.dataset.ex); }));
    el.querySelector('#askInput').addEventListener('focus', () => { BSSpeech.stop(); setMic('off', 'Type your question.'); });
    el.querySelector('#micAgain').addEventListener('click', listen);
    render();
    // Must start inside the tap that opened Command, or mobile browsers refuse the microphone.
    if (BSSpeech.available()) listen();
    else setMic('off', 'Voice isn\u2019t available in this browser. Type a question or tap one below.');
  }

  function setMic(state, note) {
    const box = $('#listening');
    if (!box) return;
    box.classList.toggle('on', state === 'on');
    $('#micNote').textContent = note;
    $('#micAgain').hidden = state === 'on' || !BSSpeech.available();
  }

  function listen() {
    const input = $('#askInput');
    if (!input) return;
    input.value = '';
    setMic('on', 'Speak now\u2026');
    let failed = false;
    BSSpeech.start({
      onText: text => { if ($('#askInput')) $('#askInput').value = text; },
      onEnd: text => {
        if (sheet !== 'input' || failed) return;
        if (text) submit(text);
        else setMic('off', 'I didn\u2019t catch that. Tap Speak again, or type below.');
      },
      onError: code => {
        failed = true;
        if (sheet !== 'input') return;
        const msg = code === 'not-allowed' || code === 'service-not-allowed'
          ? 'Microphone access is off. Allow it for this site in Settings, or type below.'
          : code === 'no-speech' ? 'I didn\u2019t hear anything. Tap Speak again, or type below.'
          : 'Voice input stopped. Tap Speak again, or type below.';
        setMic('off', msg);
      },
    });
  }

  // Types the phrase into the box as if it were being recognised, then submits.
  function simulateSpeech(text) {
    const input = $('#askInput');
    if (!input) return;
    let i = 0;
    const step = () => {
      if (!$('#askInput')) return;
      input.value = text.slice(0, i);
      if (i++ < text.length) setTimeout(step, 14);
      else setTimeout(() => submit(text), 220);
    };
    step();
  }

  function submit(text) {
    BSSpeech.stop();
    if (/^(?:show|open)(?: me)?(?: the)? transcript/i.test(text.trim())) { openTranscript(); return; }
    const r = BSCommands.run(text, ctx());
    if (r.navigate) { r.navigate(); return; }
    if (r.route === 'capture') BSApp.toast('Captured to Notes.');
    showResult(text, r);
  }

  function showResult(text, r) {
    sheet = 'result';
    const kind = { local: 'From the local Bible data', claude: 'Would ask Claude', capture: 'Note captured', error: 'Need more detail' }[r.kind] || '';
    const el = mount(`
      <div class="sheet-head">
        <div><div class="sheet-kind ${r.kind}">${esc(kind)}</div><h2>${esc(r.title)}</h2></div>
        <button class="x" data-close aria-label="${esc(BSi18n.t('close'))}">${X}</button>
      </div>
      <div class="sheet-body">${r.html}
        <p style="margin-top:14px"><button class="btn quiet" id="askAgain">Ask something else</button></p>
      </div>`);
    el.querySelector('#askAgain').addEventListener('click', openCommand);
    render();
  }

  function closeSheet() {
    BSSpeech.stop();
    const el = $('#sheet');
    if (el) el.remove();
    sheet = null;
    const cmd = $('#cmdBtn');
    if (cmd) cmd.classList.remove('live');
  }

  // Add menu: where a sermon can come from.
  function openAdd() {
    BSApp.setTab('listen');
    BSPlayer.pause();
    sheet = 'add';
    const el = mount(`
      <div class="sheet-head">
        <div><div class="sheet-kind">${esc(BSi18n.t('add'))}</div><h2>${esc(BSi18n.t('addSermon'))}</h2></div>
        <button class="x" data-close aria-label="${esc(BSi18n.t('close'))}">${X}</button>
      </div>
      <div class="sheet-body add-menu">
        <form class="add-opt" id="ytForm">
          <label for="ytUrl"><b>Paste a YouTube link</b><span>A sermon or Bible study video</span></label>
          <div class="ask-row">
            <input id="ytUrl" type="text" inputmode="url" autocomplete="off" placeholder="https://youtu.be/…">
            <button class="btn" type="submit">Add</button>
          </div>
          <p class="fine" id="ytMsg" hidden></p>
        </form>
        <label class="add-opt row" for="audioFile">
          <span class="opt-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4"/></svg></span>
          <span><b>Upload from device</b><span>MP3, M4A or WAV from your phone</span></span>
        </label>
        <input id="audioFile" type="file" accept="audio/*" hidden>
        <button class="add-opt row" id="useBible">
          <span class="opt-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/></svg></span>
          <span><b>Audio Bible</b><span>Listen chapter by chapter, with the text following along</span></span>
        </button>
        <div class="add-opt row soon">
          <span class="opt-ico"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg></span>
          <span><b>Record a sermon</b><span>Coming later</span></span>
        </div>
        <button class="add-opt row" id="useSample">
          <span class="opt-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/></svg></span>
          <span><b>Use the sample sermon</b><span>God So Loved the World, with a transcript</span></span>
        </button>
      </div>`);
    el.querySelector('#ytForm').addEventListener('submit', e => {
      e.preventDefault();
      const url = el.querySelector('#ytUrl').value;
      if (BSPlayer.loadYouTube(url)) {
        closeSheet();
        BSApp.toast('YouTube sermon added. Press Play to start.');
      } else {
        const msg = el.querySelector('#ytMsg');
        msg.hidden = false;
        msg.textContent = 'That doesn’t look like a YouTube video link. Copy it from the Share button in YouTube.';
      }
    });
    el.querySelector('#audioFile').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      BSPlayer.loadFile(f);
      closeSheet();
      BSApp.toast(`Loaded “${f.name}”. Press Play to start.`);
    });
    el.querySelector('#useSample').addEventListener('click', () => { BSPlayer.loadSample(); closeSheet(); });
    el.querySelector('#useBible').addEventListener('click', () => openBiblePicker());
    el.querySelector('.sheet-foot').hidden = true;
  }

  // Large transcript view: pause, pick lines (or select words), then copy or send to a note.
  function openTranscript() {
    BSPlayer.pause();
    const p = BSPlayer.state();
    sheet = 'transcript';
    const lines = p.sermon.transcript || [];
    const cur = p.segment;
    const picked = new Set(cur ? [cur.t] : []);
    const topics = [...new Set(BSNotes.all().map(n => n.topic).filter(Boolean))];

    const el = mount(`
      <div class="sheet-head">
        <div><div class="sheet-kind">Transcript · paused at ${BSPlayer.fmt(p.position)}</div><h2>${esc(p.sermon.title)}</h2></div>
        <button class="x" data-close aria-label="${esc(BSi18n.t('close'))}">${X}</button>
      </div>
      <div class="sheet-body transcript">
        ${lines.length ? `<p class="fine" style="margin:0 0 6px">Tap lines to pick them, or press and hold to select words.</p>
          <div class="tlines">${lines.map(l => `
            <div class="tline ${cur && l.t === cur.t ? 'now' : ''} ${picked.has(l.t) ? 'picked' : ''}" data-t="${l.t}">
              <span class="tts">${BSPlayer.fmt(l.t)}${cur && l.t === cur.t ? ' · here' : ''}</span>
              <span class="ttext">${esc(l.text)}</span>
            </div>`).join('')}</div>`
          : '<p class="muted">No transcript yet for this sermon. It will appear here once speech-to-text is connected.</p>'}
      </div>
      ${lines.length ? `<div class="t-actions">
        <button class="btn quiet" id="tCopy">Copy</button>
        <select id="tDest" aria-label="Send to">
          <option value="">New note</option>
          ${topics.map(t => `<option value="${esc(t)}">Add to “${esc(t)}”</option>`).join('')}
        </select>
        <button class="btn" id="tSend">Send to note</button>
      </div>` : ''}`);
    if (!lines.length) return;

    const now = el.querySelector('.tline.now');
    if (now) now.scrollIntoView({ block: 'center' });

    el.querySelector('.tlines').addEventListener('click', e => {
      if (String(window.getSelection())) return; // keep a word selection in progress
      const line = e.target.closest('.tline');
      if (!line) return;
      const t = +line.dataset.t;
      picked.has(t) ? picked.delete(t) : picked.add(t);
      line.classList.toggle('picked', picked.has(t));
    });

    function chosen() {
      const sel = String(window.getSelection()).trim();
      const pickedLines = lines.filter(l => picked.has(l.t));
      if (sel) {
        const hit = lines.filter(l => l.text.includes(sel) || sel.includes(l.text.slice(0, 20)));
        return { text: sel, lines: hit.length ? hit : pickedLines };
      }
      return { text: pickedLines.map(l => l.text).join(' '), lines: pickedLines };
    }

    el.querySelector('#tCopy').addEventListener('click', () => {
      const c = chosen();
      if (!c.text) { BSApp.toast('Pick a line first.'); return; }
      copyText(c.text);
    });

    el.querySelector('#tSend').addEventListener('click', () => {
      const c = chosen();
      if (!c.text) { BSApp.toast('Pick a line first.'); return; }
      const topic = el.querySelector('#tDest').value;
      const refs = [...new Set(c.lines.flatMap(l => l.refs))];
      BSNotes.add({
        kind: 'capture', text: c.text, refs: refs.length ? refs : [BSApp.state.selectedRef],
        sermonId: p.sermon.id, sermonTitle: p.sermon.title,
        timestamp: c.lines.length ? c.lines[0].t : Math.floor(p.position),
        topic: topic || 'Unsorted',
      });
      BSApp.toast(topic ? `Added to “${topic}” in Notes.` : 'Saved as a new note.');
    });
  }

  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* not allowed */ }
      ta.remove();
      BSApp.toast(ok ? 'Copied.' : 'Copy isn’t allowed here. Press and hold the text to copy it.');
    };
    try {
      navigator.clipboard.writeText(text).then(() => BSApp.toast('Copied.'), fallback);
    } catch (e) { fallback(); }
  }

  /* ---------- Audio Bible ---------- */
  function startBible(book, chapter, { verse = 1, keepPlaying = false } = {}) {
    if (!BSApp.state.dataReady) { BSApp.toast('The Bible is still loading. Try again in a moment.'); return; }
    const tv = BSApp.textVersion();
    const entry = BSData.chapters(tv.id).find(b => b.book.id === book);
    BSPlayer.loadBible({
      book, chapter, version: tv.id, versionName: BSApp.version().abbrev,
      bookName: tv.language !== 'en' && entry.localName ? entry.localName : entry.book.name,
      lang: { en: 'en-US', es: 'es-ES', fr: 'fr-FR' }[tv.language] || 'en-US',
      verses: BSData.chapterVerses(book, chapter, tv.id), startVerse: verse, keepPlaying,
    });
  }

  // kind: 'ch' or 'book'; delta: +1 or -1. Wraps from Revelation back to Genesis.
  function navBible(kind, delta, autoAdvance = false) {
    const b = BSPlayer.state().sermon.bible;
    if (!b) return;
    const index = BSData.chapters(b.version);
    let bi = index.findIndex(x => x.book.id === b.book);
    let ch = b.chapter;
    if (kind === 'book') { bi = (bi + delta + index.length) % index.length; ch = 1; }
    else {
      ch += delta;
      if (ch < 1) { bi = (bi - 1 + index.length) % index.length; ch = index[bi].chapters.length; }
      if (ch > index[bi].chapters.length) { bi = (bi + 1) % index.length; ch = 1; }
    }
    startBible(index[bi].book.id, ch, { keepPlaying: autoAdvance || BSPlayer.state().playing });
  }

  function openBiblePicker(bookId) {
    if (!BSApp.state.dataReady) { BSApp.toast('The Bible is still loading. Try again in a moment.'); return; }
    BSApp.setTab('listen');
    const cur = BSPlayer.state().sermon.bible;
    const index = BSData.chapters(BSApp.textVersion().id);
    const book = bookId || (cur ? cur.book : BSApp.state.book);
    const entry = index.find(b => b.book.id === book) || index[0];
    sheet = 'bible';
    const grid = t => index.filter(b => b.book.testament === t).map(b =>
      `<button data-book="${b.book.id}" aria-current="${b.book.id === entry.book.id}">${esc(b.book.id)}</button>`).join('');
    const el = mount(`
      <div class="sheet-head">
        <div><div class="sheet-kind">Audio Bible \u00b7 ${esc(BSApp.version().abbrev)}</div><h2>${esc(entry.book.name)}: choose a chapter</h2></div>
        <button class="x" data-close aria-label="${esc(BSi18n.t('close'))}">${X}</button>
      </div>
      <div class="sheet-body">
        <div class="book-grid chap-grid">${entry.chapters.map(c => `<button data-chapter="${c}" aria-current="${!!cur && cur.book === entry.book.id && cur.chapter === c}">${c}</button>`).join('')}</div>
        <p class="src pick-head">Old Testament</p><div class="book-grid">${grid('OT')}</div>
        <p class="src pick-head">New Testament</p><div class="book-grid">${grid('NT')}</div>
      </div>`);
    el.querySelector('.sheet-foot').hidden = true;
    el.querySelectorAll('[data-book]').forEach(b => b.addEventListener('click', () => openBiblePicker(b.dataset.book)));
    el.querySelectorAll('[data-chapter]').forEach(b => b.addEventListener('click', () => {
      closeSheet();
      // Start reading right away; this tap is what lets the phone speak.
      startBible(entry.book.id, +b.dataset.chapter);
      BSPlayer.play();
    }));
  }

  // Keep the Study Bible on the verse being read.
  let lastFollowed = null;
  function followAlong(p) {
    const seg = p.segment;
    if (!seg || seg.refs[0] === lastFollowed) return;
    lastFollowed = seg.refs[0];
    const st = BSApp.state;
    if (st.bibleQuery || st.searchStrongs) return;
    const [b, c] = lastFollowed.split('.');
    Object.assign(st, { book: b, chapter: +c, selectedRef: lastFollowed });
    if (st.tab === 'study' && st.sub === 'bible') { StudyScreen.render(); StudyScreen.scrollToSelected(); }
  }

  return { init, render, openCommand, openAdd, openTranscript, openBiblePicker, closeSheet };
})();
