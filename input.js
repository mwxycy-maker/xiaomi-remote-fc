(() => {
  "use strict";

  const { preset: XIAOMI_PRESET, eventId } = window.XiaomiRemoteKeys;
  const STORAGE_KEY = "fc-remote-mapping-v1";
  const ACTIONS = ["up", "down", "left", "right", "a", "b", "start", "select"];
  const KEYBOARD = {
    KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
    KeyJ: "a", KeyK: "b", Enter: "start", ShiftRight: "select",
  };
  class RemoteInput {
    constructor({ onMapping, onProbe, onCalibration, onAction, onWarning }) {
      this.callbacks = { onMapping, onProbe, onCalibration, onAction, onWarning };
      this.mapping = this.readMapping();
      this.pressed = new Map();
      this.actionHolds = new Map();
      this.calibration = null;
      this.timeout = null;
      this.nes = null;
      this.enabled = false;
      document.addEventListener("keydown", (event) => this.keyDown(event), true);
      document.addEventListener("keyup", (event) => this.keyUp(event), true);
      window.addEventListener("blur", () => this.releaseAll());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.releaseAll();
      });
      this.callbacks.onMapping(this.mapping);
    }

    readMapping() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (value && typeof value === "object" && ACTIONS.every((action) =>
          !value[action] || typeof value[action] === "string")) return value;
      } catch { /* Private browsing can block storage. */ }
      return { ...XIAOMI_PRESET };
    }

    saveMapping() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mapping)); }
      catch { this.callbacks.onWarning("浏览器未允许保存设置，本次打开期间仍可使用。"); }
      this.callbacks.onMapping(this.mapping);
    }

    setNes(nes) {
      this.releaseAll();
      this.nes = nes;
    }

    setEnabled(value) {
      if (!value) this.releaseAll();
      this.enabled = value;
    }

    beginCalibration() {
      this.releaseAll();
      this.calibration = { index: 0, draft: {} };
      this.showStep();
    }

    cancelCalibration() {
      this.calibration = null;
      clearTimeout(this.timeout);
      this.callbacks.onCalibration({ active: false });
    }

    skipStep() {
      if (!this.calibration) return;
      if (this.calibration.index < 6) {
        this.callbacks.onWarning("方向和 A/B 必须设置；如果按键没有反应，请先检查遥控器连接。");
        return;
      }
      this.advanceCalibration();
    }

    showStep() {
      if (!this.calibration) return;
      clearTimeout(this.timeout);
      const action = ACTIONS[this.calibration.index];
      this.callbacks.onCalibration({ active: true, action, index: this.calibration.index, total: ACTIONS.length });
      this.timeout = setTimeout(() => {
        this.callbacks.onWarning("还没有收到按键。请让游戏页保持在前台；如果 TV/菜单键始终无反应，可能被 macOS 拦截。");
      }, 9000);
    }

    advanceCalibration() {
      if (!this.calibration) return;
      this.calibration.index++;
      if (this.calibration.index === ACTIONS.length) {
        this.mapping = this.calibration.draft;
        this.calibration = null;
        clearTimeout(this.timeout);
        this.saveMapping();
        this.callbacks.onCalibration({ active: false, done: true });
      } else {
        this.showStep();
      }
    }

    resetMapping() {
      this.cancelCalibration();
      this.releaseAll();
      this.mapping = { ...XIAOMI_PRESET };
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore. */ }
      this.callbacks.onMapping(this.mapping);
    }

    resolve(id) {
      for (const action of ACTIONS) if (this.mapping[action] === id) return action;
      return KEYBOARD[id] || null;
    }

    keyDown(event) {
      const id = eventId(event);
      if (!id) {
        if (this.calibration) this.callbacks.onWarning("浏览器收到了无法识别的按键，请换一个键。");
        return;
      }
      if (!event.repeat) this.callbacks.onProbe(`${id} · ${event.key || ""}`);
      if (this.calibration) {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        const action = ACTIONS[this.calibration.index];
        if (Object.values(this.calibration.draft).includes(id)) {
          this.callbacks.onWarning("这个键已用于别的操作，请按另一个键。");
          return;
        }
        this.calibration.draft[action] = id;
        this.advanceCalibration();
        return;
      }
      const action = this.resolve(id);
      if (!action) return;
      event.preventDefault();
      if (!this.enabled || !this.nes || this.pressed.has(id)) return;
      this.pressed.set(id, action);
      this.hold(action, id);
    }

    keyUp(event) {
      const id = eventId(event);
      if (!id) return;
      if (this.calibration) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!this.pressed.has(id)) return;
      event.preventDefault();
      const action = this.pressed.get(id);
      this.pressed.delete(id);
      this.release(action, id);
    }

    hold(action, id) {
      let sources = this.actionHolds.get(action);
      if (!sources) {
        sources = new Set();
        this.actionHolds.set(action, sources);
      }
      if (sources.has(id)) return;
      const wasReleased = sources.size === 0;
      sources.add(id);
      if (wasReleased) {
        this.nes.buttonDown(1, this.button(action));
        this.callbacks.onAction(action, true);
      }
    }

    release(action, id) {
      const sources = this.actionHolds.get(action);
      if (!sources) return;
      sources.delete(id);
      if (sources.size === 0) {
        this.actionHolds.delete(action);
        if (this.nes) this.nes.buttonUp(1, this.button(action));
        this.callbacks.onAction(action, false);
      }
    }

    pressVirtual(action) {
      if (this.enabled && this.nes && ACTIONS.includes(action)) this.hold(action, `virtual:${action}`);
    }

    releaseVirtual(action) {
      this.release(action, `virtual:${action}`);
    }

    releaseAll() {
      for (const [action] of this.actionHolds) {
        if (this.nes) this.nes.buttonUp(1, this.button(action));
        this.callbacks.onAction(action, false);
      }
      this.actionHolds.clear();
      this.pressed.clear();
    }

    button(action) {
      const c = window.jsnes.Controller;
      return {
        up: c.BUTTON_UP, down: c.BUTTON_DOWN,
        left: c.BUTTON_LEFT, right: c.BUTTON_RIGHT,
        a: c.BUTTON_A, b: c.BUTTON_B,
        start: c.BUTTON_START, select: c.BUTTON_SELECT,
      }[action];
    }
  }

  window.RemoteInput = RemoteInput;
})();
