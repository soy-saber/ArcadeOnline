"use strict";

const ArcadeNet = (() => {
  let ws = null;
  let handlers = {};
  let connected = false;
  let retryDelay = 1500;

  function connect(url) {
    ws = new WebSocket(url);
    ws.binaryType = "blob";
    ws.onopen = () => {
      connected = true;
      retryDelay = 1500;
      fire("conn", true);
    };
    ws.onclose = () => {
      connected = false;
      fire("conn", false);
      setTimeout(() => {
        if (!connected) connect(url);
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 6000);
    };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
      if (ev.data instanceof Blob || ev.data instanceof ArrayBuffer) {
        fire("frame", ev.data);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      fire(msg.t, msg);
    };
  }

  function fire(type, data) {
    const list = handlers[type] || [];
    for (const fn of list.slice()) {
      try {
        fn(data);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return {
    connect,
    on(type, fn) {
      (handlers[type] = handlers[type] || []).push(fn);
    },
    send(msg) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    },
    sendBlob(blob) {
      if (ws && ws.readyState === 1) ws.send(blob);
    },
    get connected() {
      return connected;
    }
  };
})();

function arcadeName() {
  return localStorage.getItem("arcade_name") || "";
}

function arcadeSession() {
  let id = sessionStorage.getItem("arcade_session");
  if (!id) {
    if (crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      const bytes = new Uint8Array(16);
      if (crypto.getRandomValues) crypto.getRandomValues(bytes);
      else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    sessionStorage.setItem("arcade_session", id);
  }
  return id;
}

function ensureName(nextUrl) {
  const n = arcadeName();
  if (!n) {
    const to = nextUrl || location.pathname + location.search;
    location.href = "/?next=" + encodeURIComponent(to);
    return false;
  }
  return true;
}
