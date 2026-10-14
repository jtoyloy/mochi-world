// Bind the existing audio engine without starting sound outside a user gesture.
export function bindAudioControls({ audio, slider, mute, status }) {
  function update() {
    slider.value = String(audio.volume);
    mute.textContent = audio.muted ? "Unmute" : "Mute";
    mute.setAttribute("aria-label", audio.muted ? "Unmute sound" : "Mute sound");
    mute.setAttribute("aria-pressed", String(audio.muted));
    status.textContent = audio.preferenceError ?? "";
  }
  slider.oninput = () => { audio.setVolume(Number(slider.value)); update(); };
  mute.onclick = () => { audio.setMuted(!audio.muted); update(); };
  update();
}
