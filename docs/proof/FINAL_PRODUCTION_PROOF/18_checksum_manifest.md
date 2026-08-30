# Phase 18 — Checksum Manifest (V3)

**Erstellt: 30.08.2026 — Vollständiges Dateiverzeichnis des Proof-Pakets**

## Regeln

- **Alle** Beweis-Dateien, proof.json und PDFs werden gehasht.
- **Nur** `SHA256SUMS.txt` ist ausgenommen (Selbstreferenz-Problem).
- `sha256sum -c SHA256SUMS.txt` muss mit **0 FAILED** bestehen.

---

## Dateiliste

| # | Datei | Größe (Bytes) | SHA-256 | Gehasht | Grund |
|---|-------|--------------|---------|---------|-------|
| 1 | `01_git_truth.md` | 1.043 | `7e13bcad...fd10f08e` | ✅ JA | Beweis-Datei |
| 2 | `02_deployment_truth.md` | 2.376 | `4e838411...b729067b` | ✅ JA | Beweis-Datei |
| 3 | `03_fresh_ci.md` | 2.461 | `cc93d166...b0876b99` | ✅ JA | Beweis-Datei |
| 4 | `04_production_db.md` | 3.574 | `f116b71c...9d0be7` | ✅ JA | Beweis-Datei |
| 5 | `05_security.md` | 1.762 | `1f7abf8c...1cfa7756` | ✅ JA | Beweis-Datei |
| 6 | `06_geldweg_e2e.md` | 2.530 | `0f781ed4...375ea77c` | ✅ JA | Beweis-Datei |
| 7 | `07_pflege_e2e.md` | 1.960 | `fb8ef1c9...51742a9f5` | ✅ JA | Beweis-Datei |
| 8 | `08_chairmatch_e2e.md` | 1.721 | `61ca69b8...ed4fbdd8` | ✅ JA | Beweis-Datei |
| 9 | `09_efy_care.md` | 3.813 | `84f655d3...0ff74f9e52` | ✅ JA | Beweis-Datei (V2) |
| 10 | `10_dipa.md` | 2.108 | `d411116b...354c37ecb636` | ✅ JA | Beweis-Datei |
| 11 | `11_secrets_env.md` | 2.297 | `c1c852a9...cfbe6f3c089a1` | ✅ JA | Beweis-Datei |
| 12 | `12_final_verdict.md` | 4.135 | `58fd30f5...128371c3e617d00d` | ✅ JA | Beweis-Datei (V2) |
| 13 | `13_dipa_regulatory_blocker.md` | 4.176 | `eb5b61c1...aca58bdaa91d6fa` | ✅ JA | Beweis-Datei |
| 14 | `14_finaler_status.md` | 5.161 | `972822141a...b8606e04b796cbd79` | ✅ JA | Beweis-Datei (V2) |
| 15 | `15_fresh_e2e.md` | 4.362 | `ceae3d87...ed4388ec57a6` | ✅ JA | Beweis-Datei |
| 16 | `16_deployment_identity.md` | 4.707 | `a30ebe23...eceab94ce1c21` | ✅ JA | V3 NEU |
| 17 | `17_production_smoke_tests.md` | 5.507 | `6680b800...e78ff65ae018ee9` | ✅ JA | V3 NEU |
| 18 | `18_checksum_manifest.md` | — | — | ✅ JA | V3 NEU (nach Erstellung gehasht) |
| 19 | `19_final_verdict_v3.md` | 5.548 | `a6deb8a1...b136db1f1effa03b169f86ea` | ✅ JA | V3 NEU |
| 20 | `MASTER_PRODUCTION_PROOF_AUDIT.pdf` | 47.895 | `629274fa...10ab9a997dbc058f` | ✅ JA | V1 PDF |
| 21 | `MASTER_PRODUCTION_PROOF_AUDIT_V2.pdf` | 51.644 | `fff210dc...5003866135ef6bc98f1d6499955e49432c` | ✅ JA | V2 PDF |
| 22 | `MASTER_PRODUCTION_PROOF_AUDIT_V3.pdf` | 51.088 | `15dc686d...f249a79b54e3e8f0` | ✅ JA | V3 PDF |
| 23 | `proof.json` | 3.528 | `f097922b...c8a122d4b366babd` | ✅ JA | Maschinenlesbar |
| 24 | `SHA256SUMS.txt` | — | — | ❌ NEIN | Selbstreferenz |

---

## Statistik

| Metrik | Wert |
|--------|------|
| Dateien gesamt | 24 |
| Davon gehasht | 23 |
| Nicht gehasht | 1 (SHA256SUMS.txt — Selbstreferenz) |
| Hash-Algorithmus | SHA-256 |
| Verifikationskommando | `sha256sum -c SHA256SUMS.txt` |
| Erwartetes Ergebnis | 23 OK, 0 FAILED |

---

## Vollständige SHA-256-Hashes

```
7e13bcad51e57ffd291ea0330eaadf8598cbc909f6957e7fc8ce4567fd10f08e  01_git_truth.md
4e838411be6a723190d7adef24b0deed834bdcafe5ca6741898d7d20b729067b  02_deployment_truth.md
cc93d1660f6b6521c50918106d22a86974deeae484617b81e80f0dd6b0876b99  03_fresh_ci.md
f116b71ca062739c304b411c8e4992ca9ddf7f7e732b34d1947f9a9d9a3d0be7  04_production_db.md
1f7abf8c4f5e311555de296b8391f64058e7bc0ec3961710f59ae1617cfa7756  05_security.md
0f781ed4a30d7aca3fb1784e10a73764ddfccd15539d7d5f12660553375ea77c  06_geldweg_e2e.md
fb8ef1c93423566700987eb7f1d9e6677526b2895a908e1a3f6a54351742a9f5  07_pflege_e2e.md
61ca69b895b7992a47728727c29b730bfe8cfc5c7d97627f7c1a5230ed4fbdd8  08_chairmatch_e2e.md
84f655d39a84070d489189f0c7ba8777630d42d5730481b5c5c4ed0ff74f9e52  09_efy_care.md
d411116b60b38930c6aaaaf05dd6fe574208165a7cf47cde6431354c37ecb636  10_dipa.md
c1c852a9aa6a9d7dfce8945f4a0a2ff2bc3dda5120e24f20267cfbe6f3c089a1  11_secrets_env.md
58fd30f5594599d9e62d2137883d80e586f73596d9e6ef58128371c3e617d00d  12_final_verdict.md
eb5b61c148729bebdd6d00b341facd2de60ec227987cf0226aca58bdaa91d6fa  13_dipa_regulatory_blocker.md
972822141ae906888b3ad10403c041516ecaaf9241deb22b8606e04b796cbd79  14_finaler_status.md
ceae3d874a57e5b1c899d4780eaae97803a76ce97c19d8352668ed4388ec57a6  15_fresh_e2e.md
a30ebe23614bb7eede733b490365cdf31093e5fd7936619b829eceab94ce1c21  16_deployment_identity.md
6680b800245185f88cabb7236e5f60e670be79e0a03226096e78ff65ae018ee9  17_production_smoke_tests.md
a6deb8a1f43510f31c6a2fdfbc357f26daf44969b136db1f1effa03b169f86ea  19_final_verdict_v3.md
629274fa3b24b1ef360e81cb57d364b1c9d4922a5caae80c10ab9a997dbc058f  MASTER_PRODUCTION_PROOF_AUDIT.pdf
fff210dc15a99ba738d376b65b41045003866135ef6bc98f1d6499955e49432c  MASTER_PRODUCTION_PROOF_AUDIT_V2.pdf
15dc686d26c846d62fbf485171a86f82b45d52534be4f5aef249a79b54e3e8f0  MASTER_PRODUCTION_PROOF_AUDIT_V3.pdf
f097922b43724d8158d967ae96e8f5fe229961b84c5d5a27c8a122d4b366babd  proof.json
```

(18_checksum_manifest.md Hash wird nach Erstellung in SHA256SUMS.txt ergänzt)

---

*V3 — 30.08.2026 — Vollständiges Manifest aller Proof-Dateien.*
