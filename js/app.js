/*
 * App shell: shared state, tab switching, and the controller that maps the
 * six logical buttons to actions. Screens render from state and never
 * handle button presses themselves.
 */
(function () {
  const versions = BSData.listModules('bible');

  const state = {
    tab: 'listen',
    sub: 'bible',
    versionIdx: 0,
    selectedRef: 'Jhn.3.16',
    book: 'Jhn',
    chapter: 3,
    bibleQuery: '',
    searchStrongs: null,   // Strong's number being searched, e.g. G26
    searchScope: 'all',    // all | OT | NT | book
    strongs: true,
    lexQuery: '',
    lexSelected: null,
    notesGroup: 'sermon',
  };

  const $ = sel => document.querySelector(sel);

  function version() { return versions[state.versionIdx]; }
  // The text actually shown: locked versions fall back to KJV.
  // The module whose text is shown: KJV+ reads the KJV text; locked or still-loading versions fall back to KJV.
  function textVersion() {
    let v = version();
    if (v.source) v = BSData.getModule(v.source);
    return v.installed && BSData.isLoaded(v.id) ? v : BSData.getModule('kjv');
  }

  function rerender() {
    if (state.tab === 'study') StudyScreen.render();
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function setTab(tab) {
    state.tab = tab;
    $('#screen-listen').hidden = tab !== 'listen';
    $('#screen-study').hidden = tab !== 'study';
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('#addBtn').hidden = tab !== 'listen';
    if (tab === 'study') StudyScreen.render();
  }

  function setSub(sub) {
    state.sub = sub;
    setTab('study');
  }

  function gotoVerse(key) {
    const [b, c] = key.split('.');
    Object.assign(state, { selectedRef: key, book: b, chapter: +c, bibleQuery: '', searchStrongs: null });
    ListenScreen.closeSheet();
    setSub('bible');
    StudyScreen.scrollToSelected();
  }

  // Opens the Bible search screen, from a voice "find" command or a Strong's number.
  function openSearch({ query = '', strongs = null, scope = 'all' } = {}) {
    Object.assign(state, { bibleQuery: query, searchStrongs: strongs, searchScope: scope });
    ListenScreen.closeSheet();
    setSub('bible');
    $('#panel').scrollTop = 0;
  }

  // The book "being listened to": the verse the sermon is on now, otherwise the open chapter.
  function listeningBook() {
    const seg = BSPlayer.state().segment;
    const ref = seg && seg.refs && seg.refs[0];
    return ref ? ref.split('.')[0] : state.book;
  }

  function gotoLexicon(num) {
    state.lexSelected = num;
    ListenScreen.closeSheet();
    setSub('lexicon');
  }

  function applyLanguage() {
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = BSi18n.t(el.dataset.t); });
    document.documentElement.lang = BSi18n.lang().id;
    $('#langValue').textContent = BSi18n.lang().short;
    ListenScreen.render();
    if (state.tab === 'study') StudyScreen.render();
  }

  const LOCK = '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function renderVersion() {
    const v = version();
    $('#versionValue').innerHTML = BSCommands.esc(v.abbrev) + (v.installed ? '' : LOCK);
    $('#versionValue').style.fontSize = v.abbrev.length > 4 ? '12px' : '';
  }

  /* ---------- controller: button id -> action ---------- */
  const B = BSButtons.IDS;

  BSButtons.on(B.VERSION, () => {
    state.versionIdx = (state.versionIdx + 1) % versions.length;
    renderVersion();
    const v = version();
    if (!v.installed) toast(`${v.abbrev} is a paid add-on and isn\u2019t installed. Text stays in KJV.`);
    else if (BSData.isLoaded(v.source || v.id)) toast(`${v.abbrev}: ${v.name}`);
    else {
      toast(`Loading ${v.name}\u2026`);
      BSData.load(v.id).then(() => { if (version() === v) toast(`${v.abbrev}: ${v.name}`); rerender(); })
        .catch(err => toast(err.message));
    }
    rerender();
  });

  BSButtons.on(B.LANGUAGE, () => {
    const l = BSi18n.cycle();
    applyLanguage();
    toast(`${l.label}: interface language. Scripture stays in ${textVersion().abbrev}.`);
  });

  BSButtons.on(B.RESERVED_TOP, () => toast('Reserved button. Function not decided yet (bookmark, settings, or notes).'));
  BSButtons.on(B.RESERVED_LEFT, () => toast('Reserved button. Function not decided yet.'));

  BSButtons.on(B.PLAY_PAUSE, () => {
    ListenScreen.closeSheet();
    BSPlayer.toggle();
  });

  BSButtons.on(B.COMMAND, () => {
    BSPlayer.pause();
    if (state.tab !== 'listen') setTab('listen');
    ListenScreen.openCommand();
  });

  // Visible feedback for presses from the keyboard (or, later, the device).
  BSButtons.onAny((id, source) => {
    if (source === 'screen') return;
    const el = document.querySelector(`[data-button="${id}"]`);
    if (!el || el.offsetParent === null) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 140);
  });

  /* ---------- boot ---------- */
  function boot() {
    BSButtons.bindScreen(document);
    BSButtons.bindKeyboard(() => true);
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => setSub(b.dataset.sub)));
    $('#addBtn').addEventListener('click', () => ListenScreen.openAdd());

    // Links inside cards and lists: verses open in Study, Strong's numbers in the Lexicon.
    document.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) { gotoVerse(g.dataset.goto); return; }
      const l = e.target.closest('[data-lex]');
      if (l) gotoLexicon(l.dataset.lex);
    });

    ListenScreen.init();
    StudyScreen.init();
    renderVersion();
    applyLanguage();

    // The full KJV and Strong's dictionaries load in the background; Listen works meanwhile.
    Promise.all([BSData.load('kjv'), BSData.load('strongs')])
      .then(() => { state.dataReady = true; rerender(); })
      .catch(err => { state.dataError = err.message; rerender(); });
  }

  window.BSApp = { state, version, textVersion, rerender, openSearch, listeningBook, toast, setTab, setSub, gotoVerse, gotoLexicon };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
