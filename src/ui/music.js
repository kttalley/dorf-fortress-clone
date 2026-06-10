/**
 * Background music: one looping track, playing by default, with a mute
 * toggle. The track has its own fade out/in baked in, so a plain loop is
 * seamless enough.
 *
 * Browsers block audio autoplay until the user interacts with the page, so
 * we try to start immediately and fall back to starting on the first
 * pointer/key gesture. The mute preference persists across sessions.
 */

import musicUrl from '../assets/Dorfs-bg.mp3';

const STORAGE_KEY = 'dorf.musicMuted';

let audio = null;
let muted = false;

export function initMusic() {
  if (audio) return;
  audio = new Audio(musicUrl);
  audio.loop = true;
  audio.volume = 0.45;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === '1';
  } catch { /* storage unavailable; default to unmuted */ }
  audio.muted = muted;

  const attempt = audio.play();
  if (attempt && attempt.catch) {
    attempt.catch(() => {
      const resume = () => {
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
        audio.play().catch(() => {});
      };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    });
  }
}

export function isMusicMuted() {
  return muted;
}

/** Flip the mute state; returns the new muted value. */
export function toggleMusicMuted() {
  muted = !muted;
  if (audio) audio.muted = muted;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch { /* non-fatal */ }
  return muted;
}
