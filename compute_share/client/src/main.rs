use anyhow::Result;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use clap::Parser;
use futures::prelude::*;
use libp2p::{
    core::upgrade,
    floodsub::{Floodsub, FloodsubEvent, Topic},
    identity::Keypair,
    mdns::{tokio::Behaviour as Mdns, Config as MdnsConfig, Event as MdnsEvent},
    noise,
    swarm::{NetworkBehaviour, Swarm, SwarmEvent},
    tcp::{tokio::Transport as TokioTcpTransport, Config as TcpConfig},
    yamux::Config as YamuxConfig,
    PeerId, Transport,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{self, json, Value};
use tokio::{
    sync::mpsc,
    time::{sleep, Duration},
};
use tracing::{error, info};

// ---------------- CLI ----------------
#[derive(Parser, Debug)]
struct Args {
    #[arg(short, long, default_value = "http://127.0.0.1:8080")]
    coordinator: String,
    #[arg(short, long, default_value = "worker-node")]
    name: String,
}

const WORKER_CAPABILITIES: &[&str] = &["math:basic", "math:advanced", "analytics:vector"];

// ---------------- Data ----------------
fn default_kind() -> String {
    "arithmetic".to_string()
}

#[derive(Serialize, Deserialize, Debug)]
struct Task {
    id: String,
    operation: Operation,
    input: f64,
    price: Option<i64>,
    #[serde(default = "default_kind")]
    kind: String,
    #[serde(default)]
    payload: Value,
    #[serde(default)]
    required_capabilities: Vec<String>,
}

#[derive(Copy, Clone, Serialize, Deserialize, Debug)]
#[repr(u8)]
enum Operation {
    Square,
    Sqrt,
    Double,
    Factorial,
    VectorSum,
    Mean,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ResultData {
    id: String,
    worker: String,
    output: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<Value>,
}

// ---------------- P2P Behaviour ----------------
#[derive(NetworkBehaviour)]
#[behaviour(out_event = "WorkerEvent")]
struct WorkerBehaviour {
    floodsub: Floodsub,
    mdns: Mdns,
}

#[derive(Debug)]
enum WorkerEvent {
    Floodsub(FloodsubEvent),
    Mdns(MdnsEvent),
}

impl From<FloodsubEvent> for WorkerEvent {
    fn from(ev: FloodsubEvent) -> Self {
        WorkerEvent::Floodsub(ev)
    }
}
impl From<MdnsEvent> for WorkerEvent {
    fn from(ev: MdnsEvent) -> Self {
        WorkerEvent::Mdns(ev)
    }
}

// ---------------- Main ----------------
#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let args = Args::parse();
    let client = Client::new();

    // --- Keypair ---
    let keypair = Keypair::generate_ed25519();
    let pub_key = keypair
        .public()
        .try_into_ed25519()
        .map_err(|_| anyhow::anyhow!("Coordinator expects an ed25519 public key"))?;
    let pub_key_bytes = pub_key.to_bytes();
    info!("🔐 Using ed25519 public key: {} bytes", pub_key_bytes.len());
    let pub_key_b64 = STANDARD.encode(pub_key_bytes);

    // --- Register worker ---
    let reg_body = serde_json::json!({
        "worker_id": args.name,
        "pub_key": pub_key_b64,
        "capabilities": WORKER_CAPABILITIES
    });
    let res = client
        .post(format!("{}/register", args.coordinator))
        .json(&reg_body)
        .send()
        .await?;
    let status = res.status();
    if !status.is_success() {
        let txt = res.text().await.unwrap_or_default();
        error!("⚠️ Registration failed: {} {}", status, txt);
        return Err(anyhow::anyhow!("Registration failed"));
    }
    info!("✅ Registered with coordinator");

    // --- P2P Setup ---
    let local_peer_id = PeerId::from(keypair.public());
    let topic = Topic::new("compute-tasks");

    let behaviour = WorkerBehaviour {
        floodsub: Floodsub::new(local_peer_id.clone()),
        mdns: Mdns::new(MdnsConfig::default(), local_peer_id)?,
    };

    let tcp_transport = TokioTcpTransport::new(TcpConfig::default());
    let transport = tcp_transport
        .upgrade(upgrade::Version::V1)
        .authenticate(noise::Config::new(&keypair)?)
        .multiplex(YamuxConfig::default())
        .boxed();

    let mut swarm = Swarm::new(
        transport,
        behaviour,
        local_peer_id.clone(),
        libp2p::swarm::Config::with_tokio_executor(),
    );
    swarm.behaviour_mut().floodsub.subscribe(topic.clone());

    let (p2p_tx, mut p2p_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    // --- Spawn P2P loop ---
    let mut swarm_task = swarm;
    let topic_clone = topic.clone();
    let local_peer_id_clone = local_peer_id.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                swarm_event = swarm_task.select_next_some() => match swarm_event {
                SwarmEvent::Behaviour(WorkerEvent::Floodsub(FloodsubEvent::Message(msg))) => {
                    if let Ok((result, sig)) =
                        serde_json::from_slice::<(ResultData, String)>(&msg.data)
                    {
                        info!("🌐 Got peer result: {:?} (sig {})", result, sig);
                    }
                }
                SwarmEvent::Behaviour(WorkerEvent::Mdns(ev)) => match ev {
                    MdnsEvent::Discovered(peers) => {
                        for (peer, _addr) in peers {
                            swarm_task
                                .behaviour_mut()
                                .floodsub
                                .add_node_to_partial_view(peer);
                        }
                    }
                    MdnsEvent::Expired(peers) => {
                        for (peer, _addr) in peers {
                            swarm_task
                                .behaviour_mut()
                                .floodsub
                                .remove_node_from_partial_view(&peer);
                        }
                    }
                },
                _ => {}
            },
                Some(payload) = p2p_rx.recv() => {
                    swarm_task
                        .behaviour_mut()
                        .floodsub
                        .publish(topic_clone.clone(), payload);
                }
                else => {
                    info!("🛑 P2P loop ending for peer {}", local_peer_id_clone);
                    break;
                }
            };
        }
    });

    // --- Worker loop ---
    loop {
        if let Some(task) = get_task(&client, &args.coordinator, &args.name).await? {
            info!("📦 Got task: {:?}", task);
            let (output, metadata) = compute(&task);
            let result = ResultData {
                id: task.id.clone(),
                worker: args.name.clone(),
                output,
                kind: Some(task.kind.clone()),
                payload: metadata,
            };
            let signature = sign_result(&result, &keypair)?;
            let signature_b64 = STANDARD.encode(&signature);

            send_result(
                &client,
                &args.coordinator,
                &result,
                &signature_b64,
                &pub_key_b64,
            )
            .await?;

            let payload = serde_json::to_vec(&(result.clone(), signature_b64.clone()))?;
            if let Err(err) = p2p_tx.send(payload) {
                error!("Failed to publish result on P2P network: {}", err);
            }

            if let Ok(balance) = query_balance(&client, &args.coordinator, &args.name).await {
                info!("💰 Balance: trust={}, tokens={}", balance.0, balance.1);
            }
        } else {
            info!("⏳ No task available, sleeping...");
            sleep(Duration::from_secs(5)).await;
        }
    }
}

// ---------------- Compute ----------------
fn compute(task: &Task) -> (f64, Option<Value>) {
    match task.operation {
        Operation::Square => (task.input * task.input, None),
        Operation::Sqrt => (task.input.sqrt(), None),
        Operation::Double => (task.input * 2.0, None),
        Operation::Factorial => {
            let n = if task.input < 0.0 {
                0_u64
            } else {
                task.input.floor() as u64
            };
            let mut acc = 1.0_f64;
            for i in 2..=n {
                acc *= i as f64;
            }
            (acc, Some(json!({"n": n})))
        }
        Operation::VectorSum => {
            if let Some(values) = task.payload.get("values").and_then(|v| v.as_array()) {
                let mut sum = 0.0_f64;
                let mut min = f64::INFINITY;
                let mut max = f64::NEG_INFINITY;
                let mut count = 0_u64;
                for val in values {
                    if let Some(f) = val.as_f64() {
                        sum += f;
                        if f < min {
                            min = f;
                        }
                        if f > max {
                            max = f;
                        }
                        count += 1;
                    }
                }
                if count == 0 {
                    return (
                        task.input,
                        Some(json!({"warning": "vector_sum payload missing numeric values"})),
                    );
                }
                (
                    sum,
                    Some(json!({
                        "count": count,
                        "min": min,
                        "max": max,
                        "average": sum / count as f64
                    })),
                )
            } else {
                (
                    task.input,
                    Some(json!({"warning": "vector_sum payload missing"})),
                )
            }
        }
        Operation::Mean => {
            if let Some(values) = task.payload.get("values").and_then(|v| v.as_array()) {
                let mut sum = 0.0;
                let mut count = 0_u64;
                for val in values {
                    if let Some(f) = val.as_f64() {
                        sum += f;
                        count += 1;
                    }
                }
                if count == 0 {
                    return (
                        task.input,
                        Some(json!({"warning": "mean payload missing numeric values"})),
                    );
                }
                (sum / count as f64, Some(json!({"count": count})))
            } else {
                (task.input, Some(json!({"warning": "mean payload missing"})))
            }
        }
    }
}

// ---------------- Signing ----------------
#[derive(Serialize)]
struct SignaturePayload<'a> {
    id: &'a str,
    worker: &'a str,
    output: f64,
}

fn sign_result(result: &ResultData, keypair: &Keypair) -> Result<Vec<u8>> {
    let payload = SignaturePayload {
        id: &result.id,
        worker: &result.worker,
        output: result.output,
    };
    let msg = serde_json::to_vec(&payload)?;
    let sig = keypair.sign(&msg)?; // ✅ returns Vec<u8> now
    Ok(sig)
}

// ---------------- Coordinator API ----------------
async fn get_task(client: &Client, base_url: &str, worker_id: &str) -> Result<Option<Task>> {
    let res = client
        .get(format!("{}/get_task", base_url))
        .header("X-Worker-Id", worker_id)
        .send()
        .await?;
    let status = res.status();
    let txt = res.text().await.unwrap_or_default();
    if status.is_success() && !txt.trim().is_empty() {
        Ok(Some(serde_json::from_str(&txt)?))
    } else {
        Ok(None)
    }
}

async fn send_result(
    client: &Client,
    base_url: &str,
    result: &ResultData,
    signature_b64: &str,
    pub_key_b64: &str,
) -> Result<()> {
    let mut body = serde_json::json!({
        "id": result.id,
        "worker": result.worker,
        "output": result.output,
        "signature": signature_b64,
        "pub_key": pub_key_b64
    });
    if let serde_json::Value::Object(ref mut map) = body {
        if let Some(kind) = &result.kind {
            map.insert("kind".into(), serde_json::Value::String(kind.clone()));
        }
        if let Some(payload) = &result.payload {
            map.insert("payload".into(), payload.clone());
        }
    }
    let res = client
        .post(format!("{}/submit_result", base_url))
        .json(&body)
        .send()
        .await?;
    let status = res.status();
    let txt = res.text().await.unwrap_or_default();
    if status.is_success() {
        Ok(())
    } else {
        Err(anyhow::anyhow!("Submit failed: {} {}", status, txt))
    }
}

async fn query_balance(client: &Client, base_url: &str, worker_id: &str) -> Result<(i64, i64)> {
    let res = client
        .get(format!("{}/balance?worker={}", base_url, worker_id))
        .send()
        .await?;
    let status = res.status();
    let txt = res.text().await.unwrap_or_default();
    if status.is_success() {
        let v: serde_json::Value = serde_json::from_str(&txt)?;
        Ok((
            v["trust"].as_i64().unwrap_or(0),
            v["token"].as_i64().unwrap_or(0),
        ))
    } else {
        Err(anyhow::anyhow!("Balance failed: {} {}", status, txt))
    }
}
