use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

use axum::{
    extract::{
        ws::{Message, WebSocket},
        WebSocketUpgrade,
    },
    response::IntoResponse,
    routing::get,
    Extension, Router,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use shuttle_secrets::SecretStore;
use tokio::sync::{
    mpsc::{self, UnboundedSender},
    RwLock,
};
use tower_http::services::ServeDir;

type Users = Arc<RwLock<HashMap<usize, UnboundedSender<Message>>>>;
static NEXT_USERID: AtomicUsize = AtomicUsize::new(1);

#[derive(Serialize, Deserialize)]
struct Msg {
    message: String,
    uid: Option<usize>,
}

#[shuttle_runtime::main]
async fn main(#[shuttle_secrets::Secrets] secrets: SecretStore) -> shuttle_axum::ShuttleAxum {
    let secret = secrets.get("BEARER").unwrap_or("Bear".to_string());
    let router = router(secret).nest_service("/", ServeDir::new("static"));

    Ok(router.into())
}

fn router(secret: String) -> Router {
    let users = Users::default();

    Router::new()
        .route("/ws", get(ws_handler))
        .layer(Extension(users))
}

async fn ws_handler(ws: WebSocketUpgrade, Extension(state): Extension<Users>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(stream: WebSocket, state: Users) {
    let my_id = NEXT_USERID.fetch_add(1, Ordering::Relaxed);
    let (mut sender, mut reciever) = stream.split();
    sender
        .send(Message::Text("\"Hello world!\"".into()))
        .await
        .unwrap();

    let (tx, mut rx) = mpsc::unbounded_channel();
    state.write().await.insert(my_id, tx);

    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            sender.send(msg).await.expect("Error while sending message")
        }
        sender.close().await.unwrap();
    });

    while let Some(Ok(result)) = reciever.next().await {
        if let Ok(result) = enrich_result(result, my_id) {
            broadcast_msg(result, &state).await;
        }
    }
}

async fn broadcast_msg(msg: Message, users: &Users) {
    if let Message::Text(msg) = msg {
        for (&_uid, tx) in users.read().await.iter() {
            tx.send(Message::Text(msg.clone()))
                .expect("Failed to send message.");
        }
    }
}

fn enrich_result(result: Message, id: usize) -> Result<Message, serde_json::Error> {
    match result {
        Message::Text(msg) => {
            let mut msg: Msg = serde_json::from_str(&msg)?;
            msg.uid = Some(id);
            let msg = serde_json::to_string(&msg)?;
            Ok(Message::Text(msg))
        }
        _ => Ok(result),
    }
}
