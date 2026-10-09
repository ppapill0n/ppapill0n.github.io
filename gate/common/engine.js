export const defaultRules = Object.freeze({ requireStopped: true, tolerance: 0 });
export const formatValue = value => String(value).padStart(4, '0');
export const canEnter = (target, state, rules = defaultRules) => !!state && (rules.humanVictory ? state.outcome === 'human' : Number.isInteger(target) && Number.isInteger(state.value) && Math.abs(state.value - target) <= (rules.tolerance ?? 0)) && (!rules.requireStopped || state.stopped);
export function createGate(rules = defaultRules, random = Math.random) {
  let target = null;
  return {
    next() {
      let next = Math.floor(random() * 10000);
      if (next === target) next = (next + 1) % 10000;
      target = next;
      let start = Math.floor(random() * 10000);
      if (start === target) start = (start + 1) % 10000;
      return { target, start };
    },
    canEnter(state) {
      return canEnter(target, state, rules);
    }
  };
}
