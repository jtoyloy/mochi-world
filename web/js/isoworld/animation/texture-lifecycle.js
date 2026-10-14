// Assets owns shared PNG textures for the document. Each World owns only its
// frame views and generated canvases; releasing a World must not unload another.
export class WorldTextures {
  constructor() {
    this.textures = [];
    this.owned = new Set();
    this.sources = new Set();
    this.released = false;
  }
  shared(texture) {
    if (!this.released && !this.textures.includes(texture)) this.textures.push(texture);
    return texture;
  }
  own(texture, ownsSource = false) {
    if (ownsSource) this.sources.add(texture.source);
    if (this.released) {
      const source = texture.source;
      texture.destroy(false);
      if (ownsSource) source.destroy();
      this.sources.delete(source);
      return texture;
    }
    if (!this.textures.includes(texture)) this.textures.push(texture);
    this.owned.add(texture);
    return texture;
  }
  atlas(art) {
    for (const texture of art.ownedTextures ?? []) this.own(texture);
    return art;
  }
  destroy() {
    if (this.released) return;
    this.released = true;
    for (const texture of this.owned) texture.destroy(false);
    for (const source of this.sources) source.destroy();
    this.owned.clear();
    this.sources.clear();
    this.textures.length = 0;
  }
}
