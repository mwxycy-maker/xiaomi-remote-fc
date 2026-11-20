(() => {
  "use strict";

  // Key codes observed with the Xiaomi remote held horizontally.
  const preset = Object.freeze({
    up: "ArrowRight",
    down: "ArrowLeft",
    left: "ArrowUp",
    right: "ArrowDown",
    a: "Backquote",
    b: "ContextMenu",
    start: "Home",
  });

  function eventId(event) {
    if (event.code && event.code !== "Unidentified") return event.code;
    if (event.key && event.key !== "Unidentified" && event.key !== "Dead") return `key:${event.key}`;
    if (event.keyCode) return `legacy:${event.keyCode}`;
    return null;
  }

  window.XiaomiRemoteKeys = Object.freeze({ preset, eventId });
})();
