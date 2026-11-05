'use strict';

/* =========================================================
   Constantes
   ========================================================= */
const FILES = 'abcdefgh';
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
// Notação em português: R = Rei, D = Dama, T = Torre, B = Bispo, C = Cavalo
const SAN_LETTER = { k: 'R', q: 'D', r: 'T', b: 'B', n: 'C', p: '' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const COLOR_NAME = { w: 'Brancas', b: 'Pretas' };

const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const opp = color => (color === 'w' ? 'b' : 'w');
const sqName = (r, c) => FILES[c] + (8 - r);
const sameSq = (a, b) => a[0] === b[0] && a[1] === b[1];
// ︎ força a forma de texto (evita que ♟ vire emoji em alguns sistemas)
const glyph = type => GLYPH[type] + '︎';

/* =========================================================
   Motor de regras
   Tabuleiro: board[linha][coluna], linha 0 = 8ª fileira (lado das pretas)
   Peça: { type: 'p'|'n'|'b'|'r'|'q'|'k', color: 'w'|'b' }
   ========================================================= */
function initialBoard() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: 'b' };
    board[1][c] = { type: 'p', color: 'b' };
    board[6][c] = { type: 'p', color: 'w' };
    board[7][c] = { type: back[c], color: 'w' };
  }
  return board;
}

function newGameState() {
  const st = {
    board: initialBoard(),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null,          // casa alvo de en passant [linha, coluna]
    halfmove: 0,       // lances desde a última captura ou movimento de peão
    fullmove: 1,
    moves: [],         // histórico em notação algébrica
    positions: {},     // contagem de posições (repetição tripla)
    captured: { w: [], b: [] },
    lastMove: null,
    result: null,
  };
  st.positions[positionKey(st, legalMoves(st))] = 1;
  return st;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) return [r, c];
    }
  return null;
}

// A casa (r, c) é atacada por alguma peça da cor `by`?
function isAttacked(board, r, c, by) {
  const pawnRow = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const p = inside(pawnRow, c + dc) && board[pawnRow][c + dc];
    if (p && p.color === by && p.type === 'p') return true;
  }
  for (const [dr, dc] of KNIGHT_STEPS) {
    const p = inside(r + dr, c + dc) && board[r + dr][c + dc];
    if (p && p.color === by && p.type === 'n') return true;
  }
  for (const [dr, dc] of KING_STEPS) {
    const p = inside(r + dr, c + dc) && board[r + dr][c + dc];
    if (p && p.color === by && p.type === 'k') return true;
  }
  const slides = (dirs, types) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr][cc];
        if (p) {
          if (p.color === by && types.includes(p.type)) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  return slides(ROOK_DIRS, 'rq') || slides(BISHOP_DIRS, 'bq');
}

function isInCheck(st, color = st.turn) {
  const k = findKing(st.board, color);
  return isAttacked(st.board, k[0], k[1], opp(color));
}

// Lances pseudo-legais (ainda podem deixar o próprio rei em xeque)
function pseudoMoves(st) {
  const { board, turn: color } = st;
  const enemy = opp(color);
  const moves = [];
  const add = (fr, fc, tr, tc, extra = {}) => moves.push({
    from: [fr, fc],
    to: [tr, tc],
    piece: board[fr][fc].type,
    captured: extra.ep ? 'p' : (board[tr][tc] ? board[tr][tc].type : null),
    ...extra,
  });

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;

      if (p.type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const lastRow = color === 'w' ? 0 : 7;
        const pawnTo = (tr, tc) => {
          if (tr === lastRow) for (const promo of ['q', 'r', 'b', 'n']) add(r, c, tr, tc, { promotion: promo });
          else add(r, c, tr, tc);
        };
        if (inside(r + dir, c) && !board[r + dir][c]) {
          pawnTo(r + dir, c);
          if (r === startRow && !board[r + 2 * dir][c]) add(r, c, r + 2 * dir, c, { double: true });
        }
        for (const dc of [-1, 1]) {
          const tr = r + dir, tc = c + dc;
          if (!inside(tr, tc)) continue;
          const target = board[tr][tc];
          if (target && target.color === enemy) pawnTo(tr, tc);
          else if (st.ep && st.ep[0] === tr && st.ep[1] === tc) add(r, c, tr, tc, { ep: true });
        }
      } else if (p.type === 'n' || p.type === 'k') {
        for (const [dr, dc] of p.type === 'n' ? KNIGHT_STEPS : KING_STEPS) {
          const tr = r + dr, tc = c + dc;
          if (!inside(tr, tc)) continue;
          const target = board[tr][tc];
          if (!target || target.color === enemy) add(r, c, tr, tc);
        }
        if (p.type === 'k') addCastling(st, r, c, add);
      } else {
        const dirs = p.type === 'r' ? ROOK_DIRS : p.type === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
        for (const [dr, dc] of dirs) {
          let tr = r + dr, tc = c + dc;
          while (inside(tr, tc)) {
            const target = board[tr][tc];
            if (target) {
              if (target.color === enemy) add(r, c, tr, tc);
              break;
            }
            add(r, c, tr, tc);
            tr += dr; tc += dc;
          }
        }
      }
    }
  }
  return moves;
}

// Roque: rei e torre sem ter movido, casas livres, rei fora de xeque
// e sem passar ou chegar em casa atacada.
function addCastling(st, r, c, add) {
  const { board, turn: color } = st;
  const enemy = opp(color);
  const row = color === 'w' ? 7 : 0;
  if (r !== row || c !== 4 || isAttacked(board, row, 4, enemy)) return;
  const isOwnRook = p => p && p.type === 'r' && p.color === color;

  if (st.castling[color + 'K'] && isOwnRook(board[row][7]) &&
      !board[row][5] && !board[row][6] &&
      !isAttacked(board, row, 5, enemy) && !isAttacked(board, row, 6, enemy)) {
    add(r, c, row, 6, { castle: 'K' });
  }
  if (st.castling[color + 'Q'] && isOwnRook(board[row][0]) &&
      !board[row][1] && !board[row][2] && !board[row][3] &&
      !isAttacked(board, row, 3, enemy) && !isAttacked(board, row, 2, enemy)) {
    add(r, c, row, 2, { castle: 'Q' });
  }
}

// Aplica um lance num tabuleiro, retornando um novo tabuleiro
function applyToBoard(board, m) {
  const b = board.map(row => row.slice());
  const [fr, fc] = m.from, [tr, tc] = m.to;
  const piece = b[fr][fc];
  b[fr][fc] = null;
  if (m.ep) b[fr][tc] = null;
  b[tr][tc] = m.promotion ? { type: m.promotion, color: piece.color } : piece;
  if (m.castle === 'K') { b[tr][5] = b[tr][7]; b[tr][7] = null; }
  if (m.castle === 'Q') { b[tr][3] = b[tr][0]; b[tr][0] = null; }
  return b;
}

function legalMoves(st) {
  return pseudoMoves(st).filter(m => {
    const b = applyToBoard(st.board, m);
    const k = findKing(b, st.turn);
    return !isAttacked(b, k[0], k[1], opp(st.turn));
  });
}

function toSAN(m, legal) {
  if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
  const dest = sqName(...m.to);
  if (m.piece === 'p') {
    return (m.captured ? FILES[m.from[1]] + 'x' : '') + dest +
           (m.promotion ? '=' + SAN_LETTER[m.promotion] : '');
  }
  // desambiguação quando duas peças iguais podem ir para a mesma casa
  const rivals = legal.filter(o => o.piece === m.piece && sameSq(o.to, m.to) && !sameSq(o.from, m.from));
  let dis = '';
  if (rivals.length) {
    if (!rivals.some(o => o.from[1] === m.from[1])) dis = FILES[m.from[1]];
    else if (!rivals.some(o => o.from[0] === m.from[0])) dis = String(8 - m.from[0]);
    else dis = sqName(...m.from);
  }
  return SAN_LETTER[m.piece] + dis + (m.captured ? 'x' : '') + dest;
}

// Chave usada para detectar repetição de posição
function positionKey(st, legal) {
  let s = '';
  for (const row of st.board)
    for (const p of row) s += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.';
  const rights = ['wK', 'wQ', 'bK', 'bQ'].filter(k => st.castling[k]).join('');
  // o en passant só diferencia a posição se a captura for realmente possível
  const ep = legal.some(m => m.ep) ? sqName(...st.ep) : '-';
  return `${s} ${st.turn} ${rights} ${ep}`;
}

function insufficientMaterial(board) {
  const minors = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === 'k') continue;
      if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false;
      minors.push({ type: p.type, squareColor: (r + c) % 2 });
    }
  if (minors.length <= 1) return true; // R x R, R+B x R, R+C x R
  // apenas bispos, todos em casas da mesma cor
  return minors.every(m => m.type === 'b' && m.squareColor === minors[0].squareColor);
}

// Retorna um novo estado após o lance `m` (o estado anterior fica intacto)
function nextState(st, m) {
  const color = st.turn;
  let san = toSAN(m, legalMoves(st));
  const ns = {
    ...st,
    board: applyToBoard(st.board, m),
    castling: { ...st.castling },
    captured: { w: [...st.captured.w], b: [...st.captured.b] },
    moves: [...st.moves],
    positions: { ...st.positions },
  };

  if (m.captured) ns.captured[color].push(m.captured);

  // perda do direito de roque
  if (m.piece === 'k') ns.castling[color + 'K'] = ns.castling[color + 'Q'] = false;
  for (const [r, c] of [m.from, m.to]) {
    if (r === 7 && c === 0) ns.castling.wQ = false;
    if (r === 7 && c === 7) ns.castling.wK = false;
    if (r === 0 && c === 0) ns.castling.bQ = false;
    if (r === 0 && c === 7) ns.castling.bK = false;
  }

  ns.ep = m.double ? [(m.from[0] + m.to[0]) / 2, m.from[1]] : null;
  ns.halfmove = (m.piece === 'p' || m.captured) ? 0 : st.halfmove + 1;
  if (color === 'b') ns.fullmove++;
  ns.turn = opp(color);
  ns.lastMove = { from: m.from, to: m.to };

  const legal = legalMoves(ns);
  const check = isInCheck(ns);
  if (check) san += legal.length ? '+' : '#';
  ns.moves.push(san);

  const key = positionKey(ns, legal);
  ns.positions[key] = (ns.positions[key] || 0) + 1;

  ns.result = gameResult(ns, legal, check, key);
  return ns;
}

function gameResult(st, legal, check, key) {
  if (!legal.length) {
    return check
      ? { winner: opp(st.turn), text: `Xeque-mate! ${COLOR_NAME[opp(st.turn)]} vencem.` }
      : { winner: null, text: 'Empate por afogamento.' };
  }
  if (insufficientMaterial(st.board)) return { winner: null, text: 'Empate por material insuficiente.' };
  if (st.positions[key] >= 3) return { winner: null, text: 'Empate por repetição tripla.' };
  if (st.halfmove >= 100) return { winner: null, text: 'Empate pela regra dos 50 lances.' };
  return null;
}

/* =========================================================
   Interface
   ========================================================= */
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const movesEl = document.getElementById('moves');
const barTop = document.getElementById('bar-top');
const barBottom = document.getElementById('bar-bottom');
const promoModal = document.getElementById('promo-modal');
const promoOptions = document.getElementById('promo-options');
const undoBtn = document.getElementById('btn-undo');

let state = newGameState();
let undoStack = [];          // estados anteriores, para desfazer
let selected = null;       // casa selecionada [linha, coluna]
let selectedMoves = [];    // lances legais da peça selecionada
let flipped = false;
let pendingPromotion = null;

function render() {
  boardEl.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const r = flipped ? 7 - i : i;
      const c = flipped ? 7 - j : j;
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      const p = state.board[r][c];
      if (p) {
        const span = document.createElement('span');
        span.className = 'piece ' + p.color;
        span.textContent = glyph(p.type);
        span.draggable = p.color === state.turn && !state.result;
        sq.appendChild(span);
      }
      if (j === 0) sq.insertAdjacentHTML('beforeend', `<span class="coord rank">${8 - r}</span>`);
      if (i === 7) sq.insertAdjacentHTML('beforeend', `<span class="coord file">${FILES[c]}</span>`);
      boardEl.appendChild(sq);
    }
  }
  applyHighlights();
  renderStatus();
  renderMoves();
  renderBars();
  undoBtn.disabled = undoStack.length === 0;
}

function applyHighlights() {
  const check = isInCheck(state) ? findKing(state.board, state.turn) : null;
  for (const sq of boardEl.children) {
    const pos = [+sq.dataset.r, +sq.dataset.c];
    const lm = state.lastMove;
    sq.classList.toggle('last', !!lm && (sameSq(lm.from, pos) || sameSq(lm.to, pos)));
    sq.classList.toggle('selected', !!selected && sameSq(selected, pos));
    sq.classList.toggle('check', !!check && sameSq(check, pos));
    const move = selectedMoves.find(m => sameSq(m.to, pos));
    sq.classList.toggle('target', !!move);
    sq.classList.toggle('capture', !!move && !!move.captured);
  }
}

function renderStatus() {
  statusEl.className = 'status';
  if (state.result) {
    statusEl.textContent = state.result.text;
    statusEl.classList.add('over');
  } else if (isInCheck(state)) {
    statusEl.textContent = `Xeque! Vez das ${COLOR_NAME[state.turn]}.`;
    statusEl.classList.add('check');
  } else {
    statusEl.textContent = `Vez das ${COLOR_NAME[state.turn]}.`;
  }
}

function renderMoves() {
  movesEl.innerHTML = '';
  const last = state.moves.length - 1;
  for (let i = 0; i < state.moves.length; i += 2) {
    const li = document.createElement('li');
    for (const k of [i, i + 1]) {
      if (k > last) break;
      const span = document.createElement('span');
      span.textContent = state.moves[k];
      if (k === last) span.className = 'current';
      li.appendChild(span);
    }
    movesEl.appendChild(li);
  }
  movesEl.scrollTop = movesEl.scrollHeight;
}

function renderBars() {
  let material = 0; // positivo = vantagem das brancas
  for (const row of state.board)
    for (const p of row) if (p) material += (p.color === 'w' ? 1 : -1) * VALUE[p.type];

  const fill = (el, color) => {
    const caps = [...state.captured[color]].sort((a, b) => VALUE[b] - VALUE[a]);
    const adv = color === 'w' ? material : -material;
    el.className = 'player-bar' + (state.turn === color && !state.result ? ' active' : '');
    el.innerHTML = `<span class="name">${COLOR_NAME[color]}</span>
      <span class="captured">${caps.map(glyph).join('')}</span>
      ${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}`;
  };
  fill(barTop, flipped ? 'w' : 'b');
  fill(barBottom, flipped ? 'b' : 'w');
}

function select(pos) {
  selected = pos;
  selectedMoves = pos ? legalMoves(state).filter(m => sameSq(m.from, pos)) : [];
}

// Tenta mover a peça selecionada para `pos`. Retorna true se houve lance.
function tryMoveTo(pos) {
  const candidates = selectedMoves.filter(m => sameSq(m.to, pos));
  if (!candidates.length) return false;
  if (candidates[0].promotion) askPromotion(candidates);
  else play(candidates[0]);
  return true;
}

function play(m) {
  undoStack.push(state);
  state = nextState(state, m);
  select(null);
  render();
}

function onSquareClick(pos) {
  if (state.result || pendingPromotion) return;
  if (selected && sameSq(selected, pos)) { select(null); render(); return; }
  if (selected && tryMoveTo(pos)) return;
  const p = state.board[pos[0]][pos[1]];
  select(p && p.color === state.turn ? pos : null);
  applyHighlights();
}

function askPromotion(candidates) {
  pendingPromotion = candidates;
  promoOptions.innerHTML = '';
  for (const type of ['q', 'r', 'b', 'n']) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="piece ${state.turn}">${glyph(type)}</span>`;
    btn.onclick = () => {
      closePromotion();
      play(candidates.find(m => m.promotion === type));
    };
    promoOptions.appendChild(btn);
  }
  promoModal.hidden = false;
}

function closePromotion() {
  pendingPromotion = null;
  promoModal.hidden = true;
}

const squareFromEvent = e => {
  const sq = e.target.closest('.square');
  return sq ? [+sq.dataset.r, +sq.dataset.c] : null;
};

/* ---------- Eventos ---------- */
boardEl.addEventListener('click', e => {
  const pos = squareFromEvent(e);
  if (pos) onSquareClick(pos);
});

boardEl.addEventListener('dragstart', e => {
  const pos = squareFromEvent(e);
  if (!pos || state.result || pendingPromotion) { e.preventDefault(); return; }
  select(pos);
  applyHighlights();
  e.dataTransfer.effectAllowed = 'move';
});
boardEl.addEventListener('dragover', e => e.preventDefault());
boardEl.addEventListener('drop', e => {
  e.preventDefault();
  const pos = squareFromEvent(e);
  if (pos && selected && !sameSq(pos, selected) && tryMoveTo(pos)) return;
  if (!pos || !sameSq(pos, selected)) select(null);
  applyHighlights();
});

promoModal.addEventListener('click', e => {
  if (e.target === promoModal) { closePromotion(); select(null); applyHighlights(); }
});

document.getElementById('btn-new').onclick = () => {
  if (state.moves.length && !state.result && !confirm('Começar um novo jogo?')) return;
  closePromotion();
  state = newGameState();
  undoStack = [];
  select(null);
  render();
};

undoBtn.onclick = () => {
  if (!undoStack.length) return;
  closePromotion();
  state = undoStack.pop();
  select(null);
  render();
};

document.getElementById('btn-flip').onclick = () => {
  flipped = !flipped;
  render();
};

render();
