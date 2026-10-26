/*
 * Data layer. Everything the app reads comes through BSData, and every
 * content source is a "module" registered with a type. New translations,
 * lexicons or commentaries are added by registering another module; the
 * screens never touch module internals.
 *
 * Module types: bible, lexicon, commentary, crossref, dictionary.
 * Licenses: open (bundled) or "paid-addon" (locked until licensed).
 *
 * Bible and lexicon modules with a `url` load their data on demand from
 * data/*.json (built by tools/build_data.py). KJV text marks Strong's numbers
 * inline after the word they belong to: loved{G25}, the world{G3588 G2889}.
 */
(function () {
  const modules = {};

  const BOOK_LIST = [
    ['Gen', 'Genesis', 'gen gn'], ['Exo', 'Exodus', 'ex exod'], ['Lev', 'Leviticus', 'lv'], ['Num', 'Numbers', 'nm nu'],
    ['Deu', 'Deuteronomy', 'deut dt'], ['Jos', 'Joshua', 'josh'], ['Jdg', 'Judges', 'judg jg'], ['Rut', 'Ruth', 'ru'],
    ['1Sa', '1 Samuel', '1 sam'], ['2Sa', '2 Samuel', '2 sam'], ['1Ki', '1 Kings', '1 kgs'], ['2Ki', '2 Kings', '2 kgs'],
    ['1Ch', '1 Chronicles', '1 chron'], ['2Ch', '2 Chronicles', '2 chron'], ['Ezr', 'Ezra', ''], ['Neh', 'Nehemiah', ''],
    ['Est', 'Esther', 'esth'], ['Job', 'Job', ''], ['Psa', 'Psalms', 'psalm ps pss'], ['Pro', 'Proverbs', 'prov pr'],
    ['Ecc', 'Ecclesiastes', 'eccl qoh'], ['Sng', 'Song of Solomon', 'song of songs song sos'], ['Isa', 'Isaiah', 'is'],
    ['Jer', 'Jeremiah', 'jer'], ['Lam', 'Lamentations', ''], ['Ezk', 'Ezekiel', 'ezek eze'], ['Dan', 'Daniel', 'dn'],
    ['Hos', 'Hosea', ''], ['Jol', 'Joel', 'jl'], ['Amo', 'Amos', 'am'], ['Oba', 'Obadiah', 'obad'], ['Jon', 'Jonah', 'jnh'],
    ['Mic', 'Micah', ''], ['Nam', 'Nahum', 'nah'], ['Hab', 'Habakkuk', ''], ['Zep', 'Zephaniah', 'zeph'], ['Hag', 'Haggai', ''],
    ['Zec', 'Zechariah', 'zech'], ['Mal', 'Malachi', ''], ['Mat', 'Matthew', 'matt mt'], ['Mrk', 'Mark', 'mk mar'],
    ['Luk', 'Luke', 'lk'], ['Jhn', 'John', 'jn joh'], ['Act', 'Acts', ''], ['Rom', 'Romans', 'rm'],
    ['1Co', '1 Corinthians', '1 cor'], ['2Co', '2 Corinthians', '2 cor'], ['Gal', 'Galatians', ''], ['Eph', 'Ephesians', ''],
    ['Php', 'Philippians', 'phil'], ['Col', 'Colossians', ''], ['1Th', '1 Thessalonians', '1 thess'], ['2Th', '2 Thessalonians', '2 thess'],
    ['1Ti', '1 Timothy', '1 tim'], ['2Ti', '2 Timothy', '2 tim'], ['Tit', 'Titus', ''], ['Phm', 'Philemon', 'philem'],
    ['Heb', 'Hebrews', ''], ['Jas', 'James', 'jam jm'], ['1Pe', '1 Peter', '1 pet'], ['2Pe', '2 Peter', '2 pet'],
    ['1Jn', '1 John', '1 jn'], ['2Jn', '2 John', '2 jn'], ['3Jn', '3 John', '3 jn'], ['Jud', 'Jude', ''], ['Rev', 'Revelation', 'rev rv revelations'],
  ];
  const ORDINALS = { first: '1', second: '2', third: '3', i: '1', ii: '2', iii: '3' };

  const BOOKS = BOOK_LIST.map(([id, name, extra], i) => {
    const n = name.toLowerCase();
    const aliases = new Set([n, n.replace(/ /g, ''), id.toLowerCase(), n.slice(0, 3)]);
    extra.split(' ').filter(Boolean).forEach(a => { aliases.add(a); aliases.add(a.replace(/ /g, '')); });
    return { id, name, testament: i < 39 ? 'OT' : 'NT', index: i, aliases: [...aliases] };
  });
  const BOOK_INDEX = Object.fromEntries(BOOKS.map(b => [b.id, b]));

  function registerModule(mod) { modules[mod.id] = mod; }
  function listModules(type) { return Object.values(modules).filter(m => !type || m.type === type); }
  function getModule(id) { return modules[id] || null; }

  /* ---------- loading ---------- */

  const loading = {};
  function load(id) {
    const m = modules[id];
    if (!m) return Promise.reject(new Error('Unknown module ' + id));
    if (m.loaded || !m.url) return Promise.resolve(m);
    if (!loading[id]) {
      loading[id] = fetch(m.url).then(r => {
        if (!r.ok) throw new Error(`Couldn’t load ${m.abbrev || m.name} (${r.status})`);
        return r.json();
      }).then(json => {
        if (m.type === 'bible') indexBible(m, json); else m.entries = json;
        m.loaded = true;
        return m;
      }).finally(() => { delete loading[id]; });
    }
    return loading[id];
  }

  function indexBible(m, json) {
    m.verses = {};
    m.order = [];
    m.index = [];
    json.books.forEach(b => {
      m.index.push({ book: BOOK_INDEX[b.id], localName: b.localName, chapters: b.chapters.map((_, i) => i + 1) });
      b.chapters.forEach((verses, ci) => verses.forEach((text, vi) => {
        const key = `${b.id}.${ci + 1}.${vi + 1}`;
        m.verses[key] = text;
        m.order.push(key);
      }));
    });
  }

  function isLoaded(id) { const m = modules[id]; return !!m && (m.loaded || !m.url); }

  /* ---------- references ---------- */

  function bookById(id) { return BOOK_INDEX[id]; }
  function refKey(book, ch, v) { return `${book}.${ch}.${v}`; }

  function formatRef(key) {
    const [b, c, v] = key.split('.');
    const book = BOOK_INDEX[b];
    return `${book ? book.name : b} ${c}:${v}`;
  }

  // "John 3:16", "1 John 4 8", "first john 4:8", "romans 5.8"
  function parseRef(text) {
    const m = String(text).trim().toLowerCase().replace(/^(first|second|third|iii|ii|i)\s+/, (_, o) => ORDINALS[o] + ' ')
      .match(/^((?:[123]\s*)?[a-z]+(?: of [a-z]+)?)\.?\s+(\d+)\s*[:.\s]\s*(\d+)/);
    if (!m) return null;
    const name = m[1].replace(/\s+/g, ' ').trim();
    const book = BOOKS.find(b => b.aliases.includes(name) || b.aliases.includes(name.replace(/ /g, '')));
    return book ? refKey(book.id, +m[2], +m[3]) : null;
  }

  /* ---------- verse text ---------- */

  const TAG_RE = /([^\s{}]+?)\{([GH]\d+(?: [GH]\d+)*)\}/g;

  function plainText(tagged) { return tagged.replace(/\{[GH][\d ]+[GH\d ]*\}/g, ''); }

  // Main Strong's number of a tag: skip the Greek article (G3588) and the Hebrew
  // object marker (H853) when a word carries a real number as well.
  function primary(nums) {
    const list = nums.split(' ');
    const main = list.filter(n => n !== 'G3588' && n !== 'H853');
    return main.length ? main[main.length - 1] : list[list.length - 1];
  }

  // Splits tagged text into [{text, strongs?, all?}] tokens for rendering.
  function tokens(tagged) {
    const out = [];
    let last = 0;
    tagged.replace(TAG_RE, (match, word, nums, idx) => {
      if (idx > last) out.push({ text: tagged.slice(last, idx) });
      out.push({ text: word, strongs: primary(nums), all: nums.split(' ') });
      last = idx + match.length;
    });
    if (last < tagged.length) out.push({ text: tagged.slice(last) });
    return out;
  }

  function bible(versionId) {
    let m = modules[versionId];
    if (m && m.source) m = modules[m.source]; // KJV+ shows the KJV text with its numbers visible
    if (m && m.type === 'bible' && m.installed && isLoaded(m.id)) return m;
    return modules.kjv;
  }

  function getVerse(key, versionId = 'kjv') {
    const m = bible(versionId);
    const raw = m.verses && m.verses[key];
    if (raw == null) return null;
    return { key, ref: formatRef(key), tagged: raw, text: plainText(raw), version: m.abbrev };
  }

  function chapters(versionId = 'kjv') { return bible(versionId).index; }

  function chapterVerses(book, ch, versionId = 'kjv') {
    const m = bible(versionId);
    const out = [];
    for (let v = 1; m.verses[refKey(book, ch, v)] != null; v++) out.push(getVerse(refKey(book, ch, v), m.id));
    return out;
  }

  function allVerses(versionId = 'kjv') {
    const m = bible(versionId);
    return m.order.map(k => getVerse(k, m.id));
  }

  // scope: { testament: 'OT' | 'NT', book: 'Jhn' } or nothing for the whole Bible
  function inScope(key, scope) {
    if (!scope) return true;
    const b = key.slice(0, key.indexOf('.'));
    if (scope.book) return b === scope.book;
    if (scope.testament) return BOOK_INDEX[b].testament === scope.testament;
    return true;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Exact-word occurrences ("love" does not count "loved").
  function countWord(word, versionId = 'kjv', scope) {
    const re = new RegExp(`(^|[^\\p{L}])${escapeRe(word)}(?![\\p{L}])`, 'giu');
    let total = 0;
    const verses = [];
    allVerses(versionId).forEach(v => {
      if (!inScope(v.key, scope)) return;
      const n = (v.text.match(re) || []).length;
      if (n) { total += n; verses.push(v); }
    });
    return { total, verses };
  }

  // Verses containing the word or a form starting with it (love, loved, loveth).
  function searchVerses(query, versionId = 'kjv', scope) {
    const q = query.trim();
    if (!q) return [];
    const re = new RegExp(`(^|[^\\p{L}])${escapeRe(q)}`, 'iu');
    return allVerses(versionId).filter(v => inScope(v.key, scope) && re.test(v.text));
  }

  /* ---------- Strong's ---------- */

  function lexiconEntry(num) {
    for (const m of listModules('lexicon')) {
      const e = m.entries && m.entries[num];
      if (!e) continue;
      const [lemma, translit, pron, definition, kjvDef, derivation] = e;
      return {
        num, language: num[0] === 'G' ? 'Greek' : 'Hebrew', lemma, translit, pron, definition, derivation,
        kjvDef, kjv: kjvDef.replace(/\.$/, '').split(/,\s*/).map(s => s.trim()).filter(Boolean),
      };
    }
    return null;
  }

  function lexiconEntries() {
    return listModules('lexicon').flatMap(m => Object.keys(m.entries || {})).map(lexiconEntry)
      .sort((a, b) => a.num[0].localeCompare(b.num[0]) || +a.num.slice(1) - +b.num.slice(1));
  }

  // Every verse that uses a Strong's number, with the English words KJV used there.
  function occurrences(num, scope) {
    const out = [];
    const m = modules.kjv;
    const needle = new RegExp(`[{ ]${num}[} ]`);
    m.order.forEach(key => {
      const raw = m.verses[key];
      if (!needle.test(raw) || !inScope(key, scope)) return;
      const words = tokens(raw).filter(t => t.all && t.all.includes(num)).map(t => t.text);
      out.push({ verse: getVerse(key), words });
    });
    return out;
  }

  // Which original-language words sit behind an English word, e.g. love -> G26, G25, H157.
  function originalsFor(word, language) {
    const w = word.toLowerCase();
    const found = new Map();
    const m = modules.kjv;
    const quick = new RegExp(escapeRe(w), 'i');
    m.order.forEach(key => {
      const raw = m.verses[key];
      if (!quick.test(raw)) return;
      tokens(raw).forEach(t => {
        if (!t.strongs) return;
        if (language && (language === 'greek') !== (t.strongs[0] === 'G')) return;
        const tw = t.text.toLowerCase().replace(/[^a-z']/g, '');
        if (tw === w || (tw.startsWith(w) && tw.length - w.length <= 3)) {
          const f = found.get(t.strongs) || { entry: lexiconEntry(t.strongs), forms: new Set(), verses: new Set() };
          f.forms.add(tw);
          f.verses.add(key);
          found.set(t.strongs, f);
        }
      });
    });
    return [...found.values()].filter(f => f.entry)
      .map(f => ({ entry: f.entry, forms: [...f.forms], verseCount: f.verses.size }))
      .sort((a, b) => b.verseCount - a.verseCount);
  }

  function searchLexicon(query) {
    const q = query.trim().toLowerCase();
    const all = lexiconEntries();
    if (!q) return all;
    if (/^[gh]\d+$/.test(q)) return all.filter(e => e.num.toLowerCase() === q);
    const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return all.filter(e =>
      plain(e.translit).includes(plain(q)) || e.lemma.includes(query.trim()) ||
      e.kjv.some(r => r.toLowerCase().replace(/[^a-z ]/g, '').split(' ').includes(q)));
  }

  /* ---------- commentary, cross-refs, dictionary ---------- */

  function commentaries(key) {
    return listModules('commentary').filter(m => m.installed).flatMap(m =>
      (m.entries[key] ? [{ source: m.name, short: m.abbrev, text: m.entries[key] }] : []));
  }

  function crossRefs(key) {
    const out = [];
    listModules('crossref').forEach(m => (m.refs[key] || []).forEach(r =>
      out.push({ key: r, ref: formatRef(r), verse: getVerse(r), source: m.name })));
    return out;
  }

  function define(word) {
    const w = word.toLowerCase();
    const dict = listModules('dictionary').flatMap(m =>
      Object.entries(m.entries).filter(([k]) => k.toLowerCase() === w).map(([k, text]) => ({ source: m.name, term: k, text })));
    const lex = originalsFor(w).map(f => f.entry).slice(0, 6);
    return { dict, lex };
  }

  window.BSData = {
    BOOKS, registerModule, listModules, getModule, load, isLoaded, bookById, refKey, formatRef, parseRef,
    tokens, plainText, getVerse, chapters, chapterVerses, allVerses, countWord, searchVerses, inScope,
    lexiconEntry, lexiconEntries, occurrences, originalsFor, searchLexicon,
    commentaries, crossRefs, define,
  };
})();

/* ================= MODULES ================= */

BSData.registerModule({
  id: 'kjv', type: 'bible', abbrev: 'KJV', name: 'King James Version (1769)', language: 'en',
  license: 'Public domain text; Strong’s tagging from CrossWire (GPL)', installed: true, url: 'data/kjv.json',
});
BSData.registerModule({
  id: 'kjvplus', type: 'bible', abbrev: 'KJV+', name: 'King James Version with Strong’s numbers', language: 'en',
  installed: true, source: 'kjv', strongsInline: true,
});
BSData.registerModule({
  id: 'rv1909', type: 'bible', abbrev: 'RV1909', name: 'Reina-Valera 1909', language: 'es',
  license: 'Public domain', installed: true, url: 'data/rv1909.json',
});
BSData.registerModule({
  id: 'martin1744', type: 'bible', abbrev: 'Martin', name: 'Bible David Martin (1744)', language: 'fr',
  license: 'Public domain', installed: true, url: 'data/martin1744.json',
});

// Licensed translations: registered so the version button can cycle them, but locked.
// The Reina-Valera Gómez (CC BY-NC-ND) also needs its publisher's text and permission before it can be added.
['ESV', 'NASB', 'NIV'].forEach(abbrev => BSData.registerModule({
  id: abbrev.toLowerCase(), type: 'bible', abbrev, name: abbrev, language: 'en',
  license: 'paid-addon', installed: false,
}));

BSData.registerModule({
  id: 'strongs', type: 'lexicon', name: 'Strong’s Hebrew and Greek Dictionaries (Open Scriptures, CC-BY-SA)',
  installed: true, url: 'data/strongs.json',
});

const PH = '[Placeholder summary. The full public-domain text loads from this module.] ';

BSData.registerModule({
  id: 'mhc', type: 'commentary', abbrev: 'MHC', name: 'Matthew Henry', license: 'public-domain', installed: true,
  entries: {
    'Jhn.3.16': PH + 'Treats the verse as the heart of the gospel: the gift of the Son as the measure of God’s love, offered to all who believe, with eternal life set against perishing.',
    'Jhn.1.1': PH + 'Reads “the Word” as the eternal Son, present with the Father before creation and himself divine.',
    'Rom.5.8': PH + 'Draws out the contrast between human love, given to the worthy, and God’s love, shown to sinners and enemies.',
    'Psa.23.1': PH + 'Applies the shepherd image to God’s daily care and provision for his people.',
    '1Jn.4.8': PH + 'Argues that a loveless life shows no real knowledge of God, since love is his nature.',
  },
});

BSData.registerModule({
  id: 'barnes', type: 'commentary', abbrev: 'Barnes', name: 'Barnes’ Notes', license: 'public-domain', installed: true,
  entries: {
    'Jhn.3.16': PH + 'Notes the word “so” as expressing degree, and comments on the scope of “the world” and “whosoever.”',
    'Jhn.1.1': PH + 'Discusses the background of the term logos and why John chose it for Christ.',
    '1Co.13.4': PH + 'Explains why the KJV renders agapē as “charity” here and lists the marks of love in the passage.',
  },
});

BSData.registerModule({
  id: 'clarke', type: 'commentary', abbrev: 'Clarke', name: 'Adam Clarke', license: 'public-domain', installed: true,
  entries: {
    'Jhn.3.16': PH + 'Comments on “only begotten” and the universality of the offer of salvation.',
    'Gen.1.1': PH + 'Discusses the Hebrew bara and elohim and the plural form of the divine name.',
  },
});

BSData.registerModule({
  id: 'jfb', type: 'commentary', abbrev: 'JFB', name: 'Jamieson, Fausset & Brown', license: 'public-domain', installed: true,
  entries: {
    'Rom.5.8': PH + 'Highlights “commendeth” as God setting his love in its proper light by the death of Christ.',
  },
});

BSData.registerModule({
  id: 'pulpit', type: 'commentary', abbrev: 'Pulpit', name: 'Pulpit Commentary', license: 'public-domain', installed: false, entries: {},
});

BSData.registerModule({
  id: 'tsk', type: 'crossref', name: 'Treasury of Scripture Knowledge (sample)', license: 'public-domain', installed: true,
  refs: {
    'Jhn.3.16': ['Rom.5.8', '1Jn.4.9', '1Jn.4.10', 'Jhn.3.17'],
    'Jhn.3.17': ['Jhn.3.16', '1Jn.4.9'],
    'Jhn.1.1': ['Gen.1.1', 'Jhn.1.2', 'Heb.11.3'],
    'Jhn.1.4': ['Jhn.1.5', 'Gen.1.3'],
    'Gen.1.1': ['Jhn.1.1', 'Jhn.1.3', 'Heb.11.3'],
    'Gen.1.3': ['Jhn.1.4', 'Jhn.1.5'],
    'Rom.5.8': ['Jhn.3.16', 'Jhn.15.13', '1Jn.4.10'],
    '1Jn.4.8': ['1Jn.4.9', '1Jn.4.10', '1Co.13.4'],
    '1Jn.4.9': ['Jhn.3.16', 'Rom.5.8'],
    '1Jn.4.10': ['Rom.5.8', 'Jhn.3.16'],
    'Jhn.15.13': ['Rom.5.8', '1Jn.4.10'],
    'Rom.8.39': ['Rom.5.8', 'Jhn.3.16'],
    'Deu.6.5': ['Deu.6.4', '1Jn.4.8'],
    'Psa.23.1': ['Psa.23.4'],
    '1Co.13.13': ['1Co.13.4', '1Jn.4.8'],
  },
});

BSData.registerModule({
  id: 'smith', type: 'dictionary', name: 'Smith’s Bible Dictionary (sample)', license: 'public-domain', installed: true,
  entries: {
    Shepherd: '[Placeholder entry.] Covers the shepherd’s work in Palestine and the use of the figure for God and for leaders of his people.',
    Propitiation: '[Placeholder entry.] Covers the idea of atonement and the mercy seat.',
    Charity: '[Placeholder entry.] Notes that in the KJV “charity” means love, not almsgiving.',
    Word: '[Placeholder entry.] Covers the Logos title as used by John.',
  },
});
