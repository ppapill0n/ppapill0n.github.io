export const SIZE = 15, HUMAN = 1, PANDA = 2;
export const emptyBoard = () => new Uint8Array(SIZE * SIZE);
export const legalMove = (board, index) => Number.isInteger(index) && index >= 0 && index < SIZE * SIZE && board[index] === 0;
export function validBoard(board) {
  return board?.length === SIZE * SIZE && Array.from(board).every(v => v === 0 || v === HUMAN || v === PANDA);
}
export function winningLine(board, index) {
  const color = board[index];
  if (!color) return [];
  const r = Math.floor(index / SIZE), c = index % SIZE;
  for (const [dr, dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let y = r + dr * sign, x = c + dc * sign;
      while (y >= 0 && y < SIZE && x >= 0 && x < SIZE && board[y * SIZE + x] === color) {
        line.push(y * SIZE + x); y += dr * sign; x += dc * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}
export function createMatch(humanFirst = true) {
  const board = emptyBoard();
  let turn = humanFirst ? HUMAN : PANDA, outcome = null, line = [], moves = [];
  return {
    board,
    get turn() { return turn; }, get outcome() { return outcome; },
    get line() { return [...line]; }, get moves() { return [...moves]; },
    play(index, color = turn) {
      if (outcome || color !== turn || !legalMove(board, index)) return false;
      board[index] = color; moves.push(index); line = winningLine(board, index);
      if (line.length) outcome = color === HUMAN ? 'human' : 'panda';
      else if (moves.length === SIZE * SIZE) outcome = 'draw';
      else turn = 3 - turn;
      return true;
    }
  };
}
