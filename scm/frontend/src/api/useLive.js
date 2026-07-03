import { useEffect, useRef, useState } from "react";
import { api, WS_URL } from "./client";

/**
 * Live summary via WebSocket, falling back to REST polling if the socket
 * can't connect. Returns { summary, live } where `live` is true while the
 * WebSocket is connected.
 */
export function useLiveSummary() {
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    let ws;
    let closed = false;

    function startPolling() {
      if (pollRef.current) return;
      const tick = async () => {
        try {
          setSummary(await api.dashboardSummary());
        } catch {
          /* ignore transient errors */
        }
      };
      tick();
      pollRef.current = setInterval(tick, 5000);
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        if (closed) return;
        setLive(true);
        stopPolling();
      };
      ws.onmessage = (evt) => {
        try {
          setSummary(JSON.parse(evt.data));
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        setLive(false);
        if (!closed) startPolling();
      };
      ws.onerror = () => {
        setLive(false);
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      stopPolling();
      if (ws) ws.close();
    };
  }, []);

  return { summary, live };
}
