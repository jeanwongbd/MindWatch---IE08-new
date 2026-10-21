# MindWatch submission demo

Branch: `submission-demo`, based on `backend-dev` at `d6e6c5a177766c457ef943769c2ddf757d79409e`.
Frozen implementation checkpoint: `6ff0ecd4a6bfd731a6a0e96702f0f2a2c6e0e4b7`.
Later commits document acceptance checks. Use `git rev-parse HEAD` to identify the current documentation checkpoint.

This is a local React/Vite **web prototype**, suitable for a phone-sized desktop viewport. It is not a completed native mobile app. One saved personal Ridge model generates estimates for historical SSAQS records. Five separate synthetic fixtures demonstrate comparison states.

## Setup

Use Python 3.12 (tested), Node 22.12+ or Node 24, and npm. Run these commands from the repository root. The existing npm lock file and Vite toolchain are retained.

```bash
git clone https://github.com/bakai-work07/mindwatch-dupe.git
cd mindwatch-dupe
git switch submission-demo
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m backend.scripts.prepare_demo_profile
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1` instead of `source .venv/bin/activate`.

The fitted model and prepared JSON files are committed. Preparation is reproducible and explicitly invoked; the backend never trains automatically. Preparation rewrites only the three generated model/profile outputs. It never changes the source CSV or editable check-ins.

In a second terminal:

```bash
cd mindwatch-dupe/frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open **http://127.0.0.1:8443/**. The loopback flag avoids a network-interface enumeration error in the verification environment. The backend URL defaults to `http://localhost:8000`. To change it, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL`, then restart Vite. The documented flow uses a desktop browser. No LAN setup is needed.

The backend must run from the repository root. Its artifact and state paths are resolved from `backend/main.py`, independent of the current directory once the module can be imported. Use one Uvicorn worker; the JSON state store is designed for one process.

## Profile and data separation

| Item | Value |
| --- | --- |
| Profile | `demo_p05`, participant 5 |
| Calibration | 14 February–15 April 2025; first 60 dated rows |
| Valid fitted samples | 53 |
| Replay | 16–25 April 2025; ten later labelled records |
| Default date | 21 April 2025; first replay date with all three raw inputs |
| Model | Personal Ridge V2, alpha 100 |
| Inputs | HRV RMSSD, sleep score, recorded steps, deviation from earlier HRV mean |
| Source | `data/processed/daily_model_v2.csv`, copied byte-for-byte from `yifan-ml` |
| Dataset SHA-256 | `fa57f4b219c58475eeec40945a669232079d9daead949b755a138d2901bfdfe4` |

Replay labels never enter training. Each record's HRV history contains only earlier dated values, including earlier replay measurements when available. The current HRV is not appended before inference. No editable check-in changes the model.

The first four replay dates have no wearable inputs and return `insufficient_data`. They remain gaps in Trends. On 20 April only steps are available; calibration medians fill the other model inputs. Measurements used displays missing raw inputs as Unavailable and identifies median imputation. The default complete record gives an estimate of approximately 12.284 / 100 with the committed model; its historical reported stress is 76 / 100. This example demonstrates the calculation, not model accuracy.

## Demonstration flow

1. Start both services. `/health` must report `model_ready: true`.
2. Keep Historical replay and 21 April selected. Today shows the saved Ridge estimate and the original reported stress.
3. Open Measurements used. Check HRV about 30.4 ms, sleep score 72 / 100 and 10,771 steps.
4. Open Check-in. Submit an integer from 0 to 10 with optional tags. Today refreshes and confirms the save. The estimate stays fixed. A check-in of 2 makes the comparison aligned low; a check-in of 8 makes reported stress higher than the estimate.
5. Open Trends. Both series use 0–100. The selected override is marked; the original historical stress remains available.
6. Select another date. The shared selection applies to Today, Check-in and Measurements used.
7. Switch to Synthetic scenario. Select each fixture below. The check-in is read-only and Trends explicitly excludes fixtures.
8. Switch back to historical mode. Stop and restart the backend. The saved check-in remains for its original selected date.
9. Click Reset demo. Overrides are cleared; historical mode, 21 April and Today are restored. Model and source data stay unchanged.

| Fixture | Estimate / 100 | Reported / 100 | Comparison |
| --- | ---: | ---: | --- |
| `aligned_low` | 25 | 20 | `aligned_low` |
| `aligned_high` | 75 | 80 | `aligned_high` |
| `estimate_high` | 75 | 20 | `estimate_high_reported_low` |
| `reported_high` | 25 | 80 | `estimate_low_reported_high` |
| `missing_wearable` | Unavailable | 40 | No comparison; insufficient data |

The comparison threshold is 50 / 100, a demonstration convention. It is not a validated clinical threshold. Historical SSAQS labels retain their 0–100 scale. Demo check-ins retain their 0–10 input scale and are multiplied by ten for comparison. Fixtures use `synthetic_fixture`, never a Ridge provenance claim.

## Persistence, API and failure checks

Editable state is stored in ignored `backend/runtime/demo_checkins.json`. Keys combine profile and historical date. Each saved item includes actual submission time and optional context tags. Writes use a temporary file and atomic replacement. Unreadable state is flagged by `/health` and blocks new writes until reset.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Service, model and persisted-state readiness |
| `GET /demo/config` | Profile metadata, dates, default and fixtures |
| `GET /today?mode=historical_replay&date=2025-04-21` | Canonical selected historical record |
| `GET /today?mode=synthetic_scenario&scenario=aligned_low` | Isolated fixture |
| `GET /trends` | Historical series with marked overrides |
| `POST /checkin` | JSON: date, integer stress 0–10, optional context_tags |
| `POST /demo/reset` | Clear overrides and return default date |

`MINDWATCH_MODEL_PATH` overrides the model path for a missing-model check. `MINDWATCH_STATE_PATH` overrides the editable state path for isolated verification. Both default to the documented backend paths.

```bash
# Stop the normal backend first. Missing model must produce null estimates.
MINDWATCH_MODEL_PATH=/tmp/mindwatch-absent.joblib python -m uvicorn backend.main:app --port 8000
```

Restore normal startup afterward. In PowerShell use `$env:MINDWATCH_MODEL_PATH = 'C:\absent-model.joblib'`; remove it afterward with `Remove-Item Env:MINDWATCH_MODEL_PATH`.

## Verification

From the repository root, with the virtual environment active:

```bash
python -m pip install -r backend/requirements-dev.txt
python -m unittest backend.tests.test_demo -v
```

From `frontend/`:

```bash
npx tsc --noEmit
npm run build
```

See `DEMO_ACCEPTANCE.md` for checks actually run and browser checks still required. All eight focused backend tests, the production build, TypeScript, mounted React DOM checks, actual HTTP startup and actual backend-process restart passed. Full browser interaction and visual QA could not run because Chromium exited before opening a page in this environment. Do the short browser checklist before recording.

## Limitations to retain in the submission

- This replays historical daily records with unresolved source timing. Some full-day measurements occur after a check-in. The shared preprocessing script does not reproducibly generate this ML table. This implementation does not repair the research pipeline.
- The Ridge output estimates self-reported stress from wearable inputs. It does not independently measure body load, physical recovery or sympathetic activation.
- Synthetic fixtures are interface examples. They are excluded from calibration, historical trends and performance claims.
- The prior recorded V2 evaluation reported mean participant MAE 17.243 versus 17.547 for the personal-average baseline: an improvement of 0.304 / 100, with 9 of 14 participants improving. These are existing research results from the guide; this demo did not rerun or validate that evaluation.
- There is no live Fitbit connection, authentication, cloud hosting, multi-user support or native mobile rebuild.

## Transfer to the original repository

Use your authorized account. Review newer upstream changes before merging. Do not mirror or force-push.

```bash
git remote add upstream https://github.com/JacobSong1/MindWatch-IE08.git
git fetch upstream
git push upstream submission-demo
```

If `upstream` already exists, inspect and reuse its URL. Open a pull request into the original `backend-dev` branch. The implementation preserves the mirror's original history and unrelated files.
