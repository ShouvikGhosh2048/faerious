import { useEffect } from "react";

function App() {
  useEffect(() => {
    const websocketURL = ((window.location.protocol === 'https:' && 'wss://') || "ws://") + window.location.host + "/ws";
    const websocket = new WebSocket(websocketURL);

    websocket.onopen = () => {
      console.log("Connected");
    }

    websocket.onclose = () => {
      console.log("Disconnected");
    }

    websocket.onmessage = (e) => {
      const message = JSON.parse(e.data);
      console.log(message);
    }
  }, []);

  return (
    <div></div>
  );
}

export default App;
