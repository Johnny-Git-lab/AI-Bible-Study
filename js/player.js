/*
 * Sermon player. Two sources share one interface:
 *  - "sample": a silent simulated clock with a placeholder timestamped transcript
 *  - "file": an audio file the user picks, played through <audio>
 */
(function () {
  const SAMPLE_SERMON = {
    id: 'sermon-sample-1',
    title: 'God So Loved the World',
    speaker: 'Sample sermon',
    date: '2026-10-25',
    duration: 1260,
    transcript: [
      { t: 0, text: 'Turn with me this morning to the Gospel of John, chapter three.', refs: [] },
      { t: 55, text: '“For God so loved the world, that he gave his only begotten Son.”', refs: ['Jhn.3.16'] },
      { t: 140, text: 'Notice the word “so.” It tells us how much, not only that he loved.', refs: ['Jhn.3.16'] },
      { t: 230, text: 'John uses agapē and agapaō, the love that gives without first being earned.', refs: [] },
      { t: 330, text: 'Paul says it plainly: while we were yet sinners, Christ died for us.', refs: ['Rom.5.8'] },
      { t: 450, text: 'And John again, in his first letter: God is love.', refs: ['1Jn.4.8'] },
      { t: 560, text: 'Herein is love, not that we loved God, but that he loved us.', refs: ['1Jn.4.10'] },
      { t: 690, text: 'Go back to the beginning. In the beginning was the Word.', refs: ['Jhn.1.1'] },
      { t: 820, text: 'The light shineth in darkness, and the darkness comprehended it not.', refs: ['Jhn.1.5'] },
      { t: 950, text: 'Nothing, Paul says, shall be able to separate us from the love of God.', refs: ['Rom.8.39'] },
      { t: 1100, text: 'So this week, ask yourself: whosoever believeth. Does that include me?', refs: ['Jhn.3.16'] },
      { t: 1200, text: 'Let us pray.', refs: [] },
    ],
  };

  let sermon = SAMPLE_SERMON;
  let source = 'sample';
  let position = 55; // open on a transcript line that links a verse
  let playing = false;
  let timer = null;
  let lastTick = 0;
  let audio = null;
  let yt = null;        // YouTube IFrame player, when the page is allowed to load it
  let ytLive = false;   // true once a YouTube video is ready to play
  const subs = [];

  function emit() {
    subs.forEach(fn => fn(state()));
  }

  function state() {
    return { sermon, source, position, duration: sermon.duration, playing, ytLive, segment: segmentAt(position) };
  }

  function segmentAt(t) {
    const list = sermon.transcript || [];
    let seg = null;
    for (const s of list) { if (s.t <= t) seg = s; else break; }
    return seg;
  }

  function tick() {
    const now = performance.now();
    if (source === 'youtube' && ytLive) {
      position = yt.getCurrentTime() || 0;
    } else if (source !== 'file') {
      position = Math.min(sermon.duration, position + (now - lastTick) / 1000);
      if (position >= sermon.duration) pause();
    } else if (audio) {
      position = audio.currentTime;
    }
    lastTick = now;
    emit();
  }

  function play() {
    if (playing) return;
    if (position >= sermon.duration) position = 0;
    playing = true;
    lastTick = performance.now();
    if (source === 'file' && audio) audio.play().catch(() => { playing = false; emit(); });
    if (source === 'youtube' && ytLive) yt.playVideo();
    timer = setInterval(tick, 250);
    emit();
  }

  function pause() {
    if (!playing) return;
    tick();
    playing = false;
    clearInterval(timer);
    if (audio) audio.pause();
    if (source === 'youtube' && ytLive) yt.pauseVideo();
    emit();
  }

  function toggle() { playing ? pause() : play(); }

  function seek(t) {
    position = Math.max(0, Math.min(sermon.duration, t));
    if (audio) audio.currentTime = position;
    if (source === 'youtube' && ytLive) yt.seekTo(position, true);
    emit();
  }

  function loadFile(file) {
    pause();
    stopYouTube();
    if (audio) URL.revokeObjectURL(audio.src);
    audio = new Audio(URL.createObjectURL(file));
    source = 'file';
    position = 0;
    sermon = {
      id: 'sermon-' + Date.now(),
      title: file.name.replace(/\.[^.]+$/, ''),
      speaker: 'Your recording',
      date: new Date().toISOString().slice(0, 10),
      duration: 0,
      transcript: [],
    };
    audio.addEventListener('loadedmetadata', () => { sermon.duration = audio.duration || 0; emit(); });
    audio.addEventListener('ended', () => { playing = false; clearInterval(timer); emit(); });
    emit();
  }

  // YouTube links play through YouTube's own embedded player (IFrame API).
  // Where the page can't load YouTube (the Claude preview), the silent clock runs instead.
  let ytApi = null;
  function ytApiReady() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!ytApi) {
      ytApi = new Promise((resolve, reject) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onerror = reject;
        document.head.appendChild(tag);
        setTimeout(() => reject(new Error('YouTube did not load')), 8000);
      });
      ytApi.catch(() => { ytApi = null; });
    }
    return ytApi;
  }

  function stopYouTube() {
    ytLive = false;
    if (yt) { try { yt.destroy(); } catch (e) { /* already gone */ } yt = null; }
  }

  function startYouTube(id) {
    ytApiReady().then(() => {
      if (sermon.id !== 'yt-' + id) return; // another sermon was picked meanwhile
      yt = new YT.Player('ytPlayer', {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            ytLive = true;
            // Ask for the lowest quality to save data. YouTube treats this as a hint and
            // mainly chooses quality from the player's size, which is why it starts compact.
            try { yt.setPlaybackQuality('small'); } catch (e) { /* not supported */ }
            sermon.duration = yt.getDuration() || sermon.duration;
            const data = yt.getVideoData ? yt.getVideoData() : null;
            if (data && data.title) { sermon.title = data.title; sermon.speaker = data.author || sermon.speaker; }
            emit();
          },
          onStateChange: e => {
            // Keep our state in step when the viewer uses YouTube's own controls.
            if (e.data === YT.PlayerState.PLAYING && !playing) { playing = true; lastTick = performance.now(); timer = setInterval(tick, 250); emit(); }
            if ((e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) && playing) { playing = false; clearInterval(timer); tick(); }
          },
        },
      });
    }).catch(() => { /* preview without YouTube: keep the silent clock */ });
  }

  function youTubeId(url) {
    const m = String(url).trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
    return m ? m[1] : null;
  }

  function loadYouTube(url) {
    const id = youTubeId(url);
    if (!id) return null;
    pause();
    if (audio) { URL.revokeObjectURL(audio.src); audio = null; }
    stopYouTube();
    source = 'youtube';
    position = 0;
    sermon = {
      id: 'yt-' + id,
      title: 'YouTube sermon',
      speaker: `youtu.be/${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
      date: new Date().toISOString().slice(0, 10),
      duration: 2400,
      transcript: [],
    };
    emit();
    startYouTube(id);
    return sermon;
  }

  function loadSample() {
    pause();
    stopYouTube();
    if (audio) { URL.revokeObjectURL(audio.src); audio = null; }
    sermon = SAMPLE_SERMON;
    source = 'sample';
    position = 0;
    emit();
  }

  function subscribe(fn) { subs.push(fn); fn(state()); }

  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    const m = Math.floor(t / 60), s = t % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  window.BSPlayer = { play, pause, toggle, seek, loadFile, loadYouTube, youTubeId, loadSample, subscribe, state, fmt, SAMPLE_SERMON };
})();
