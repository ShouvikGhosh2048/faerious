import { useState } from "react";
import Game, { GameConnection } from "./Game";

interface GameSelectionProps {
  setGameConnection: (gameConnection: GameConnection | null) => void;
}

function gameURL() {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  //  When using npm run dev, we change the port.
  const host =
    window.location.host === "localhost:5173"
      ? "localhost:8000"
      : window.location.host;
  return protocol + host + "/game";
}

function GameSelection({ setGameConnection }: GameSelectionProps) {
  const [gameId, setGameId] = useState("");

  async function newGame() {
    const socket = new WebSocket(gameURL());

    socket.addEventListener(
      "message",
      (e) => {
        const message = JSON.parse(e.data);
        if (message["Game"]) {
          // New game created by the server
          const gameId = message["Game"] as string;
          setGameConnection({
            gameId,
            socket,
          });
        }
      },
      { once: true }
    );
  }

  async function joinGame() {
    const socket = new WebSocket(gameURL() + `/${gameId}`);

    socket.addEventListener(
      "message",
      (e) => {
        const message = JSON.parse(e.data);
        if (message === "JoinedGame") {
          setGameConnection({
            gameId,
            socket,
          });
        } else {
          alert("Couldnt join the game");
        }
      },
      { once: true }
    );
  }

  return (
    <div className="p-3 space-y-5">
      <h1 className="text-center text-2xl font-bold">FAERIOUS</h1>
      <div className="max-w-md mx-auto flex flex-col items-center space-y-3">
        <button
          className="bg-slate-900 text-white px-2 py-1 rounded"
          onClick={newGame}
        >
          New game
        </button>
        <p>OR</p>
        <div className="flex gap-3">
          <input
            className="border rounded border-slate-900 p-1"
            value={gameId}
            onChange={(e) => {
              setGameId(e.target.value);
            }}
          />
          <button
            className="bg-slate-900 text-white px-2 py-1 rounded"
            onClick={joinGame}
          >
            Join game
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [gameConnection, setGameConnection] = useState(
    null as null | GameConnection
  );

  return (
    <>
      {gameConnection === null && (
        <GameSelection setGameConnection={setGameConnection} />
      )}
      {gameConnection !== null && (
        <Game
          gameConnection={gameConnection}
          setGameConnection={setGameConnection}
        />
      )}
    </>
  );
}

export default App;
