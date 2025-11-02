# Bridging Worlds Virtual Farm Prototype

This directory contains presentation assets for a lightweight "virtual world" layer built on top of the coordinator/worker APIs.

## Goals
- Visualise coordinator state (tasks, workers, trust) as interactive farm plots.
- Drive the same REST and P2P contracts already used by Rust workers.
- Provide a stage-ready demo with minimal setup (static web app + REST proxy).

## Structure
- `prototype/` – static web scene using Three.js. It renders the farm, lets you walk around in first-person, and calls the coordinator endpoints to claim/complete jobs in-world.
- `prototype/assets/` – placeholder textures/models (SVG/PNG) for plots, avatars, and UI badges.
- `scripts/` – utilities to seed tasks or replay demo flows (to be added).

## Running the Prototype (local)
1. Start the Go coordinator (port 8080). The web experience registers itself as `virtual-presenter` and signs submissions client-side.
2. Populate some diverse tasks: `curl -X POST http://127.0.0.1:8080/generate_tasks`.
3. Serve the prototype directory (any static server, e.g. `npx serve world/prototype`).
4. Open the served URL; the scene auto-loads task plots from `/tasks_overview`.
5. Click “Enter Farm” to lock the pointer, then use `WASD` to walk. Stand on a field (green tile) and press `E` to request and submit a job; the UI fires `/get_task` and `/submit_result` with a real Ed25519 signature forged in-browser via TweetNaCl.
6. Visit the purple shop hut to open the Compute Coop console: inspect balances, spawn classic workloads, or plant themed script jobs by typing `print(5 + 6)` and watching the farm earn tokens in real time.

> NOTE: Cross-origin requests are expected. For local demos either run the static server with CORS enabled (see `prototype/main.js`) or reverse-proxy through the coordinator.

## Next Steps
- Hook up libp2p gossip to drive in-world "courier drones" broadcasting peer completions.
- Replace placeholder boxes with stylised assets (barn, solar rigs, AR overlays).
- Multi-user avatars (WebRTC) mapped to real worker nodes for collaborative demos.
