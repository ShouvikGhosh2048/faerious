import { useEffect, useRef, useState } from "react";

type Direction = "up" | "down" | "left" | "right";

interface Agent {
  direction: Direction;
  position: [number, number];
}

export interface GameConnection {
  gameId: string;
  socket: WebSocket;
}

type Move = "Nothing" | "TurnLeft" | "TurnRight" | { Move: [number, number] };

interface GameState {
  board: string[][];
  isFirstPlayer: boolean;
  agents: Agent[];
  visibleOpponents: [number, number][];
  // Current move selection. null if it is the opponent's turn.
  moveSelection: null | Move[];
  selectedAgent: null | number;
}

interface GameProps {
  gameConnection: GameConnection;
  setGameConnection: (gameConnection: GameConnection | null) => void;
}

function Game({ gameConnection, setGameConnection }: GameProps) {
  const [gameState, setGameState] = useState(null as null | GameState);
  const canvasRef = useRef(null as null | HTMLCanvasElement);

  // Handle messages recieved from the server.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const message = JSON.parse(e.data);
      if (message["Start"]) {
        const { board, is_first_player: isFirstPlayer } = message["Start"];

        const agents = [];
        for (let i = 6; i <= 15; i++) {
          agents.push({
            direction: (isFirstPlayer ? "down" : "up") as Direction,
            position: [isFirstPlayer ? 1 : 18, i] as [number, number],
          });
        }

        setGameState({
          board,
          isFirstPlayer,
          agents,
          visibleOpponents: [],
          moveSelection: isFirstPlayer ? agents.map(() => "Nothing") : null,
          selectedAgent: null,
        });
      } else if (message["MovePlayed"]) {
        const { visible_opponents: visibleOpponents } = message["MovePlayed"];

        setGameState((gameState) => {
          if (gameState === null) {
            return null;
          }

          let agents = gameState.agents;
          const moveSelection = gameState.moveSelection;
          if (moveSelection) {
            // Play the move
            agents = agents.map((agent, i) => {
              const move = moveSelection[i];

              if (typeof move !== "string") {
                return {
                  ...agent,
                  position: move.Move,
                };
              } else {
                if (move === "TurnLeft") {
                  let newDirection: Direction;
                  switch (agent.direction) {
                    case "down": {
                      newDirection = "right";
                      break;
                    }
                    case "right": {
                      newDirection = "up";
                      break;
                    }
                    case "up": {
                      newDirection = "left";
                      break;
                    }
                    case "left": {
                      newDirection = "down";
                      break;
                    }
                  }

                  return {
                    ...agent,
                    direction: newDirection,
                  };
                } else if (move === "TurnRight") {
                  let newDirection: Direction;
                  switch (agent.direction) {
                    case "down": {
                      newDirection = "left";
                      break;
                    }
                    case "left": {
                      newDirection = "up";
                      break;
                    }
                    case "up": {
                      newDirection = "right";
                      break;
                    }
                    case "right": {
                      newDirection = "down";
                      break;
                    }
                  }

                  return {
                    ...agent,
                    direction: newDirection,
                  };
                }
              }

              return agent;
            });
          }

          return {
            ...gameState,
            visibleOpponents,
            moveSelection:
              gameState.moveSelection === null
                ? gameState.agents.map(() => "Nothing")
                : null,
            selectedAgent: null,
            agents,
          };
        });
      }
    }

    function onClose() {
      setGameConnection(null);
    }

    gameConnection.socket.addEventListener("message", onMessage);
    gameConnection.socket.addEventListener("close", onClose);

    return () => {
      gameConnection.socket.removeEventListener("message", onMessage);
      gameConnection.socket.removeEventListener("close", onClose);
    };
  }, [gameConnection, setGameConnection]);

  // Draw on the canvas and handle interactions with the canvas.
  useEffect(() => {
    if (canvasRef.current && gameState) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, 500, 500);

      // Draw the field of vision
      ctx.fillStyle = gameState.isFirstPlayer
        ? "rgb(255, 230, 230)"
        : "rgb(230, 230, 255)";
      gameState.agents.forEach((agent) => {
        for (let i = 1; i < 4; i++) {
          for (let j = -i; j <= i; j++) {
            let square;
            switch (agent.direction) {
              case "down": {
                square = [agent.position[0] + i, agent.position[1] + j];
                break;
              }
              case "left": {
                square = [agent.position[0] + j, agent.position[1] - i];
                break;
              }
              case "right": {
                square = [agent.position[0] + j, agent.position[1] + i];
                break;
              }
              case "up": {
                square = [agent.position[0] - i, agent.position[1] + j];
                break;
              }
            }
            ctx.fillRect(25 * square[1], 25 * square[0], 25, 25);
          }
        }
      });

      // Draw the field of vision of the selected agent
      if (gameState.selectedAgent !== null) {
        const agent = gameState.agents[gameState.selectedAgent];
        ctx.fillStyle = gameState.isFirstPlayer
          ? "rgb(200, 150, 150)"
          : "rgb(150, 150, 200)";
        for (let i = 1; i < 4; i++) {
          for (let j = -i; j <= i; j++) {
            let square;
            switch (agent.direction) {
              case "down": {
                square = [agent.position[0] + i, agent.position[1] + j];
                break;
              }
              case "left": {
                square = [agent.position[0] + j, agent.position[1] - i];
                break;
              }
              case "right": {
                square = [agent.position[0] + j, agent.position[1] + i];
                break;
              }
              case "up": {
                square = [agent.position[0] - i, agent.position[1] + j];
                break;
              }
            }
            ctx.fillRect(25 * square[1], 25 * square[0], 25, 25);
          }
        }
      }

      // Draw the square the player will move to
      if (gameState.moveSelection) {
        gameState.moveSelection.forEach((agent, index) => {
          if (typeof agent !== "string") {
            if (index === gameState.selectedAgent) {
              ctx.fillStyle = gameState.isFirstPlayer
                ? "rgba(179, 111, 23)"
                : "rgb(71, 17, 107)";
            } else {
              ctx.fillStyle = gameState.isFirstPlayer
                ? "rgba(245, 153, 32)"
                : "rgb(153, 37, 230)";
            }
            ctx.fillRect(25 * agent.Move[1], 25 * agent.Move[0], 25, 25);
          }
        });
      }

      // Draw the agents
      gameState.agents.forEach((agent, index) => {
        if (index === gameState.selectedAgent) {
          ctx.fillStyle = gameState.isFirstPlayer
            ? "rgb(150, 10, 0)"
            : "rgb(37, 72, 230)";
        } else {
          ctx.fillStyle = gameState.isFirstPlayer
            ? "rgb(235, 64, 21)"
            : "rgb(37, 123, 230)";
        }
        ctx.fillRect(25 * agent.position[1], 25 * agent.position[0], 25, 25);

        // Draw the eyes
        ctx.fillStyle = "black";
        switch (agent.direction) {
          case "down": {
            ctx.fillRect(
              25 * agent.position[1] + 5,
              25 * agent.position[0] + 15,
              5,
              5
            );
            ctx.fillRect(
              25 * agent.position[1] + 15,
              25 * agent.position[0] + 15,
              5,
              5
            );
            break;
          }
          case "left": {
            ctx.fillRect(
              25 * agent.position[1] + 5,
              25 * agent.position[0] + 5,
              5,
              5
            );
            ctx.fillRect(
              25 * agent.position[1] + 5,
              25 * agent.position[0] + 15,
              5,
              5
            );
            break;
          }
          case "right": {
            ctx.fillRect(
              25 * agent.position[1] + 15,
              25 * agent.position[0] + 5,
              5,
              5
            );
            ctx.fillRect(
              25 * agent.position[1] + 15,
              25 * agent.position[0] + 15,
              5,
              5
            );
            break;
          }
          case "up": {
            ctx.fillRect(
              25 * agent.position[1] + 5,
              25 * agent.position[0] + 5,
              5,
              5
            );
            ctx.fillRect(
              25 * agent.position[1] + 15,
              25 * agent.position[0] + 5,
              5,
              5
            );
            break;
          }
        }
      });

      // Draw visible opponents
      ctx.fillStyle = gameState.isFirstPlayer
        ? "rgb(37, 123, 230)"
        : "rgb(235, 64, 21)";
      gameState.visibleOpponents.forEach((position) => {
        ctx.fillRect(25 * position[1], 25 * position[0], 25, 25);
      });

      // Draw the blocks
      ctx.fillStyle = "black";
      for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 20; j++) {
          if (gameState.board[i][j] === "Block") {
            ctx.fillRect(25 * j, 25 * i, 25, 25);
          }
        }
      }

      const onClick = (e: MouseEvent) => {
        const clickedSquare = [
          Math.floor(e.offsetY / 25.0),
          Math.floor(e.offsetX / 25.0),
        ] as [number, number];

        if (gameState.moveSelection) {
          const agentIndex = gameState.agents.findIndex(
            (agent) =>
              agent.position[0] === clickedSquare[0] &&
              agent.position[1] === clickedSquare[1]
          );

          if (agentIndex !== -1) {
            // There is an agent on the square.
            setGameState({
              ...gameState,
              selectedAgent: agentIndex,
            });
          } else if (gameState.selectedAgent !== null) {
            // There is a selected agent.
            const agent = gameState.agents[gameState.selectedAgent];

            let canMoveToSquare = true;

            // Check if there is a block, opponent, or some agent is moving to that square.
            if (
              gameState.board[clickedSquare[0]][clickedSquare[1]] === "Block"
            ) {
              canMoveToSquare = false;
            }
            if (
              gameState.visibleOpponents.find(
                (opponent) =>
                  opponent[0] === clickedSquare[0] &&
                  opponent[1] === clickedSquare[1]
              )
            ) {
              canMoveToSquare = false;
            }
            if (
              gameState.moveSelection.find(
                (move) =>
                  typeof move !== "string" &&
                  move.Move[0] === clickedSquare[0] &&
                  move.Move[1] === clickedSquare[1]
              )
            ) {
              canMoveToSquare = false;
            }

            // Check if the square is in the field of vision.
            switch (agent.direction) {
              case "down": {
                if (
                  !(
                    agent.position[0] < clickedSquare[0] &&
                    clickedSquare[0] < agent.position[0] + 4 &&
                    Math.abs(clickedSquare[1] - agent.position[1]) <=
                      clickedSquare[0] - agent.position[0]
                  )
                ) {
                  canMoveToSquare = false;
                }
                break;
              }
              case "left": {
                if (
                  !(
                    agent.position[1] - 4 < clickedSquare[1] &&
                    clickedSquare[1] < agent.position[1] &&
                    Math.abs(clickedSquare[0] - agent.position[0]) <=
                      agent.position[1] - clickedSquare[1]
                  )
                ) {
                  canMoveToSquare = false;
                }
                break;
              }
              case "right": {
                if (
                  !(
                    agent.position[1] < clickedSquare[1] &&
                    clickedSquare[1] < agent.position[1] + 4 &&
                    Math.abs(clickedSquare[0] - agent.position[0]) <=
                      clickedSquare[1] - agent.position[1]
                  )
                ) {
                  canMoveToSquare = false;
                }
                break;
              }
              case "up": {
                if (
                  !(
                    agent.position[0] - 4 < clickedSquare[0] &&
                    clickedSquare[0] < agent.position[0] &&
                    Math.abs(clickedSquare[1] - agent.position[1]) <=
                      agent.position[0] - clickedSquare[0]
                  )
                ) {
                  canMoveToSquare = false;
                }
                break;
              }
            }

            if (canMoveToSquare) {
              const moveSelection = gameState.moveSelection;
              const newMoveSelection = [
                ...moveSelection.slice(0, gameState.selectedAgent),
                { Move: clickedSquare },
                ...moveSelection.slice(gameState.selectedAgent + 1),
              ];
              setGameState({
                ...gameState,
                moveSelection: newMoveSelection,
              });
            }
          }
        }
      };

      canvas.addEventListener("click", onClick);
      return () => {
        canvas.removeEventListener("click", onClick);
      };
    }
  });

  if (!gameState) {
    return <div className="p-3">Game ID: {gameConnection.gameId}</div>;
  }

  return (
    <div className="flex p-3 gap-10">
      <div>
        <canvas
          ref={canvasRef}
          width="500"
          height="500"
          className="border"
        ></canvas>
      </div>
      <div className="w-96 space-y-3">
        <p className="font-bold text-lg">
          {gameState.moveSelection !== null ? "Your move" : "Opponent's move"}
        </p>
        {gameState.moveSelection !== null && (
          <>
            <p>Moves:</p>
            {gameState.moveSelection.map((move, index) => (
              <div key={index} className="space-y-1">
                <div className="flex gap-3">
                  <button
                    className="bg-slate-200 px-1 py-0.5 rounded"
                    onClick={() => {
                      setGameState({ ...gameState, selectedAgent: index });
                    }}
                  >
                    Player {index}
                  </button>
                  <span>
                    Move:{" "}
                    {typeof move === "string" ? move : `Move to [${move.Move}]`}
                  </span>
                </div>
                {index === gameState.selectedAgent && (
                  <div className="flex gap-3">
                    {["Nothing", "TurnLeft", "TurnRight"].map((move) => (
                      <button
                        className="bg-slate-200 px-1 py-0.5 rounded"
                        onClick={() => {
                          setGameState({
                            ...gameState,
                            moveSelection: [
                              ...gameState.moveSelection!.slice(0, index),
                              move as "Nothing" | "TurnLeft" | "TurnRight",
                              ...gameState.moveSelection!.slice(index + 1),
                            ],
                          });
                        }}
                      >
                        {move}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button
              className="bg-slate-900 text-white px-2 py-1 rounded"
              onClick={() => {
                gameConnection.socket.send(
                  JSON.stringify({ moves: gameState.moveSelection })
                );
              }}
            >
              Play Move
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Game;
