// Presentation preferences only; no scene, navigation or server state changes.
export const QUALITY_KEY = "mochi-isoworld-quality";
const storage = () => window.localStorage;
const validQuality = value => value === "standard" || value === "low";

export class GraphicsQualityPreference {
  constructor({ getStorage = storage, pixelRatio = () => window.devicePixelRatio } = {}) {
    this.getStorage = getStorage;
    this.pixelRatio = pixelRatio;
    this.value = "standard";
    this.notice = "";
    try {
      const saved = this.getStorage().getItem(QUALITY_KEY);
      if (saved !== null && validQuality(saved)) this.value = saved;
      else if (saved !== null) this.notice = "Saved quality was invalid; using Standard for this session.";
    } catch {
      this.notice = "Quality preference could not be read; using Standard for this session.";
    }
  }
  profile() {
    const ratio = this.pixelRatio();
    return this.value === "low"
      ? { resolution: 1, maxFPS: 30 }
      : { resolution: Math.min(Number.isFinite(ratio) && ratio > 0 ? ratio : 1, 2), maxFPS: 0 };
  }
  apply(app) {
    const profile = this.profile();
    if (app.renderer.resolution !== profile.resolution)
      app.renderer.resize(app.renderer.screen.width, app.renderer.screen.height, profile.resolution);
    app.ticker.maxFPS = profile.maxFPS;
  }
  select(value, app) {
    if (!validQuality(value)) return false;
    this.value = value;
    this.apply(app);
    try {
      this.getStorage().setItem(QUALITY_KEY, value);
      this.notice = "Saved on this device.";
    } catch {
      this.notice = "Could not save quality; this choice works for this session.";
    }
    return true;
  }
  status(app) {
    const density = Number(app.renderer.resolution.toFixed(2));
    const cap = app.ticker.maxFPS;
    return `${this.value === "low" ? "Low power" : "Standard"} · ${density}× pixel density · ${cap ? `${cap} FPS cap` : "display refresh"}${this.notice ? `. ${this.notice}` : "."}`;
  }
}

export function readMotionPreference(getStorage = storage) {
  try {
    const saved = getStorage().getItem("mochi-reduced-motion");
    if (saved === "true" || saved === "false") return { override: saved === "true", notice: "" };
    return { override: null, notice: saved === null ? "" : "Saved motion preference was invalid; using the system setting." };
  } catch {
    return { override: null, notice: "Motion preference could not be read; using the system setting." };
  }
}
export function saveMotionPreference(enabled, getStorage = storage) {
  try {
    getStorage().setItem("mochi-reduced-motion", String(enabled));
    return "";
  } catch {
    return "Could not save motion; this choice works for this session.";
  }
}
