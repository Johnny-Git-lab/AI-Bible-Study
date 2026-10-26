/*
 * Notes store. Kept in this browser only for the prototype; the real app
 * would sync these. Note: { id, text, refs[], sermonId, sermonTitle,
 * timestamp, topic, date, kind: "capture" | "note" }.
 */
(function () {
  const KEY = 'bs-notes-v1';
  const SEED = [
    { id: 'n1', kind: 'capture', text: '“Notice the word ‘so.’ It tells us how much, not only that he loved.”', refs: ['Jhn.3.16'], sermonId: 'sermon-sample-1', sermonTitle: 'God So Loved the World', timestamp: 142, topic: 'Love of God', date: '2026-10-25' },
    { id: 'n2', kind: 'note', text: 'KJV renders agapē as “charity” in 1 Corinthians 13. Compare with 1 John 4:8.', refs: ['1Co.13.4', '1Jn.4.8'], sermonId: null, sermonTitle: null, timestamp: null, topic: 'Word studies', date: '2026-10-22' },
    { id: 'n3', kind: 'note', text: 'Sermon idea: John 1 and Genesis 1 side by side. Light, Word, beginning.', refs: ['Jhn.1.1', 'Gen.1.1'], sermonId: null, sermonTitle: null, timestamp: null, topic: 'Sermon prep', date: '2026-10-19' },
  ];

  let notes = load();
  const subs = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable */ }
    return SEED.slice();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) { /* storage unavailable */ }
    subs.forEach(fn => fn(notes));
  }

  function add(note) {
    const n = { id: 'n' + Date.now(), date: new Date().toISOString().slice(0, 10), refs: [], topic: 'Unsorted', kind: 'note', ...note };
    notes.unshift(n);
    save();
    return n;
  }

  function remove(id) {
    notes = notes.filter(n => n.id !== id);
    save();
  }

  function reset() {
    notes = SEED.slice();
    save();
  }

  function all() { return notes.slice(); }

  function subscribe(fn) { subs.push(fn); }

  window.BSNotes = { add, remove, reset, all, subscribe };
})();
