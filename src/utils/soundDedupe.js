const PREFIX = 'repair-series-sound:'

export function wasSoundPlayed(key) {
  try {
    return sessionStorage.getItem(PREFIX + key) === '1'
  } catch {
    return false
  }
}

export function markSoundPlayed(key) {
  try {
    sessionStorage.setItem(PREFIX + key, '1')
  } catch {
    // ignore
  }
}
