# Bible Study App: Phase 1 clickable prototype

A mobile-first web prototype of the Listen and Study screens. Plain HTML, CSS and JavaScript with no build step. Live site (GitHub Pages): https://johnny-git-lab.github.io/AI-Bible-Study/ . Or open `index.html` through any static web server.

## What works

**Listen** (radio-style layout, approved 2026-10-26)
- Top half is the display: sermon title, live transcript line, verse chips, and the timeline.
- Bottom half is round buttons. Three small ones across the middle, then the big Play/Pause at the bottom center with a round button on each side.
- A Listen/Study switch at the top replaces the bottom tab bar. "+ Add" opens: paste a YouTube link, upload from device, record (coming later), or use the sample sermon.
- Tap the transcript line to pause and open the full transcript, larger. Tap lines to pick them, or press and hold to select words, then Copy or Send to note (new note or an existing topic). Voice: "Show the transcript".
- YouTube links are accepted and stored, but this preview can't play YouTube. The real app would use YouTube's embedded player.
- Audio Bible ("+ Add" > Audio Bible): reads the chosen version aloud with the phone's voice, verse by verse. A controller under the verse has previous/next book, previous/next chapter, and a chapter/book picker; the bar jumps by verse, chapters advance on their own, and the Study tab follows along on the verse being read. Human narration (Faith Comes By Hearing, Bible Brain API) is planned.
- Small round buttons: Version cycle (KJV, KJV+, Reina-Valera 1909, Martin 1744, then ESV, NASB and NIV shown as locked paid add-ons), Language cycle (English, Spanish, French interface text), and a reserved button.
- Large Play/Pause, a reserved button on the left, and Command on the right.
- Placeholder sermon ("God So Loved the World") with a silent simulated clock, a scrubber, and a timestamped transcript whose verse chips open the Study view.
- "Load sermon audio" plays a real audio file from the device. Transcription is not wired yet.
- Command pauses the audio and listens using the phone's built-in speech recognition (Safari on iPhone, Chrome on Android). Typing and example phrases remain as a fallback. Results appear as a card over the middle of the screen, so Play and Command stay reachable. Pressing Play closes the card and resumes at the same position.
- Supported commands: word count, Greek or Hebrew for a word, where a word appears in Greek or Hebrew, find verses, define, copy to notes, and cross-references. Anything else is treated as interpretive and shows what would be sent to Claude.
- Keyboard stand-in for the future device (not shown on screen): `1` `2` `3` top row, `Z` left, `Space` play, `C` command.

**Study**
- Bible: book and chapter pickers, search, and a selected verse. In KJV+ each word shows its Strong's number in blue: tap it for the definition, press and hold for a window that searches that word in the whole Bible, Old Testament, New Testament or the current book.
- Search (typed, or a voice "find" command such as "Find light in the New Testament") opens a results screen with All / Old Testament / New Testament / current-book filters and counts.
- Commentaries: entries for the selected verse from the bundled commentary modules.
- Lexicon: Strong's search, and an entry view with definition, KJV renderings, and every verse that uses the word.
- Notes: grouped by sermon, topic or date. Sermon captures carry the sermon title and timestamp. Tapping a verse chip opens the Bible at that verse. Notes are stored in the browser only.
- Cross-Ref: related passages for the selected verse.

## Structure

| File | Role |
|---|---|
| `js/buttons.js` | Button layer. Six logical buttons (`version`, `language`, `reserved_top`, `reserved_left`, `play_pause`, `command`). Screen taps, keyboard keys and later the Bluetooth device all call `BSButtons.press(id)`. |
| `js/app.js` | Controller that maps each button to an action, plus shared state and tab switching. Screens never handle button presses themselves. |
| `js/data.js` | Data layer. Every content source is a registered module (`bible`, `lexicon`, `commentary`, `crossref`, `dictionary`) with a license of `public-domain` or `paid-addon`. Adding ESV later means registering one more module. |
| `js/commands.js` | Command router. Takes recognised text and returns a result card. Local lookups for word questions, a Claude placeholder for interpretive ones. |
| `js/player.js` | Sermon player with one interface for the simulated sample and a real audio file. |
| `js/notes.js` | Notes store. |
| `js/listen.js`, `js/study.js` | The two screens. |
| `js/i18n.js` | Interface strings for English, Spanish and French. |

## Bible and lexicon data

Built by `tools/build_data.py` into `data/` (run it again to rebuild):

| File | Contents | License |
|---|---|---|
| `data/kjv.json` | Full KJV (1769), every word tagged with Strong's numbers. Used for both KJV and KJV+. | Text public domain; Strong's tagging from the CrossWire KJV module (GPL) |
| `data/rv1909.json` | Reina-Valera 1909 (Spanish) | Public domain |
| `data/martin1744.json` | Bible David Martin 1744 (French, Textus Receptus) | Public domain |
| `data/strongs.json` | Strong's Greek and Hebrew dictionaries, 14,197 entries | Open Scriptures, CC-BY-SA |

Before a paid release, review the GPL tagging and CC-BY-SA lexicon terms. The Reina-Valera Gómez is CC BY-NC-ND and its text isn't openly downloadable, so it needs the publisher's text and permission.

Still sample data: commentary entries (placeholder summaries, not quotations), cross-references (a few verses), and the Smith's dictionary entries.

## Open decisions (left as placeholders)

1. App name. The prototype is titled "Bible Study Prototype".
2. Reserved buttons. Top-right and bottom-left show "Reserved" and a message when pressed.
3. On-device versus Claude for voice commands. The router already splits word lookups (local) from interpretive questions (Claude).
4. Speech-to-text provider. Voice is simulated by typing. Uploaded audio shows a "transcript will appear here" placeholder.
5. Which commentaries to bundle. Matthew Henry, Barnes, Clarke and JFB are sample modules. Pulpit Commentary is registered as not bundled.
6. Subscription model. ESV, NASB and NIV appear as locked add-ons with no purchase flow.

Also undecided: whether the Language button should change only the interface, or also switch the Bible text to a public-domain translation in that language (Reina-Valera 1909, Louis Segond 1910). The prototype changes only the interface.

## Not in this prototype

Transcription, the Claude API, the transcript highlight-to-verse flow, "Organize by topic", split view, full commentaries, and cross-references.
