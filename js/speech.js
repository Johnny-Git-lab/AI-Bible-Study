/*
 * Speech-to-text for voice commands. Uses the browser's built-in recognition
 * (Safari on iPhone, Chrome on Android). The provider is still an open
 * decision, so the rest of the app only uses start() and stop() and can be
 * pointed at another service later.
 */
(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LOCALES = { en: 'en-US', es: 'es-ES', fr: 'fr-FR' };
  let rec = null;

  function available() { return !!Recognition; }

  // handlers: { onText(text, isFinal), onEnd(finalText), onError(code) }
  function start(handlers) {
    stop();
    if (!Recognition) { handlers.onError && handlers.onError('unsupported'); return false; }
    rec = new Recognition();
    rec.lang = LOCALES[BSi18n.lang().id] || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = '';
    const mine = rec;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      handlers.onText && handlers.onText((finalText + interim).trim(), !interim);
    };
    rec.onerror = e => { if (rec === mine) handlers.onError && handlers.onError(e.error); };
    rec.onend = () => { if (rec === mine) { rec = null; handlers.onEnd && handlers.onEnd(finalText.trim()); } };
    try { rec.start(); } catch (e) { rec = null; handlers.onError && handlers.onError('start-failed'); return false; }
    return true;
  }

  function stop() {
    if (!rec) return;
    const r = rec;
    rec = null;
    try { r.abort(); } catch (e) { /* already stopped */ }
  }

  window.BSSpeech = { available, start, stop };
})();
