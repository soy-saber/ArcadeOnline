"use strict";

const ArcadeNet = (() => {
  let ws = null;
  let handlers = {};
  let connected = false;

  function connect(url) {
    ws = new WebSocket(url);
    ws.onopen = () => {
      connected = true;
      fire("conn", true);
    };
    ws.onclose = () => {
      connected = false;
      fire("conn", false);
    };
    ws.onerror = () => {};
    ws.onmessage = (ev) => {
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
    get connected() {
      return connected;
    }
  };
})();

function arcadeName() {
  return localStorage.getItem("arcade_name") || "";
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
