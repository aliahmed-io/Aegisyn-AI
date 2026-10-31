# Aegisyn AI implementation notes

See README.md for current setup instructions, supported input columns, verification commands, and model limitations.

The website uses uploaded CSVs and the latest completed inference job. SQLite persists datasets, observations, incidents, notes, and job status. No synthetic observations are seeded at startup, and the browser never substitutes demo metrics when the backend is unavailable. Legacy demonstration rows are excluded from the active-data endpoints.

CSV uploads are bounded to 25 MB and 100,000 records, validated against the model feature schema, and stored under generated filenames. Binary labels and attack-category metadata are excluded from inference inputs. Predictions come from installed serialized models through predict_proba. Repeated analyses use distinct observation identifiers, and summaries select one completed job rather than combining historical runs.

The bundled models and their saved evaluation scores come from generated demonstration data. They have not been validated for real network detection. The application describes them accordingly. It does not claim named attack-family classification, live monitoring, network blocking, SHAP explanations, or physical meaning for sonar positions.

Prediction CSV exports include every observation from the latest completed job and escape spreadsheet formulas in uploaded textual fields. The interface reports save/upload/analysis failures rather than showing success. Display preferences persist in the browser and apply to the sonar; probability bands remain fixed at 0.40, 0.65, and 0.85, separately from the 0.50 classification threshold.

The supplied brand image is used at public/brand-mark.png and src/app/icon.png. The unused profile, notification badge, decorative status footer, duplicate Intelligence navigation, placeholder charts, simulated progress, and fake report downloads were removed.

The root route is the public landing page; /overview is the operational dashboard. The original generated sample is retained; a compact 64-flow demo with 40 model-flagged flows can be explicitly loaded from /datasets#demo. Demo analyses run the actual model and carry a provenance label; their results are never presented as real network captures.

The sonar now displays at most 40 stable, pseudo-randomly sampled observations without equal severity quotas. The compact generated demo covers all four probability bands without modifying model output scores. See README.md for the full page guide and current screenshots.

Suricata integration: a separate EVE store accepts validated JSON-lines alert/flow records and watches AEGISYN_EVE_PATH (default data/eve.json). Cursor checkpoints and deduplication persist in SQLite. The header source selector keeps CSV model analysis separate from sensor findings; active sensor pages refresh on record changes. Sensor probabilities are null, never synthesized, and sensor signatures/priorities are preserved. See README.md for connection and export instructions.
