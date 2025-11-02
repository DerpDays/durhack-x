# Bridging Worlds — Seer Experience

This directory now contains the **Seer** presentation: a tarot-inspired kiosk that drives the same coordinator/worker APIs used by the Rust client. The previous 3D farm prototype has been retired in favour of this focused story-driven UI.

## Structure

- `seer/`
  - `index.html` – three-card interface (fate reading, job request, job assistance).
  - `style.css` – glassmorphism / neon CSS skin.
  - `main.js` – client logic (registration, Ed25519 signing, API calls).
- `prototype/` – legacy Three.js farm kept for reference but no longer the primary demo.

## Running the Seer Demo Locally

1. **Start the coordinator** on an open port (default `8081`):
   ```bash
   cd server
   COORDINATOR_ADDR=":8081" GOCACHE=$(pwd)/.gocache go run .
   ```
   The service exposes REST endpoints (`/seer/predict`, `/create_task`, `/get_task`, `/submit_result`, etc.) with CORS enabled.

2. **Serve the Seer UI:**
   ```bash
   npx serve world/seer --cors
   ```
   Any static server will work as long as it forwards CORS.

3. **Open the experience** in your browser:
   - Enter the coordinator URL (defaults to `http://127.0.0.1:8081`) and click **Connect**.
   - Each card triggers the coordinator:
     - **Threads of Fate** → `POST /seer/predict` returns risk, years remaining, and a probable cause of death. The client signs nothing for this request.
     - **Invoke the Seer** → `POST /create_task` seeds workloads (basic math or `script_eval`).
     - **Aid the Seer** → `GET /get_task` + signed `POST /submit_result`. The UI auto-computes simple tasks, registers a worker, signs the result with TweetNaCl, and submits it.

4. **Explore**: tweak age/city/country/ethnicity to change the predicted cause; queue script jobs (`print(3 + 4)`) and claim them from the aid card to watch tokens accrue.

> Tip: from a second machine, expose the coordinator on a reachable host/IP, serve the Seer, and connect using that address. CORS headers are already wildcarded.

## Notes for Presenters
- The Seer uses deterministic heuristics—not a real Kaggle model—to keep the demo local-only. Extend `SeerPredict` with your model if you want real inference.
- Every worker registration and submission uses an Ed25519 key pair stored in `localStorage` (`seer_ed25519`). Clear storage to rotate identities.
- The assist card is intentionally simple: it previews the computed output and submits immediately, mirroring the minimal Rust worker.

## Extending the Demo
- Swap `SeerPredict` for a live model server (REST/gRPC) and surface additional explanation fields in `renderFate`.
- Add bounty leaderboards or history to the UI by calling `/tasks_overview` and `/results` aggregates.
- Re-theme or resurrect the 3D farm by pointing it at the same coordinator if you need both experiences.
