// The adapters are shared with /gate/. This controller has no entry or pass API.
export function createFreeplayController({ registry, root, allowed, selected = () => {}, changed = () => {}, denied = () => {}, failed = () => {} }) {
  const games = new Map(registry.map(game => [game.id, game]));
  let active = null, definition = null, challenge = null, generation = 0;
  function close() {
    // Destroy may synchronously notify. Invalidate first, including after a win.
    generation++;
    const previous = active; active = null; definition = null; challenge = null;
    previous?.destroy();
    root.replaceChildren();
    root.classList.remove('slots-spinning', 'slots-bonus');
    delete root.dataset.game; delete root.dataset.phase;
  }
  function select(id) {
    if (!allowed()) { close(); denied(); return false; }
    close();
    const game = games.get(id);
    if (!game) { selected(null, null); return true; }
    const current = generation;
    let ready = false;
    definition = game; challenge = game.next();
    root.dataset.game = game.id;
    selected(game, challenge);
    try {
      const notify = state => {
        if (current !== generation || !ready) return;
        if (!allowed()) {
          // Some adapters continue drawing after changed() returns. Invalidate
          // immediately, then destroy after that stack unwinds to avoid removing
          // DOM from underneath the in-flight render. A newer selection wins.
          const blocked = ++generation;
          queueMicrotask(() => { if (generation === blocked) { close(); denied(); } });
          return;
        }
        changed(state, game, challenge);
      };
      const instance = game.create(root, notify, () => {}); // Dial's Enter key is harmless in freeplay.
      if (current !== generation) { instance.destroy(); return false; }
      active = instance;
      active.reset(challenge);
      ready = true;
      if (current === generation) notify(active.getState());
      return current === generation;
    } catch (error) {
      close(); definition = game; failed(error, game); return false;
    }
  }
  return { select, restart: () => select(definition?.id), close, get id() { return definition?.id ?? null; } };
}

export function selectedGame(search, registry) {
  const id = new URLSearchParams(search).get('game');
  return registry.some(game => game.id === id) ? id : null;
}
