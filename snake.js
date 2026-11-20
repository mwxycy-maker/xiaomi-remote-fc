(() => {
  "use strict";

  const { preset, eventId } = window.XiaomiRemoteKeys;
  const $ = (id) => document.getElementById(id);
  const canvas = $("board");
  const context = canvas.getContext("2d");
  const screen = $("screen-card");
  const screenAction = $("screen-action");
  const pauseAction = $("pause-action");
  const directionButtons = [...document.querySelectorAll("[data-turn]")];
  const cell = 20;
  const columns = canvas.width / cell;
  const rows = canvas.height / cell;
  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const keyTurns = new Map([
    [preset.up, "up"], [preset.down, "down"], [preset.left, "left"], [preset.right, "right"],
    ["KeyW", "up"], ["KeyS", "down"], ["KeyA", "left"], ["KeyD", "right"],
  ]);
  const bestKey = "night-orchard-best-v1";
  const sameCell = (a, b) => a.x === b.x && a.y === b.y;

  let state = "ready";
  let snake = [];
  let heading = "right";
  let turns = [];
  let apple = null;
  let score = 0;
  let best = readBest();
  let timer = null;

  function readBest() {
    try {
      const value = Number(localStorage.getItem(bestKey));
      return Number.isInteger(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function updateScore() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(bestKey, String(best)); }
      catch { /* The record remains available in this session. */ }
    }
    $("score").textContent = String(score).padStart(2, "0");
    $("best").textContent = String(best).padStart(2, "0");
  }

  function drawBackground() {
    context.fillStyle = "#35304a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        context.fillStyle = (x + y) % 2 ? "#39314d" : "#3c3451";
        context.fillRect(x * cell + 1, y * cell + 1, cell - 1, cell - 1);
      }
    }
  }

  function drawApple(x, y, scale = 1) {
    context.save();
    context.translate(x * cell + cell / 2, y * cell + cell / 2);
    context.scale(scale, scale);
    context.fillStyle = "#262039";
    context.fillRect(-7, -3, 16, 12);
    context.fillStyle = "#ff8c93";
    context.fillRect(-7, -5, 14, 12);
    context.fillRect(-5, -7, 4, 14);
    context.fillRect(2, -7, 4, 14);
    context.fillRect(-5, 6, 10, 2);
    context.fillStyle = "#e0ed89";
    context.fillRect(1, -11, 5, 3);
    context.fillStyle = "#ffd3b2";
    context.fillRect(-5, -4, 3, 4);
    context.restore();
  }

  function drawSnake(segments, direction) {
    for (let index = segments.length - 1; index >= 0; index--) {
      const { x, y } = segments[index];
      const next = segments[index + 1];
      const px = x * cell;
      const py = y * cell;
      context.fillStyle = index === 0 ? "#b4f6cb" : (index % 2 ? "#81d4ac" : "#91e1b8");
      context.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      if (next) {
        if (x !== next.x) context.fillRect(Math.max(x, next.x) * cell - 1, py + 4, 2, cell - 8);
        else context.fillRect(px + 4, Math.max(y, next.y) * cell - 1, cell - 8, 2);
      }
      if (index > 0) {
        context.fillStyle = "#5fb698";
        context.fillRect(px + 5, py + 5, 2, 2);
        context.fillRect(px + 9, py + 11, 2, 2);
      }
    }
    const head = segments[0];
    const vector = directions[direction];
    const eyeX = head.x * cell + cell / 2 + vector.x * 5;
    const eyeY = head.y * cell + cell / 2 + vector.y * 5;
    context.fillStyle = "#262239";
    for (const side of [-4, 4]) {
      context.fillRect(eyeX + vector.y * side - 1, eyeY + vector.x * side - 1, 3, 3);
    }
  }

  function drawReadyScene() {
    const trail = [
      [17, 5], [16, 5], [15, 5], [14, 5], [13, 5], [13, 4], [13, 3], [13, 2],
      [12, 2], [11, 2], [10, 2], [9, 2], [8, 2], [8, 3], [8, 4], [8, 5],
      [7, 5], [6, 5], [5, 5], [4, 5], [3, 5],
    ];
    context.save();
    context.translate(-15, 5);
    context.scale(1.19, 1.19);
    drawSnake(trail.map(([x, y]) => ({ x, y })), "right");
    drawApple(19, 5, 1.5);
    context.restore();
    context.fillStyle = "#ab9ac9";
    for (const [x, y] of [[64, 46], [330, 53], [406, 60], [333, 226], [405, 258], [95, 175]]) {
      context.fillRect(x - 2, y, 6, 2);
      context.fillRect(x, y - 2, 2, 6);
    }
  }

  function draw() {
    drawBackground();
    if (state === "ready") {
      drawReadyScene();
    } else {
      if (apple) drawApple(apple.x, apple.y);
      drawSnake(snake, heading);
    }
    for (const button of directionButtons) {
      button.classList.toggle("is-heading", state === "playing" && button.dataset.turn === heading);
    }
  }

  function updateScreen() {
    const labels = {
      ready: ["夜行果园", "吃苹果，别撞墙。", "开始游戏", "等待开始"],
      playing: ["", "", "", "游戏进行中"],
      paused: ["已暂停", "按菜单键继续。", "继续游戏", "已暂停"],
      lost: ["游戏结束", `这局吃到了 ${score} 个苹果。`, "再玩一局", "游戏结束"],
      won: ["果园吃完了！", `你吃到了 ${score} 个苹果。`, "再玩一局", "游戏完成"],
    };
    const [title, copy, action, status] = labels[state];
    screen.hidden = state === "playing";
    screen.dataset.screen = state;
    $("screen-title").textContent = title;
    $("screen-copy").textContent = copy;
    screenAction.textContent = action;
    $("game-status").textContent = status;
    pauseAction.disabled = state !== "playing" && state !== "paused";
    pauseAction.textContent = state === "paused" ? "继续" : "暂停";
    draw();
  }

  function nextApple() {
    const empty = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const point = { x, y };
        if (!snake.some((part) => sameCell(part, point))) empty.push(point);
      }
    }
    return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null;
  }

  function start(direction = "right") {
    clearTimeout(timer);
    const centerX = Math.floor(columns / 2);
    const centerY = Math.floor(rows / 2);
    const { x, y } = directions[direction];
    snake = [0, 1, 2, 3].map((offset) => ({ x: centerX - x * offset, y: centerY - y * offset }));
    apple = { x: centerX + x * 4, y: centerY + y * 4 };
    heading = direction;
    turns = [];
    score = 0;
    state = "playing";
    updateScore();
    updateScreen();
    scheduleTick();
  }

  function scheduleTick() {
    const delay = Math.max(75, 160 - Math.floor(score / 3) * 10);
    timer = setTimeout(tick, delay);
  }

  function finish(result) {
    state = result;
    updateScreen();
  }

  function tick() {
    if (state !== "playing") return;
    heading = turns.shift() || heading;
    const { x, y } = directions[heading];
    const previousHead = snake[0];
    const head = { x: previousHead.x + x, y: previousHead.y + y };
    const inside = head.x >= 0 && head.x < columns && head.y >= 0 && head.y < rows;
    const eating = apple && sameCell(head, apple);
    // The tail vacates its cell on this tick unless the snake grows.
    const collision = snake.some((part, i) => (eating || i < snake.length - 1) && sameCell(head, part));
    if (!inside || collision) {
      finish("lost");
      return;
    }
    snake.unshift(head);
    if (eating) {
      score++;
      updateScore();
      apple = nextApple();
      if (!apple) {
        finish("won");
        return;
      }
    } else {
      snake.pop();
    }
    draw();
    scheduleTick();
  }

  function turn(direction) {
    if (state === "ready") {
      start(direction);
      return;
    }
    if (state !== "playing" || turns.length >= 2) return;
    const lastDirection = directions[turns.at(-1) || heading];
    const nextDirection = directions[direction];
    if (lastDirection.x === nextDirection.x || lastDirection.y === nextDirection.y) {
      // Same direction or a direct reversal.
      return;
    }
    turns.push(direction);
  }

  function pause() {
    if (state !== "playing") return;
    clearTimeout(timer);
    turns = [];
    state = "paused";
    updateScreen();
  }

  function resume() {
    state = "playing";
    updateScreen();
    scheduleTick();
  }

  function togglePause() {
    if (state === "paused") resume();
    else pause();
  }

  function playAction() {
    if (state === "paused") resume();
    else if (state !== "playing") start();
  }

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const id = eventId(event);
    const turnDirection = keyTurns.get(id);
    const playKey = id === preset.a || id === preset.start || id === "Enter";
    const pauseKey = id === preset.b || id === "Escape";
    const space = id === "Space";
    if (!turnDirection && !playKey && !pauseKey && !space) return;
    if ((space || id === "Enter") && event.target.closest?.("a, button")) return;
    event.preventDefault();
    if (event.repeat) return;
    if (turnDirection) turn(turnDirection);
    else if (playKey) playAction();
    else if (pauseKey || state === "playing") togglePause();
    else playAction();
  });

  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  screenAction.addEventListener("click", playAction);
  pauseAction.addEventListener("click", togglePause);
  for (const button of directionButtons) {
    button.addEventListener("click", () => turn(button.dataset.turn));
  }
  updateScore();
  updateScreen();
})();
