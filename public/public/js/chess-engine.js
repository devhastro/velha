/**
 * Motor de xadrez simplificado: movimentos legais, xeque, xeque-mate e empate por afogamento.
 */
(function (global) {
  const FILES = "abcdefgh";

  const PIECE_UNICODE = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  };

  function initialBoard() {
    const rows = [
      "rnbqkbnr",
      "pppppppp",
      "........",
      "........",
      "........",
      "........",
      "PPPPPPPP",
      "RNBQKBNR",
    ];
    return rows.map((row, r) =>
      row.split("").map((ch, c) => {
        if (ch === ".") return null;
        const color = ch === ch.toUpperCase() ? "w" : "b";
        return { type: ch.toLowerCase(), color };
      })
    );
  }

  function cloneBoard(board) {
    return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function opponent(color) {
    return color === "w" ? "b" : "w";
  }

  function findKing(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.color === color && p.type === "k") return { r, c };
      }
    }
    return null;
  }

  function isSquareAttacked(board, r, c, byColor) {
    const dirs = {
      n: [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ],
      b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
      r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    };
    const knight = dirs.n;
    for (const [dr, dc] of knight) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === "n") return true;
    }
    for (const [dr, dc] of dirs.b) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        const p = board[nr][nc];
        if (!p) continue;
        if (p.color === byColor && (p.type === "b" || p.type === "q")) return true;
        break;
      }
    }
    for (const [dr, dc] of dirs.r) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        const p = board[nr][nc];
        if (!p) continue;
        if (p.color === byColor && (p.type === "r" || p.type === "q")) return true;
        break;
      }
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const p = board[nr][nc];
        if (p && p.color === byColor && p.type === "k") return true;
      }
    }
    const pawnDir = byColor === "w" ? 1 : -1;
    for (const dc of [-1, 1]) {
      const nr = r + pawnDir;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === "p") return true;
    }
    return false;
  }

  function isInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) return false;
    return isSquareAttacked(board, king.r, king.c, opponent(color));
  }

  function applyMove(board, from, to, promotion) {
    const next = cloneBoard(board);
    const piece = next[from.r][from.c];
    if (!piece) return next;
    next[to.r][to.c] = piece;
    next[from.r][from.c] = null;
    if (piece.type === "p" && (to.r === 0 || to.r === 7)) {
      next[to.r][to.c] = { type: promotion || "q", color: piece.color };
    }
    return next;
  }

  function rayMoves(board, r, c, deltas, color) {
    const moves = [];
    for (const [dr, dc] of deltas) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        const target = board[nr][nc];
        if (!target) {
          moves.push({ from: { r, c }, to: { r: nr, c: nc } });
        } else {
          if (target.color !== color) moves.push({ from: { r, c }, to: { r: nr, c: nc } });
          break;
        }
      }
    }
    return moves;
  }

  function pseudoLegalMoves(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const { type, color } = piece;
    const moves = [];
    const add = (tr, tc) => {
      if (!inBounds(tr, tc)) return;
      const target = board[tr][tc];
      if (!target || target.color !== color) moves.push({ from: { r, c }, to: { r: tr, c: tc } });
    };

    if (type === "n") {
      for (const [dr, dc] of [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ]) add(r + dr, c + dc);
      return moves;
    }

    if (type === "k") {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          add(r + dr, c + dc);
        }
      }
      return moves;
    }

    if (type === "p") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const one = r + dir;
      if (inBounds(one, c) && !board[one][c]) {
        moves.push({ from: { r, c }, to: { r: one, c } });
        const two = r + dir * 2;
        if (r === startRow && !board[two][c]) moves.push({ from: { r, c }, to: { r: two, c } });
      }
      for (const dc of [-1, 1]) {
        const tr = r + dir;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = board[tr][tc];
        if (target && target.color !== color) moves.push({ from: { r, c }, to: { r: tr, c: tc } });
      }
      return moves;
    }

    if (type === "b" || type === "q") {
      moves.push(...rayMoves(board, r, c, [[-1, -1], [-1, 1], [1, -1], [1, 1]], color));
    }
    if (type === "r" || type === "q") {
      moves.push(...rayMoves(board, r, c, [[-1, 0], [1, 0], [0, -1], [0, 1]], color));
    }
    return moves;
  }

  function legalMoves(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    return pseudoLegalMoves(board, r, c).filter((m) => {
      const next = applyMove(board, m.from, m.to);
      return !isInCheck(next, piece.color);
    });
  }

  function allLegalMoves(board, color) {
    const list = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || p.color !== color) continue;
        for (const m of legalMoves(board, r, c)) list.push(m);
      }
    }
    return list;
  }

  function gameStatus(board, turn) {
    const moves = allLegalMoves(board, turn);
    const check = isInCheck(board, turn);
    if (moves.length) return { over: false, check, moves };
    if (check) return { over: true, result: "checkmate", winner: opponent(turn), check: true, moves: [] };
    return { over: true, result: "stalemate", check: false, moves: [] };
  }

  function squareLabel(r, c) {
    return FILES[c] + (8 - r);
  }

  function formatMove(board, move) {
    const piece = board[move.from.r][move.from.c];
    const sym = piece ? piece.type.toUpperCase() : "?";
    return sym + squareLabel(move.from.r, move.from.c) + "→" + squareLabel(move.to.r, move.to.c);
  }

  function pieceChar(piece) {
    if (!piece) return "";
    return PIECE_UNICODE[piece.color][piece.type] || "?";
  }

  global.ChessEngine = {
    initialBoard,
    cloneBoard,
    legalMoves,
    allLegalMoves,
    applyMove,
    isInCheck,
    gameStatus,
    squareLabel,
    formatMove,
    pieceChar,
    opponent,
  };
})(typeof window !== "undefined" ? window : global);
