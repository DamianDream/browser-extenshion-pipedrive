/* User-supplied recording bundled locally. */
globalThis.PFMeow = (() => {
  const sounds = ['meow.mp3', 'meow-3.mp3', 'meow-5.mp3'];
  let currentAudio = null;

  function stop() {
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch {}
      currentAudio = null;
    }
  }

  function play(enabled = true) {
    if (enabled === false) return;
    try {
      stop();
      const filename = sounds[Math.floor(Math.random() * sounds.length)];
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime || globalThis.PF?.api?.runtime;
      const src = runtime?.getURL ? runtime.getURL(filename) : filename;
      const audio = new Audio(src);
      audio.volume = 0.35; // Comfortable, clearly audible 25-30% volume
      currentAudio = audio;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('PFMeow playback warning:', err);
        });
      }
    } catch (error) {
      console.warn('PFMeow error:', error);
    }
  }

  let purrAudio = null;

  function purr() {
    try {
      if (purrAudio) {
        try {
          purrAudio.pause();
          purrAudio.currentTime = 0;
        } catch {}
      }
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime || globalThis.PF?.api?.runtime;
      const src = runtime?.getURL ? runtime.getURL('purr.mp3') : 'purr.mp3';
      purrAudio = new Audio(src);
      purrAudio.volume = 0.55; // gentle, clearly audible purring
      const playPromise = purrAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('PFMeow purr() warning:', err);
        });
      }
      return purrAudio;
    } catch (error) {
      console.warn('PFMeow purr error:', error);
      return null;
    }
  }

  return { play, stop, purr };
})();
