const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const newGameBtn = document.getElementById('newGameBtn');
const trayEl = document.getElementById('piecesTray');
const themeSelect = document.getElementById('themeSelect');
const BOARD_SIZE = 8;
const CELL_SIZE = 40;
const THEMES = ['default', 'sunset', 'ocean', 'lime', 'dark'];
const THEME_PALETTES = {
  default: ['#ff6b6b', '#ffd166', '#4ecdc4', '#5dade2', '#b084f5', '#f7a072', '#7ee081', '#f496d0'],
  sunset: ['#ff6b6b', '#ff9f68', '#ffd166', '#e86a92', '#c77dff', '#ff7f50', '#f28482', '#f6bd60'],
  ocean: ['#38e8d0', '#5dade2', '#70d6ff', '#48bfe3', '#80ffdb', '#56cfe1', '#64dfdf', '#5390d9'],
  lime: ['#d8ff70', '#b7ef5a', '#7ee081', '#caffbf', '#a7c957', '#f2e96b', '#90be6d', '#d9ed92'],
  dark: ['#7c9cff', '#ffb86b', '#72e6c5', '#ff7aa8', '#c4a7ff', '#f2e96b', '#76d6ff', '#ff8f70'],
};
const COLORS = THEME_PALETTES.default;
const PIECES = [[[1]], [[1,1]], [[1],[1]], [[1,1],[1,0]], [[1,1],[0,1]], [[1,1,1]], [[1],[1],[1]], [[1,1],[1,1]], [[1,1,1],[0,1,0]], [[1,1,1],[1,0,0]], [[1,1,1],[0,0,1]], [[1,1],[1,0],[1,0]], [[1,1,1],[0,1,0],[0,1,0]], [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]]];
let board = createBoard();
let tray = [];
let selectedPieceIndex = null;
let draggedPieceIndex = null;
let dragState = { active:false, pieceIndex:null };
let dragGhost = null;
let dragFloat = null;
let score = 0;
let themeIndex = 0;
let themeMode = 'auto';
let gameOver = false;
let placementEffects = [];
let breakEffects = [];
let effectFrameActive = false;
let helpfulPieceCooldown = 0;
const HELPFUL_PIECE_CHANCE = 0.58;
const THEME_SCORE_STEP = 200;
let pointerDragStarted = false;
function createBoard() { return Array.from({length:BOARD_SIZE}, () => Array(BOARD_SIZE).fill(null)); }
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

function colorIndex(color) {
  const allColors = Object.values(THEME_PALETTES).flat();
  const index = allColors.indexOf(color);
  if (index >= 0) return index % COLORS.length;
  return [...color].reduce((total, character) => total + character.charCodeAt(0), 0) % COLORS.length;
}

function recolorAllBlocks(palette) {
  board = board.map((row) => row.map((color) => color ? palette[colorIndex(color)] : null));
  tray.forEach((piece) => { piece.color = palette[colorIndex(piece.color)]; });
  placementEffects.forEach((effect) => { effect.color = palette[colorIndex(effect.color)]; });
}
function randomPiece() { return { color:randomColor(), matrix:PIECES[Math.floor(Math.random() * PIECES.length)].map((row) => [...row]) }; }
function applyTheme(nextIndex, announce = false) {
  themeIndex = nextIndex % THEMES.length;
  document.body.dataset.theme = THEMES[themeIndex];
  if (themeSelect) themeSelect.value = themeMode === 'auto' ? 'auto' : THEMES[themeIndex];
  recolorAllBlocks(THEME_PALETTES[THEMES[themeIndex]]);
  if (trayEl) renderTray();
  if (ctx) drawBoard();
  if (!announce) return;
  const flash = document.createElement('div');
  flash.className = 'theme-flash';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove(), { once:true });
}
function updateScore() {
  const nextThemeIndex = Math.floor(score / THEME_SCORE_STEP) % THEMES.length;
  scoreEl.textContent = String(score);
  scoreEl.style.animation = 'none';
  void scoreEl.offsetWidth;
  scoreEl.style.animation = 'scorePop .25s ease';
  if (themeMode === 'auto' && nextThemeIndex !== themeIndex) applyTheme(nextThemeIndex, score > 0);
}
function resetGame() {
  board = createBoard(); tray = []; selectedPieceIndex = null; draggedPieceIndex = null;
  dragState = { active:false, pieceIndex:null }; dragGhost = null; removeDragFloat(); score = 0; themeMode = 'auto'; gameOver = false; placementEffects = []; breakEffects = []; helpfulPieceCooldown = 0;
  applyTheme(0); fillTray(); renderTray(); updateScore(); drawBoard();
}
function pieceFitsSomewhere(piece) {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (canPlace(piece, x, y)) return true;
    }
  }
  return false;
}

function scorePieceHelpfulness(piece) {
  let bestScore = -1;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!canPlace(piece, x, y)) continue;
      let value = 0;
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        let filled = 0;
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          filled += board[row][col] ? 1 : 0;
          if (row >= y && row < y + piece.matrix.length && col >= x && col < x + piece.matrix[0].length && piece.matrix[row - y]?.[col - x]) filled += 1;
        }
        if (filled >= BOARD_SIZE - 1) value += 20;
      }
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        let filled = 0;
        for (let row = 0; row < BOARD_SIZE; row += 1) {
          filled += board[row][col] ? 1 : 0;
          if (col >= x && col < x + piece.matrix[0].length && row >= y && row < y + piece.matrix.length && piece.matrix[row - y]?.[col - x]) filled += 1;
        }
        if (filled >= BOARD_SIZE - 1) value += 20;
      }
      value -= piece.matrix.flat().filter(Boolean).length * 0.2;
      bestScore = Math.max(bestScore, value);
    }
  }
  return bestScore;
}

function createAdaptivePiece() {
  const candidates = Array.from({ length: 5 }, () => randomPiece());
  const boardHasBlocks = board.some((row) => row.some(Boolean));
  const shouldHelp = boardHasBlocks && helpfulPieceCooldown <= 0 && Math.random() < HELPFUL_PIECE_CHANCE;
  if (!shouldHelp) return candidates[0];

  helpfulPieceCooldown = 3;
  const ranked = candidates
    .filter(pieceFitsSomewhere)
    .sort((first, second) => scorePieceHelpfulness(second) - scorePieceHelpfulness(first));
  return ranked[Math.floor(Math.random() * Math.min(ranked.length, 3))] || candidates[0];
}

function fillTray() {
  while (tray.length < 3) {
    tray.push(createAdaptivePiece());
    if (helpfulPieceCooldown > 0) helpfulPieceCooldown -= 1;
  }
}
function getCenteredPieceSize(piece) { return Math.max(piece.matrix[0].length, piece.matrix.length, 3); }
function renderTray() {
  trayEl.innerHTML = '';
  tray.forEach((piece, index) => {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'piece-item';
    if (selectedPieceIndex === index) item.classList.add('selected');
    const grid = document.createElement('div'); grid.className = 'piece-grid';
    const pieceSize = getCenteredPieceSize(piece); grid.style.gridTemplateColumns = `repeat(${pieceSize},12px)`; grid.style.gridTemplateRows = `repeat(${pieceSize},12px)`;
    const offsetX = Math.floor((pieceSize - piece.matrix[0].length) / 2); const offsetY = Math.floor((pieceSize - piece.matrix.length) / 2);
    for (let y = 0; y < pieceSize; y += 1) for (let x = 0; x < pieceSize; x += 1) {
      const cell = document.createElement('div'); cell.className = 'piece-cell';
      const isFilled = piece.matrix[y - offsetY]?.[x - offsetX] === 1;
      cell.style.background = isFilled ? piece.color : 'rgba(255,255,255,.02)';
      if (isFilled) cell.style.boxShadow = `0 0 10px ${piece.color}`;
      grid.appendChild(cell);
    }
    item.draggable = true; item.appendChild(grid);
    item.addEventListener('pointerdown', (event) => {
      if (gameOver) return;
      draggedPieceIndex = index;
      selectedPieceIndex = index;
      dragState = {active:true, pieceIndex:index, pointerId:event.pointerId};
      pointerDragStarted = true;
      if (event.pointerType === 'touch') item.draggable = false;
      item.classList.add('dragging');
      item.setPointerCapture?.(event.pointerId);
      createDragFloat(item, event.clientX, event.clientY);
      updateDragGhost(event.clientX, event.clientY);
      event.preventDefault();
    });
    item.addEventListener('dragstart', (event) => { draggedPieceIndex = index; selectedPieceIndex = index; item.classList.add('dragging'); if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); } });
    item.addEventListener('dragend', () => { draggedPieceIndex = null; dragState.active = false; dragGhost = null; removeDragFloat(); item.classList.remove('dragging'); });
    item.addEventListener('click', () => { if (!gameOver) { selectedPieceIndex = selectedPieceIndex === index ? null : index; renderTray(); } });
    trayEl.appendChild(item);
  });
}
function canPlace(piece, originX, originY) {
  for (let y = 0; y < piece.matrix.length; y += 1) for (let x = 0; x < piece.matrix[y].length; x += 1) {
    if (!piece.matrix[y][x]) continue; const cellX = originX + x; const cellY = originY + y;
    if (cellX < 0 || cellY < 0 || cellX >= BOARD_SIZE || cellY >= BOARD_SIZE || board[cellY][cellX] !== null) return false;
  }
  return true;
}
function placePieceOnBoard(piece, originX, originY) {
  for (let y = 0; y < piece.matrix.length; y += 1) for (let x = 0; x < piece.matrix[y].length; x += 1) {
    if (!piece.matrix[y][x]) continue; const cellX = originX + x; const cellY = originY + y; board[cellY][cellX] = piece.color; placementEffects.push({x:cellX,y:cellY,color:piece.color,life:1,scale:.6});
  }
  processClears();
}
function processClears() {
  const fullRows = []; const fullColumns = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) if (board[y].every(Boolean)) fullRows.push(y);
  for (let x = 0; x < BOARD_SIZE; x += 1) if (board.every((row) => row[x] !== null)) fullColumns.push(x);
  const cleared = fullRows.length > 0 || fullColumns.length > 0;
  if (cleared) {
    fullRows.forEach((row) => { for (let x = 0; x < BOARD_SIZE; x += 1) board[row][x] = null; });
    fullColumns.forEach((col) => { for (let y = 0; y < BOARD_SIZE; y += 1) board[y][col] = null; });
    score += (fullRows.length + fullColumns.length) * 250;
    fullRows.forEach((row) => createBreakEffect(BOARD_SIZE * CELL_SIZE / 2, row * CELL_SIZE + CELL_SIZE / 2, 'row'));
    fullColumns.forEach((col) => createBreakEffect(col * CELL_SIZE + CELL_SIZE / 2, BOARD_SIZE * CELL_SIZE / 2, 'column'));
  } else if (selectedPieceIndex !== null) score += 5;
  updateScore();
}

function createBreakEffect(centerX, centerY, direction) {
  const particles = Array.from({ length: 18 }, (_, index) => {
    const angle = direction === 'row' ? (index / 18 - 0.5) * Math.PI : index / 18 * Math.PI * 2;
    const speed = 1.2 + Math.random() * 2.4;
    return { x:centerX, y:centerY, vx:Math.cos(angle) * speed, vy:Math.sin(angle) * speed, life:1, size:2 + Math.random() * 3, color:Math.random() > 0.35 ? '#ffffff' : '#ffd166' };
  });
  breakEffects.push({ x:centerX, y:centerY, life:1, radius:8, direction, particles });
  const gameWrap = document.querySelector('.game-wrap');
  gameWrap.classList.remove('impact');
  void gameWrap.offsetWidth;
  gameWrap.classList.add('impact');
  gameWrap.addEventListener('animationend', () => gameWrap.classList.remove('impact'), { once:true });
}
function placeSelectedPieceAt(x, y, pieceIndex = selectedPieceIndex) {
  if (pieceIndex === null || gameOver) return; const piece = tray[pieceIndex]; if (!piece) return;
  const originX = Math.round(x / CELL_SIZE - piece.matrix[0].length / 2); const originY = Math.round(y / CELL_SIZE - piece.matrix.length / 2);
  if (!canPlace(piece, originX, originY)) return; placePieceOnBoard(piece, originX, originY); tray.splice(pieceIndex, 1); fillTray(); selectedPieceIndex = null; draggedPieceIndex = null; renderTray(); drawBoard();
}

function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function createDragFloat(item, clientX, clientY) {
  removeDragFloat();
  dragFloat = item.cloneNode(true);
  dragFloat.className = 'drag-float';
  dragFloat.setAttribute('aria-hidden', 'true');
  dragFloat.style.left = `${clientX}px`;
  dragFloat.style.top = `${clientY - 92}px`;
  document.body.appendChild(dragFloat);
}

function updateDragFloat(clientX, clientY) {
  if (!dragFloat) return;
  dragFloat.style.left = `${clientX}px`;
  dragFloat.style.top = `${clientY - 92}px`;
}

function removeDragFloat() {
  dragFloat?.remove();
  dragFloat = null;
}

function updateDragGhost(clientX, clientY) {
  if (!dragState.active || dragState.pieceIndex === null) { dragGhost = null; return; }
  const point = getCanvasPoint(clientX, clientY); const piece = tray[dragState.pieceIndex];
  if (!piece) { dragGhost = null; return; }
  const originX = Math.round(point.x / CELL_SIZE - piece.matrix[0].length / 2); const originY = Math.round(point.y / CELL_SIZE - piece.matrix.length / 2); dragGhost = {piece,originX,originY,valid:canPlace(piece,originX,originY)};
}
function drawDragGhost() {
  if (!dragGhost) return; const {piece,originX,originY,valid} = dragGhost; ctx.globalAlpha = valid ? .5 : .28;
  for (let y = 0; y < piece.matrix.length; y += 1) for (let x = 0; x < piece.matrix[y].length; x += 1) {
    if (!piece.matrix[y][x]) continue; const px = originX + x; const py = originY + y; if (px < 0 || py < 0 || px >= BOARD_SIZE || py >= BOARD_SIZE) continue;
    const ghostX = px * CELL_SIZE + 3;
    const ghostY = py * CELL_SIZE + 3;
    const ghostGradient = ctx.createLinearGradient(ghostX, ghostY, ghostX + CELL_SIZE - 6, ghostY + CELL_SIZE - 6);
    ghostGradient.addColorStop(0, valid ? '#ffffff' : '#ffb0b0');
    ghostGradient.addColorStop(0.16, valid ? piece.color : '#ff6b6b');
    ghostGradient.addColorStop(1, '#000000');
    ctx.fillStyle = ghostGradient;
    ctx.beginPath();
    ctx.roundRect(ghostX, ghostY, CELL_SIZE - 6, CELL_SIZE - 6, 8);
    ctx.fill();
    ctx.strokeStyle = valid ? 'rgba(255,255,255,.78)' : '#ff6b6b';
    ctx.strokeRect(ghostX + 1, ghostY + 1, CELL_SIZE - 8, CELL_SIZE - 8);
  }
  ctx.globalAlpha = 1;
}
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < BOARD_SIZE; y += 1) for (let x = 0; x < BOARD_SIZE; x += 1) {
    const cellX = x * CELL_SIZE + 3;
    const cellY = y * CELL_SIZE + 3;
    const cellSize = CELL_SIZE - 6;
    const color = board[y][x];
    if (color) {
      const gradient = ctx.createLinearGradient(cellX, cellY, cellX + cellSize, cellY + cellSize);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.12, color);
      gradient.addColorStop(1, '#000000');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.92;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.roundRect(cellX, cellY, cellSize, cellSize, 8);
    ctx.fill();
    ctx.globalAlpha = color ? 0.34 : 0.72;
    ctx.strokeStyle = color ? '#ffffff' : 'rgba(126, 143, 164, .48)';
    ctx.lineWidth = color ? 1.5 : 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawDragGhost(); placementEffects = placementEffects.filter((effect) => effect.life > 0);
  placementEffects.forEach((effect) => { const alpha = Math.max(0,effect.life); const size = (CELL_SIZE - 8) * effect.scale; const px = effect.x * CELL_SIZE + (CELL_SIZE - size) / 2; const py = effect.y * CELL_SIZE + (CELL_SIZE - size) / 2; ctx.fillStyle = effect.color; ctx.globalAlpha = alpha * .45; ctx.fillRect(px,py,size,size); ctx.globalAlpha = alpha; ctx.strokeStyle = '#fff'; ctx.strokeRect(px + 3,py + 3,size - 6,size - 6); effect.life -= .08; effect.scale += (1 - effect.scale) * .2; });
  breakEffects = breakEffects.filter((effect) => effect.life > 0);
  breakEffects.forEach((effect) => {
    const easedLife = effect.life * effect.life;
    ctx.globalAlpha = easedLife * 0.8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 + effect.life * 2;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    ctx.stroke();
    effect.particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.035;
      particle.life -= 0.045;
      ctx.globalAlpha = Math.max(0, particle.life) * 0.9;
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.shadowBlur = 0;
    effect.radius += 4.5;
    effect.life -= 0.055;
  });
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  if ((placementEffects.length || breakEffects.length) && !effectFrameActive) { effectFrameActive = true; requestAnimationFrame(() => { effectFrameActive = false; drawBoard(); }); }
}
canvas.addEventListener('dragover', (event) => event.preventDefault());
canvas.addEventListener('drop', (event) => { event.preventDefault(); const point = getCanvasPoint(event.clientX, event.clientY); const pieceIndex = Number(event.dataTransfer.getData('text/plain')); placeSelectedPieceAt(point.x, point.y, Number.isInteger(pieceIndex) ? pieceIndex : selectedPieceIndex); dragState.active = false; dragGhost = null; removeDragFloat(); });
window.addEventListener('pointermove', (event) => { if (!dragState.active) return; updateDragFloat(event.clientX, event.clientY); updateDragGhost(event.clientX,event.clientY); drawBoard(); });
function finishPointerDrag(clientX, clientY) {
  if (!dragState.active) return;
  const rect = canvas.getBoundingClientRect();
  const insideCanvas = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  if (insideCanvas) {
    const point = getCanvasPoint(clientX, clientY);
    placeSelectedPieceAt(point.x, point.y, dragState.pieceIndex);
  }
  dragState.active = false;
  pointerDragStarted = false;
  dragGhost = null;
  removeDragFloat();
  drawBoard();
}
canvas.addEventListener('pointerup', (event) => finishPointerDrag(event.clientX, event.clientY));
window.addEventListener('pointerup', (event) => finishPointerDrag(event.clientX, event.clientY));
canvas.addEventListener('click', (event) => { if (selectedPieceIndex === null) return; const point = getCanvasPoint(event.clientX, event.clientY); placeSelectedPieceAt(point.x, point.y); });
newGameBtn.addEventListener('click', resetGame);
themeSelect.addEventListener('change', (event) => {
  if (event.target.value === 'auto') {
    themeMode = 'auto';
    applyTheme(Math.floor(score / THEME_SCORE_STEP) % THEMES.length, false);
    return;
  }
  const selectedTheme = THEMES.indexOf(event.target.value);
  if (selectedTheme >= 0) {
    themeMode = 'manual';
    applyTheme(selectedTheme, true);
  }
});
resetGame();
