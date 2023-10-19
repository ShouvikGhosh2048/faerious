use axum::extract::ws::{Message, WebSocket};
use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use rand::{random, seq::SliceRandom};
use serde::{Deserialize, Serialize};

pub struct Player {
    pub sender: SplitSink<WebSocket, Message>,
    pub reciever: SplitStream<WebSocket>,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
enum Direction {
    Up,
    Left,
    Right,
    Down,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
enum Square {
    Empty,
    Block,
}

#[derive(Serialize, Deserialize)]
enum ServerMessage {
    Start {
        board: Vec<Vec<Square>>,
        is_first_player: bool,
    },
    InvalidMove,
    MovePlayed {
        visible_opponents: Vec<(usize, usize)>,
    },
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
struct Agent {
    position: (usize, usize),
    direction: Direction,
}

#[derive(Serialize, Deserialize)]
enum AgentMove {
    Nothing,
    TurnLeft,
    TurnRight,
    Move((usize, usize)),
}

#[derive(Serialize, Deserialize)]
struct ClientMessage {
    moves: Vec<AgentMove>,
}

fn in_visible_range(
    position: (usize, usize),
    direction: Direction,
    target: (usize, usize),
) -> bool {
    match direction {
        Direction::Down => {
            position.0 < target.0
                && target.0 < position.0 + 4
                && position.1.abs_diff(target.1) <= target.0 - position.0
        }
        Direction::Left => {
            position.1 < target.1 + 4
                && target.1 < position.1
                && position.0.abs_diff(target.0) <= position.1 - target.1
        }
        Direction::Right => {
            position.1 < target.1
                && target.1 < position.1 + 4
                && position.0.abs_diff(target.0) <= target.1 - position.1
        }
        Direction::Up => {
            position.0 < target.0 + 4
                && target.0 < position.0
                && position.1.abs_diff(target.1) <= position.0 - target.0
        }
    }
}

pub async fn play_game(mut players: [Player; 2]) {
    players.shuffle(&mut rand::thread_rng());

    let mut board = vec![vec![Square::Empty; 20]; 20];
    for i in 2..=17 {
        for j in 0..20 {
            if random::<f32>() < 0.1 {
                board[i][j] = Square::Block;
            }
        }
    }

    let mut agents = [vec![], vec![]];
    for i in 6..=15 {
        agents[0].push(Agent {
            position: (1, i),
            direction: Direction::Down,
        });
        agents[1].push(Agent {
            position: (18, i),
            direction: Direction::Up,
        });
    }

    if players[0]
        .sender
        .send(Message::Text(
            serde_json::to_string(&ServerMessage::Start {
                board: board.clone(),
                is_first_player: true,
            })
            .unwrap(),
        ))
        .await
        .is_err()
    {
        // TODO: Send better message to other player
        return;
    }

    if players[1]
        .sender
        .send(Message::Text(
            serde_json::to_string(&ServerMessage::Start {
                board: board.clone(),
                is_first_player: false,
            })
            .unwrap(),
        ))
        .await
        .is_err()
    {
        // TODO: Send better message to other player
        return;
    }

    let mut current_player = 0;
    loop {
        match players[current_player].reciever.next().await {
            Some(Ok(Message::Text(message))) => {
                let message: ClientMessage = match serde_json::from_str(&message) {
                    Err(_) => {
                        if players[current_player]
                            .sender
                            .send(Message::Text(
                                serde_json::to_string(&ServerMessage::InvalidMove).unwrap(),
                            ))
                            .await
                            .is_err()
                        {
                            return;
                        }

                        continue;
                    }
                    Ok(message) => message,
                };

                let mut is_move_valid = true;
                if message.moves.len() != agents[current_player].len() {
                    is_move_valid = false;
                } else {
                    let mut move_to = vec![];

                    for (i, agent_move) in message.moves.iter().enumerate() {
                        let agent = &agents[current_player][i];

                        match agent_move {
                            AgentMove::Nothing | AgentMove::TurnLeft | AgentMove::TurnRight => {}
                            AgentMove::Move(position) => {
                                let in_board =
                                    position.0 < board.len() && position.1 < board[0].len();

                                // TODO: Consider players moving through blocks / each other.
                                if !in_visible_range(agent.position, agent.direction, *position)
                                    || !in_board
                                    || board[position.0][position.1] != Square::Empty
                                    || move_to.contains(position)
                                {
                                    is_move_valid = false;
                                } else {
                                    move_to.push(*position);
                                }
                            }
                        }
                    }
                }

                if !is_move_valid {
                    if players[current_player]
                        .sender
                        .send(Message::Text(
                            serde_json::to_string(&ServerMessage::InvalidMove).unwrap(),
                        ))
                        .await
                        .is_err()
                    {
                        return;
                    }
                    continue;
                }

                for (i, agent_move) in message.moves.iter().enumerate() {
                    let agent = &mut agents[current_player][i];
                    match agent_move {
                        AgentMove::Nothing => {}
                        AgentMove::TurnLeft => {
                            agent.direction = match agent.direction {
                                Direction::Down => Direction::Right,
                                Direction::Right => Direction::Up,
                                Direction::Up => Direction::Left,
                                Direction::Left => Direction::Down,
                            };
                        }
                        AgentMove::TurnRight => {
                            agent.direction = match agent.direction {
                                Direction::Down => Direction::Left,
                                Direction::Left => Direction::Up,
                                Direction::Up => Direction::Right,
                                Direction::Right => Direction::Down,
                            };
                        }
                        AgentMove::Move(position) => {
                            agent.position = *position;
                        }
                    }
                }

                // Send messages to players
                for player in 0..=1 {
                    let mut visible_opponents = vec![];

                    for opponent_agent in agents[1 - player].iter() {
                        for agent in agents[player].iter() {
                            if in_visible_range(
                                agent.position,
                                agent.direction,
                                opponent_agent.position,
                            ) {
                                visible_opponents.push(opponent_agent.position);
                                break;
                            }
                        }
                    }

                    if players[player]
                        .sender
                        .send(Message::Text(
                            serde_json::to_string(&ServerMessage::MovePlayed { visible_opponents })
                                .unwrap(),
                        ))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }

                current_player = 1 - current_player;
            }
            _ => {
                // TODO: Send better message to other player
                return;
            }
        }
    }
}
