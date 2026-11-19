(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const labels = {
    up: "↑ 上", down: "↓ 下", left: "← 左", right: "→ 右",
    a: "A · TV 键", b: "B · 菜单键", start: "START", select: "SELECT",
  };
  const actions = Object.keys(labels);
  const screenWrap = $("screen-wrap");
  const emptyScreen = $("empty-screen");
  const dropOverlay = $("drop-overlay");
  const status = $("game-status");
  const message = $("message");
  const pauseButton = $("pause-button");
  const resetButton = $("reset-button");
  const muteButton = $("mute-button");
  const fullButton = $("full-button");
  const romFile = $("rom-file");
  let loaded = false;
  let paused = false;
  let muted = false;
  let romName = "";

  function say(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
  }

  function warn(text) {
    $("input-warning").textContent = text;
  }

  function renderMapping(mapping) {
    $("mapping-grid").replaceChildren(...actions.map((action) => {
      const item = document.createElement("div");
      item.className = `mapping-item${mapping[action] ? " done" : ""}`;
      const name = document.createElement("strong");
      name.textContent = labels[action];
      const code = document.createElement("small");
      code.textContent = mapping[action] || "未设置";
      item.append(name, code);
      return item;
    }));
  }

  function showCalibration(state) {
    $("calibration-prompt").hidden = !state.active;
    $("calibrate-button").hidden = state.active;
    $("cancel-button").hidden = !state.active;
    $("skip-button").hidden = !state.active || state.index < 6;
    $("clear-button").hidden = state.active;
    if (state.active) {
      $("calibration-count").textContent = `${state.index + 1} / ${state.total}`;
      $("calibration-action").textContent = `请按：横握时的 ${labels[state.action]}`;
      warn("");
    } else if (state.done) {
      warn("校准完成。现在可以用遥控器玩游戏了。");
    }
  }

  const browser = new window.jsnes.Browser({
    container: $("nes-screen"),
    onError: (error) => {
      paused = true;
      input.setEnabled(false);
      status.textContent = "游戏运行出错";
      say(`游戏运行出错：${error.message}`, true);
      pauseButton.textContent = "继续";
    },
  });
  // The page handles all controls so calibration can use KeyboardEvent.code.
  browser.keyboard.keys = {};

  const input = new window.RemoteInput({
    onMapping: renderMapping,
    onProbe: (key) => { $("last-key").textContent = key; },
    onCalibration: showCalibration,
    onAction: (action, down) => {
      const indicator = document.querySelector(`[data-indicator="${action}"]`);
      if (indicator) indicator.classList.toggle("pressed", down);
    },
    onWarning: warn,
  });
  input.setNes(browser.nes);

  async function loadFile(file) {
    if (!file) return;
    if (!/\.nes$/i.test(file.name)) {
      say("请选择扩展名为 .nes 的 FC 游戏文件。", true);
      return;
    }
    if (file.size < 16 || file.size > 32 * 1024 * 1024) {
      say("这个文件大小不正常，请换一个 .nes 游戏文件。", true);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes[0] !== 0x4e || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1a) {
        throw new Error("文件缺少 NES 格式标识");
      }
      input.releaseAll();
      browser.loadROM(bytes);
      browser.keyboard.keys = {};
      loaded = true;
      paused = false;
      romName = file.name;
      input.setEnabled(true);
      emptyScreen.hidden = true;
      status.textContent = "正在游玩";
      pauseButton.disabled = false;
      resetButton.disabled = false;
      muteButton.disabled = false;
      pauseButton.textContent = "暂停";
      say(`已载入 ${romName}。按键校准后即可用横握遥控器游玩。`);
      applyMute();
      browser.fitInParent();
    } catch (error) {
      say(`载入失败：${error.message}`, true);
    }
  }

  function applyMute() {
    muteButton.textContent = muted ? "声音：关" : "声音：开";
    const context = browser._speakers.audioCtx;
    if (!context) return;
    if (muted) context.suspend().catch(() => {});
    else context.resume().catch(() => {});
  }

  romFile.addEventListener("change", () => {
    loadFile(romFile.files[0]);
    romFile.value = "";
  });
  window.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dropOverlay.hidden = false;
  });
  window.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) dropOverlay.hidden = true;
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dropOverlay.hidden = true;
    loadFile(event.dataTransfer?.files[0]);
  });

  pauseButton.addEventListener("click", () => {
    if (!loaded) return;
    paused = !paused;
    if (paused) {
      input.setEnabled(false);
      browser.stop();
      status.textContent = "已暂停";
      pauseButton.textContent = "继续";
    } else {
      browser.start();
      input.setEnabled(true);
      applyMute();
      status.textContent = "正在游玩";
      pauseButton.textContent = "暂停";
    }
  });
  resetButton.addEventListener("click", () => {
    if (!loaded) return;
    input.releaseAll();
    browser.nes.reset();
    say(`已重开 ${romName}。`);
  });
  muteButton.addEventListener("click", () => {
    muted = !muted;
    applyMute();
  });
  fullButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await screenWrap.requestFullscreen();
      setTimeout(() => browser.fitInParent(), 80);
    } catch { say("浏览器未允许全屏，请用窗口模式游玩。", true); }
  });
  document.addEventListener("fullscreenchange", () => browser.fitInParent());
  window.addEventListener("resize", () => browser.fitInParent());

  $("calibrate-button").addEventListener("click", () => input.beginCalibration());
  $("cancel-button").addEventListener("click", () => input.cancelCalibration());
  $("skip-button").addEventListener("click", () => input.skipStep());
  $("clear-button").addEventListener("click", () => {
    input.resetMapping();
    warn("已恢复这只小米遥控器的实测预设。");
  });

  document.querySelectorAll("[data-button]").forEach((button) => {
    const action = button.dataset.button;
    const release = () => { input.releaseVirtual(action); button.classList.remove("pressed"); };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      input.pressVirtual(action);
      button.classList.add("pressed");
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
})();
