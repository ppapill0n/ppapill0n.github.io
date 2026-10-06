export const slotSymbols = Object.freeze(['cherry', 'lemon', 'grapes', 'gem', 'nokyong', 'panda', 'seven']);
export const reelDurations = Object.freeze([1600, 2200, 2800]);
export const drawReels = (random = Math.random) => Array.from({ length:3 }, () => Math.floor(random() * slotSymbols.length));
export const slotsWin = (reels, settled) => Boolean(settled) && reels.length === 3 && reels.every(value => value === 6);
export function reelPosition(start, outcome, index, elapsed) {
  const progress = Math.max(0, Math.min(1, elapsed / reelDurations[index]));
  const travel = (4 + index) * slotSymbols.length + (outcome - start + slotSymbols.length) % slotSymbols.length;
  return start + travel * (1 - (1 - progress) ** 3);
}
export const slotsBonus = (reels, settled) => Boolean(settled) && reels.length === 3 && Number.isInteger(reels[0]) && reels[0] >= 0 && reels[0] < 6 && reels.every(value => value === reels[0]);
