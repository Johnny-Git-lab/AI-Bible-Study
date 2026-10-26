/*
 * Interface language. The Language button cycles these. Scripture stays in
 * the selected Bible version; Spanish and French Bible text would come from
 * their own modules (e.g. Reina-Valera 1909, Louis Segond 1910).
 */
(function () {
  const LANGS = [
    { id: 'en', label: 'English', short: 'EN' },
    { id: 'es', label: 'Español', short: 'ES' },
    { id: 'fr', label: 'Français', short: 'FR' },
  ];

  const S = {
    listen: { en: 'Listen', es: 'Escuchar', fr: 'Écouter' },
    study: { en: 'Study', es: 'Estudio', fr: 'Étude' },
    version: { en: 'Version', es: 'Versión', fr: 'Version' },
    language: { en: 'Language', es: 'Idioma', fr: 'Langue' },
    reserved: { en: 'Reserved', es: 'Reservado', fr: 'Réservé' },
    command: { en: 'Command', es: 'Comando', fr: 'Commande' },
    play: { en: 'Play', es: 'Reproducir', fr: 'Lecture' },
    pause: { en: 'Pause', es: 'Pausa', fr: 'Pause' },
    nowPlaying: { en: 'Now playing', es: 'Reproduciendo', fr: 'En lecture' },
    paused: { en: 'Paused', es: 'En pausa', fr: 'En pause' },
    bible: { en: 'Bible', es: 'Biblia', fr: 'Bible' },
    commentaries: { en: 'Commentaries', es: 'Comentarios', fr: 'Commentaires' },
    lexicon: { en: 'Lexicon', es: 'Léxico', fr: 'Lexique' },
    notes: { en: 'Notes', es: 'Notas', fr: 'Notes' },
    crossref: { en: 'Cross-Ref', es: 'Referencias', fr: 'Références' },
    listening: { en: 'Listening…', es: 'Escuchando…', fr: 'Écoute…' },
    ask: { en: 'Ask', es: 'Preguntar', fr: 'Demander' },
    close: { en: 'Close', es: 'Cerrar', fr: 'Fermer' },
    add: { en: 'Add', es: 'A\u00f1adir', fr: 'Ajouter' },
    addSermon: { en: 'Add a sermon', es: 'A\u00f1adir un serm\u00f3n', fr: 'Ajouter un sermon' },
    loadAudio: { en: 'Load sermon audio', es: 'Cargar audio', fr: 'Charger un audio' },
    useSample: { en: 'Use sample sermon', es: 'Usar sermón de ejemplo', fr: 'Sermon d’exemple' },
    searchBible: { en: 'Search the Bible', es: 'Buscar en la Biblia', fr: 'Chercher dans la Bible' },
    tapToResume: { en: 'Audio paused. Press Play to resume at', es: 'Audio en pausa. Pulse Reproducir para seguir en', fr: 'Audio en pause. Appuyez sur Lecture pour reprendre à' },
  };

  let current = 0;

  function t(key) {
    const row = S[key];
    if (!row) return key;
    return row[LANGS[current].id] || row.en;
  }

  function cycle() {
    current = (current + 1) % LANGS.length;
    return LANGS[current];
  }

  function lang() { return LANGS[current]; }

  window.BSi18n = { t, cycle, lang, LANGS };
})();
