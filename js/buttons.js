/*
 * Button layer. The app reacts to six logical buttons, never to DOM clicks
 * directly. The phone screen, a keyboard, and the future handheld device
 * (Bluetooth buttons) are all just input sources calling BSButtons.press().
 *
 *   [ VERSION ]   [ LANGUAGE ]   [ RESERVED_TOP ]
 *
 *   [ RESERVED_LEFT ]  [  PLAY_PAUSE  ]  [ COMMAND ]
 */
(function () {
  const IDS = {
    VERSION: 'version',
    LANGUAGE: 'language',
    RESERVED_TOP: 'reserved_top',
    RESERVED_LEFT: 'reserved_left',
    PLAY_PAUSE: 'play_pause',
    COMMAND: 'command',
  };

  // Keyboard stand-in for the hardware device.
  const KEYMAP = {
    '1': IDS.VERSION, '2': IDS.LANGUAGE, '3': IDS.RESERVED_TOP,
    'z': IDS.RESERVED_LEFT, ' ': IDS.PLAY_PAUSE, 'c': IDS.COMMAND,
  };

  const handlers = {};
  const listeners = [];

  function on(id, fn) {
    (handlers[id] = handlers[id] || []).push(fn);
  }

  // Any-button listener, used for logging and for the device mirror later.
  function onAny(fn) {
    listeners.push(fn);
  }

  function press(id, source = 'screen') {
    listeners.forEach(fn => fn(id, source));
    (handlers[id] || []).forEach(fn => fn({ id, source }));
  }

  // Wires every element with data-button="<id>" inside root to press().
  function bindScreen(root) {
    root.querySelectorAll('[data-button]').forEach(el => {
      el.addEventListener('click', () => press(el.dataset.button, 'screen'));
    });
  }

  function bindKeyboard(isActive) {
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      const id = KEYMAP[e.key.toLowerCase()];
      if (!id || !isActive()) return;
      e.preventDefault();
      press(id, 'keyboard');
    });
  }

  window.BSButtons = { IDS, KEYMAP, on, onAny, press, bindScreen, bindKeyboard };
})();
