# Demo acceptance record

Executed 14 October 2026 against `submission-demo` implementation checkpoint `6ff0ecd4a6bfd731a6a0e96702f0f2a2c6e0e4b7`. Documentation commits follow that checkpoint. Python 3.12.14 and Node 24.19.0 were used. Core dependency versions are recorded in `backend/requirements.txt` and `backend/demo/profile_metadata.json`.

**Implementation checks passed. Full browser and visual acceptance remain not run.** Chromium exited before opening a page in the execution environment, including after a successful browser download. Mounted React checks used JSDOM, the actual bundled application, and a real local backend. They verify rendered text, selections, events and data refresh; they do not verify browser layout, drawing, scrolling or touch behavior.

## Executed checks

| Check                                          | Result                              | Evidence                                                                                                                                                                                                         |
| ---------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend startup and health                     | PASS                                | Started Uvicorn; requested `/health` and `/today` over HTTP. Model ready; default saved Ridge estimate 12.283977230352809.                                                                                       |
| Frontend startup                               | PASS                                | `npm ci`; `npm run dev -- --host 127.0.0.1`; Vite served HTTP on 8443. Default all-interface startup encounters an environment network-interface error; the documented loopback command works.                   |
| Clean Python setup                             | PASS                                | Created a fresh virtual environment; installed only `backend/requirements-dev.txt`; reran preparation and all eight tests successfully.                                                                          |
| Historical profile and calibration separation  | PASS                                | Participant 5; first 60 rows, 53 fitted samples, calibration ends 15 April; all ten replay dates are later. Dataset hash recorded.                                                                               |
| Prediction provenance                          | PASS                                | Compared API estimates directly with `estimate_stress()` using the saved fitted model. No V1, template or constant-score path remains.                                                                           |
| Check-in and refresh                           | PASS                                | Mounted React: submitted 8 / 10 and Study tag; confirmation and 80 / 100 comparison appeared. Today and Trends refreshed.                                                                                        |
| Stable estimate and preserved historical value | PASS                                | API and mounted React checks: submitting check-ins changes only reported stress/comparison; original label and estimate remain.                                                                                  |
| Persistence after actual process restart       | PASS                                | Submitted override, terminated Uvicorn, started a new Uvicorn process with the same state file; override remained. Reset restored original state.                                                                |
| Trends                                         | PASS, data/DOM                      | All ten source dates returned; selected override marked with original value; both series normalised to 0–100. Missing predictions remain null and SVG segments stop at gaps. Full browser SVG rendering not run. |
| Measurements used                              | PASS, data/DOM                      | Actual default inputs displayed; missing inputs display Unavailable; test with a missing sleep score confirmed explicit calibration-median imputation. Earlier-only HRV history used.                            |
| Five synthetic cases                           | PASS                                | All four expected comparison states plus null missing-data comparison; each labels fixture provenance. Tested API and mounted React selection.                                                                   |
| Mode isolation                                 | PASS                                | API historical series unchanged after fixtures; mounted React shows read-only synthetic check-in and excludes fixtures from Trends.                                                                              |
| Invalid input                                  | PASS                                | -1, 11, 2.5, string, boolean and null values rejected with 422.                                                                                                                                                  |
| Missing model                                  | PASS, API/DOM                       | Absent model file: health reports unavailable; estimate and comparison null. Mounted React displays explicit model-unavailable text and no invented estimate.                                                    |
| Missing measurements                           | PASS                                | All raw measurements absent: null estimate, insufficient-data status and no comparison. Historical missing-data date checked in mounted React.                                                                   |
| Backend unavailable                            | PASS, simulated DOM network failure | Refused frontend fetches: understandable connection error appeared. Restoring requests and clicking Retry recovered. Actual browser with backend stopped remains in checklist below.                             |
| Reset                                          | PASS                                | API clears overrides without modifying model; mounted React restores historical mode, default date and original value.                                                                                           |
| Corrupt state                                  | PASS                                | Invalid saved JSON reported by health; further writes blocked; explicit reset restores usable state.                                                                                                             |
| Frontend production build                      | PASS                                | `npm run build`, Vite 8.2.2. Existing future-config warnings did not prevent the build.                                                                                                                          |
| TypeScript                                     | PASS                                | `npx tsc --noEmit`.                                                                                                                                                                                              |
| Whitespace verification                        | PASS                                | `git diff --check`.                                                                                                                                                                                              |
| Fresh state                                    | PASS                                | Verification used isolated state paths; reset returned original historical values. No runtime state is committed.                                                                                                |
| Full browser flow and visual QA                | NOT RUN                             | Chromium exited before page creation. No claim of visual/browser completion.                                                                                                                                     |

## Repeat automated checks

From repository root with the virtual environment active:

```bash
python -m pip install -r backend/requirements-dev.txt
python -m unittest backend.tests.test_demo -v
```

From `frontend/`:

```bash
npx tsc --noEmit
npm run build
```

The mounted React harness and process-restart harness were temporary verification tools. The committed backend tests provide repeatable unit/API coverage. Perform the following browser checks using only the startup commands in `DEMO_README.md`.

## Browser checks to complete before recording

These are **not marked passed** in this record.

1. Open `http://127.0.0.1:8443/` at about 420 × 900 pixels. Confirm selectors, navigation and content are readable; scroll through each screen.
2. Keep Historical replay and 21 April 2025 selected. Today must show approximately 12.3 / 100 and original reported stress 76 / 100. Confirm visible historical source/date and limitations.
3. Save a check-in of 2 with a Study tag. Confirm saved message, 2 / 10, aligned-low comparison and unchanged wearable estimate. Save 8 instead; confirm the opposite comparison and the same estimate.
4. Open Trends. Confirm actual date labels, an identifiable override, both series on 0–100 and visible gaps for 16–19 April. Inspect SVG chart rendering.
5. Open Measurements used. Confirm 30.4 ms HRV, sleep score 72 / 100 and 10,771 steps. Select 20 April; confirm missing HRV/sleep and median-imputation notes. Select 16 April; confirm Unavailable and no invented estimate.
6. Select all five synthetic scenarios. Confirm each source label and expected comparison. Confirm synthetic Check-in is read-only and synthetic Trends does not show historical records under a synthetic label.
7. Return to historical mode. Save an override; stop and restart Uvicorn. Confirm the selected date's saved check-in remains.
8. Stop Uvicorn, change the replay date and click Retry connection. Confirm an understandable error. Start Uvicorn and retry; confirm recovery.
9. Start Uvicorn with `MINDWATCH_MODEL_PATH` pointing to an absent file, using the exact platform-specific command in `DEMO_README.md`. Confirm no normal estimate/comparison. Restore the normal command.
10. Click Reset demo. Confirm original values, Historical replay, 21 April and Today return. Leave this default flow ready for recording.

## Remaining limitations

Historical timing/preprocessing limitations remain unresolved as directed by the implementation guide. The model is fixed and retrospective. The 50 / 100 threshold is a demonstration convention. Synthetic fixtures provide no accuracy evidence. Full browser and visual checks above must be completed before calling the demo fully accepted for recording.
