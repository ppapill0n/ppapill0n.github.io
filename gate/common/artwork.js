// Resolve from this shared module so every game uses the same artwork asset.
export const characterImageUrl = new URL('../assets/character-reference.png', import.meta.url).href;
