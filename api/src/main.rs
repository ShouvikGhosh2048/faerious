mod game;
use game::{play_game, Player};

use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, WebSocketUpgrade,
    },
    response::IntoResponse,
    routing::get,
    Extension, Router,
};
use futures::{SinkExt, StreamExt};
use rand::{distributions::Alphanumeric, thread_rng, Rng};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tower_http::services::ServeDir;

type Games = Arc<RwLock<HashMap<String, Player>>>;

#[derive(Serialize, Deserialize)]
enum GameConnectionMessage {
    Game(String),
    NoSuchGame,
    JoinedGame,
}

#[shuttle_runtime::main]
async fn main() -> shuttle_axum::ShuttleAxum {
    let games = Games::default();

    let router = Router::new()
        .route("/game", get(new_game))
        .route("/game/:game_id", get(join_game))
        .layer(Extension(games))
        .nest_service("/", ServeDir::new("static"));

    Ok(router.into())
}

async fn new_game(ws: WebSocketUpgrade, Extension(games): Extension<Games>) -> impl IntoResponse {
    ws.on_upgrade(|socket| new_game_callback(socket, games))
}

async fn new_game_callback(socket: WebSocket, games: Games) {
    let id = {
        let (mut sender, reciever) = socket.split();

        let mut games = games.write().await;
        let mut id: String;
        {
            let mut rng = thread_rng();
            loop {
                // TODO: Is this random enough?
                id = (0..20).map(|_| rng.sample(Alphanumeric) as char).collect();
                if !games.contains_key(&id) {
                    break;
                }
            }
        }
    
        sender
            .send(Message::Text(
                serde_json::to_string(&GameConnectionMessage::Game(id.clone())).unwrap(),
            ))
            .await
            .expect("Couldn't send message");
        games.insert(id.clone(), Player { sender, reciever });
        id
    };

    tokio::time::sleep(tokio::time::Duration::from_secs(5 * 60)).await;

    // NOTE: ID could be reused, but unlikely.
    games.write().await.remove(&id);
}

async fn join_game(
    ws: WebSocketUpgrade,
    Extension(games): Extension<Games>,
    Path(game_id): Path<String>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| join_game_callback(socket, games, game_id))
}

async fn join_game_callback(socket: WebSocket, games: Games, game_id: String) {
    let (mut sender, reciever) = socket.split();

    let player = if let Some(player) = games.write().await.remove(&game_id) {
        sender
            .send(Message::Text(
                serde_json::to_string(&GameConnectionMessage::JoinedGame).unwrap(),
            ))
            .await
            .expect("Couldn't send message");
        player
    } else {
        sender
            .send(Message::Text(
                serde_json::to_string(&GameConnectionMessage::NoSuchGame).unwrap(),
            ))
            .await
            .expect("Couldn't send message");
        return;
    };

    play_game([player, Player { sender, reciever }]).await;
}
