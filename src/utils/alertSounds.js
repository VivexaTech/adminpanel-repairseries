/**
 * Custom MP3 alerts (place files under `public/sounds/`).
 * Defaults: `/sounds/notification.mp3` for both booking and chat (use env to split).
 *
 * Optional `.env.local`:
 *   VITE_SOUND_NEW_BOOKING=/sounds/booking-new.mp3
 *   VITE_SOUND_NEW_CHAT=/sounds/chat-message.mp3
 *
 * Dedupe / “play once per event” is handled in AppContext via soundDedupe keys.
 * Browsers may block audio until a user gesture (e.g. login); preload runs after session.
 */

const DEFAULT_MP3 = '/sounds/notification.mp3'

export const SOUND_URL_NEW_BOOKING =
  import.meta.env.VITE_SOUND_NEW_BOOKING?.trim() || DEFAULT_MP3
export const SOUND_URL_NEW_CHAT =
  import.meta.env.VITE_SOUND_NEW_CHAT?.trim() || DEFAULT_MP3

/** @type {Map<string, HTMLAudioElement>} */
const audioPool = new Map()

function getOrCreateAudio(src) {
  if (typeof window === 'undefined') return null
  let el = audioPool.get(src)
  if (!el) {
    el = new Audio(src)
    el.preload = 'auto'
    el.loop = false
    audioPool.set(src, el)
  }
  return el
}

function playMp3Once(src) {
  const audio = getOrCreateAudio(src)
  if (!audio) return
  try {
    audio.loop = false
    audio.pause()
    audio.currentTime = 0
    const p = audio.play()
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        console.warn('[alertSounds] Could not play', src, err?.message || err)
      })
    }
  } catch (e) {
    console.warn('[alertSounds]', e)
  }
}

/** Preload after login to reduce first-play delay. */
export function preloadAlertSounds() {
  try {
    const a = getOrCreateAudio(SOUND_URL_NEW_BOOKING)
    const b = getOrCreateAudio(SOUND_URL_NEW_CHAT)
    a?.load()
    if (b !== a) b?.load()
  } catch {
    // ignore
  }
}

/** New booking (status New) — custom MP3 */
export function playNewBookingSiren() {
  playMp3Once(SOUND_URL_NEW_BOOKING)
}

/** New support message from user — custom MP3 */
export function playChatMessageSound() {
  playMp3Once(SOUND_URL_NEW_CHAT)
}
