# VCH-HaemLIS — Data dictionary and implementation notes

Haematology and Transfusion Section, Laboratory Department
Vila Central Hospital, Port Vila

---

## 1. What the three files are

| File | What it is | Who uses it |
|---|---|---|
| `vch_haemlis_schema.sql` | The database. PostgreSQL DDL: 45 tables, 5 views, seeded test dictionary, reference intervals, critical limits, delta and reflex rules. | Whoever installs and maintains the server |
| `VCH_HaemLIS.jsx` | The working system. Register → order → collect → result → validate → report, plus QC and audit. Runs standalone, keeps its data between sessions. | The bench |
| `DATA_DICTIONARY.md` | This file. Field meanings, the reference intervals used, and the decisions behind them. | Quality manager, auditors, the next developer |

---

## 2. The one design decision that matters

Numeric results do **not** get a column each. They go into a single `result` table, one row per
analyte per specimen, keyed by `analyte_code`. Adding a new test is one `INSERT` into `analyte`
plus its `reference_interval` rows — no migration, no downtime, no new form to code.

That is what makes the data set effectively unbounded. Everything below is seed content, not a
ceiling.

Examinations that are not numeric observations — the blood film, the malaria slide, the bone marrow,
the crossmatch — get their own typed tables, because their fields have to be queryable for
surveillance and traceability reporting, and squeezing them into a name/value pair would destroy that.

---

## 3. Analyte catalogue

Section codes: **HAEM** general haematology · **COAG** coagulation · **MORPH** morphology ·
**MALARIA** blood parasites · **BB** transfusion.

### 3.1 Full blood count

| Code | Name | Unit | LOINC | Adult interval | Critical |
|---|---|---|---|---|---|
| WBC | White cell count | ×10⁹/L | 6690-2 | 4.0–11.0 | ≤1.0 / ≥50 |
| RBC | Red cell count | ×10¹²/L | 789-8 | M 4.5–6.5 · F 3.8–5.8 | |
| HGB | Haemoglobin | g/L | 718-7 | M 130–180 · F 115–165 | ≤70 / ≥200 |
| HCT | Haematocrit | L/L | 4544-3 | M 0.40–0.54 · F 0.36–0.47 | ≤0.20 / ≥0.60 |
| MCV | Mean cell volume | fL | 787-2 | 80–100 | *calculated* HCT/RBC×1000 |
| MCH | Mean cell haemoglobin | pg | 785-6 | 27–32 | *calculated* HGB/RBC |
| MCHC | Mean cell Hb concentration | g/L | 786-4 | 320–360 | *calculated* HGB/HCT |
| RDW_CV | Red cell distribution width | % | 788-0 | 11.5–14.5 | |
| RDW_SD | Red cell distribution width | fL | 21000-5 | 37–54 | |
| PLT | Platelet count | ×10⁹/L | 777-3 | 150–400 | ≤20 / ≥1000 |
| MPV | Mean platelet volume | fL | 32623-1 | 7.5–11.5 | |
| PDW | Platelet distribution width | fL | 32207-3 | 9–17 | |
| PCT | Plateletcrit | % | — | 0.17–0.35 | |

### 3.2 Differential

Percentages are entered; absolutes are calculated as `WBC × pct / 100`. The system will not release
a differential whose parts do not add to 100 ± 1%.

| Code | Name | Unit | LOINC | Adult interval | Critical |
|---|---|---|---|---|---|
| NEUT_PCT / NEUT_ABS | Neutrophils | % · ×10⁹/L | 770-8 · 751-8 | 40–75% · 2.0–7.5 | ≤0.5 absolute |
| LYMPH_PCT / LYMPH_ABS | Lymphocytes | % · ×10⁹/L | 736-9 · 731-0 | 20–45% · 1.0–4.0 | |
| MONO_PCT / MONO_ABS | Monocytes | % · ×10⁹/L | 5905-5 · 742-7 | 2–10% · 0.2–0.8 | |
| EOS_PCT / EOS_ABS | Eosinophils | % · ×10⁹/L | 713-8 · 711-2 | 0–6% · 0.04–0.40 | |
| BASO_PCT / BASO_ABS | Basophils | % · ×10⁹/L | 706-2 · 704-7 | 0–2% · 0.01–0.10 | |
| IG_PCT | Immature granulocytes | % | 71695-1 | 0–0.6 | |
| NRBC_PCT | Nucleated red cells | /100 WBC | 19048-8 | 0 beyond the neonatal period | |
| BLAST_PCT | Blasts | % | — | 0 | any blast is critical |
| ATYP_PCT | Atypical lymphocytes | % | — | 0 | |

Absolute counts are what the clinician acts on; percentages alone are misleading when the white cell
count is abnormal. Both are reported.

### 3.3 Reticulocytes, ESR

| Code | Name | Unit | Adult interval |
|---|---|---|---|
| RET_PCT | Reticulocytes | % | 0.5–2.5 |
| RET_ABS | Reticulocytes absolute | ×10⁹/L | 20–100 *(calculated RBC × Ret% × 10)* |
| IRF | Immature reticulocyte fraction | % | 2–12 |
| RET_HE | Reticulocyte Hb equivalent | pg | 28–36 |
| ESR | ESR, Westergren | mm/h | M 0–15 · F 0–20 · child 0–10 |

### 3.4 Coagulation

| Code | Name | Unit | LOINC | Interval | Critical |
|---|---|---|---|---|---|
| PT | Prothrombin time | s | 5902-2 | 11–14 | |
| INR | INR | — | 6301-6 | 0.8–1.2 untreated | ≥5.0 |
| APTT | APTT | s | 14979-9 | 25–38 | ≥100 |
| TT | Thrombin time | s | 3243-3 | 14–19 | |
| FIB | Fibrinogen, Clauss | g/L | 3255-7 | 2.0–4.0 | ≤1.0 |
| DDIMER | D-dimer | mg/L FEU | 48065-7 | <0.5 | |

PT and APTT intervals are reagent and instrument specific. These are placeholders — replace them
with locally derived values before go-live, and record the derivation in `reference_interval.source_reference`.

### 3.5 Paediatric and neonatal intervals

Age bands are stored in days so one analyte carries a full ladder. Haemoglobin, the one that matters
most:

| Age | Hb g/L |
|---|---|
| Day 0–1 | 145–225 |
| Day 2–14 | 135–215 |
| 2 weeks – 2 months | 100–180 *(physiological nadir)* |
| 2–12 months | 95–130 |
| 1–6 years | 105–135 |
| 6–12 years | 115–145 |
| Adult male / female | 130–180 / 115–165 |

Applying adult ranges to a newborn misclassifies almost every sample. The system chooses the band
from age at **collection**, not age today.

---

## 4. Malaria examination

The highest-volume urgent test in the section, and the one with the most structure.

| Field | Notes |
|---|---|
| `method` | Thick and thin Giemsa films, rapid test, or both |
| `species`, `second_species` | falciparum, vivax, malariae, ovale, knowlesi, mixed, undetermined, none seen |
| `parasites_counted`, `wbc_counted` | Count asexual parasites against 200 white cells; continue to 500 if fewer than 100 parasites are seen |
| `wbc_used_for_calc` | The patient's own WBC where available, otherwise an assumed 8.0 ×10⁹/L |
| `parasite_density` | `parasites ÷ WBC counted × WBC used × 1000`, reported per µL — calculated automatically |
| `parasitaemia_pct` | Percentage of parasitised red cells from the thin film, minimum 1000 red cells |
| `gametocytes` | Not included in the count, but always reported |
| `fields_examined` | 100 fields before a negative is issued |
| `hyperparasitaemia` | Flagged at ≥100 000/µL — treat as severe malaria, telephone immediately |
| `slide_archive_ref`, `cross_checked_by` | Slides retained for programme cross-checking |
| `notified_program` | Notifiable result; feeds `v_malaria_surveillance` with island, village and age |

Only asexual stages are counted. In a mixed infection the count applies to *P. falciparum*.

---

## 5. Blood film

Red cell morphology is graded 0 / 1+ / 2+ / 3+ / 4+ rather than described in free text, so that
findings can be trended and audited. `numeric_rank` on the coded value lets "2+" be plotted.

Fields carried: size, chromia, anisocytosis, poikilocytosis, target cells, **ovalocytes**,
elliptocytes, spherocytes, schistocytes, sickle cells, tear drop cells, acanthocytes, echinocytes,
stomatocytes, basophilic stippling, Howell-Jolly bodies, Pappenheimer bodies, rouleaux,
agglutination, polychromasia, nucleated red cells; left shift, toxic granulation, Döhle bodies,
vacuolation, hypersegmentation, Pelger-Huët, atypical lymphocytes, blasts, Auer rods, hairy cells;
platelet numbers, giant platelets, clumps; malaria, **microfilariae**, other parasites.

Ovalocytes and microfilariae are on the form for local reasons. South-East Asian ovalocytosis is a
Melanesian red cell polymorphism and turns up on films here; night-blood microfilaria examination
remains part of the repertoire.

`film_conclusion` is mandatory — it is the sentence the clinician actually reads.

---

## 6. Special haematology

G6PD deficiency runs at about **6.8% of males** across Vanuatu, varying from 0% to 39% between
islands and tracking malaria transmission. It causes neonatal jaundice and drug-induced haemolysis,
which is why it is on the standing patient-flag list and why the form carries the caution that
screening is unreliable during or shortly after an acute haemolytic episode.

Alpha thalassaemia is also common locally, so a microcytic hypochromic picture here is not
automatically iron deficiency — the canned comment says exactly that.

Fields: sickling and solubility, Hb electrophoresis pattern with HbA / A2 / F / S / E percentages,
G6PD method, result and activity, Heinz bodies, osmotic fragility, interpretation.

---

## 7. Transfusion

Full vein-to-vein traceability, retained 30 years.

`blood_donor` → `donation` (with TTI screening as an explicit release gate) → `blood_unit` →
`crossmatch` → `unit_issue` → `transfusion_episode` → `transfusion_reaction`.

Safety rules the schema enforces or supports:

- Two independent ABO determinations before a first transfusion (`is_confirmatory`).
- Forward and reverse grouping reactions stored separately, so a discrepancy is visible rather than
  hidden behind an interpretation.
- Two-person check on grouping and crossmatch (`performed_by` **and** `checked_by`).
- Antibody screens carry `valid_until` — 72 hours where the patient has been transfused or pregnant
  in the last three months.
- Emergency uncrossmatched group O issue is recorded as such, with the authorising name.
- Unit fate is recorded even when the unit comes back: transfused, returned fit for reissue, or wasted.
- `fridge_temperature_log` covers cold-chain evidence.

Reaction records capture type, severity, imputability and the investigation conclusion, which is what
a hospital transfusion committee needs.

---

## 8. Rules that fire automatically

**Delta checks** — a result that moves too far too fast is held for review, not released.

| Analyte | Window | Trigger |
|---|---|---|
| HGB | 72 h | ±20 g/L or 20% |
| WBC | 72 h | 50% |
| PLT | 72 h | 50% |
| MCV | 30 d | 5 fL *(comment only)* |
| INR | 48 h | 1.5 |

**Reflex tests** — added to the request without anyone remembering to:

| Trigger | Adds | Why |
|---|---|---|
| PLT < 100 | Blood film | Confirm, and exclude platelet clumping |
| PLT < 100 | Malaria screen | Thrombocytopenia with fever is malaria or dengue until proven otherwise |
| WBC > 30 or < 2 | Blood film | Review the picture |
| HGB < 70 | Reticulocytes | Classify the marrow response |
| MCV < 70 | Blood film | Iron deficiency versus thalassaemia trait |

**Critical results** are not simply flagged. They generate a `critical_notification` row that stays
open until someone records who was told, when, and that the read-back was confirmed.
`minutes_to_notify` is the KPI.

---

## 9. Turnaround targets

| Panel | Routine | Urgent |
|---|---|---|
| Malaria parasites | 60 min | 30 min |
| CSF cell count | 60 min | 30 min |
| Full blood count | 4 h | 1 h |
| Group and screen | 2 h | 45 min |
| Crossmatch | 3 h | 45 min |
| Coagulation screen | 4 h | 1 h |
| Blood film | 8 h | 2 h |
| G6PD | 12 h | — |

`v_turnaround` splits each request into order → collect → receive → result → release, so a delay can
be attributed to the ward, transport, or the bench rather than argued about.

---

## 10. Quality control

`control_material` → `control_target` (assigned mean and SD, plus locally established mean and SD
after 20 runs) → `qc_result` with z-score and Westgard evaluation: 1-2s warning, 1-3s, 2-2s, R-4s,
4-1s, 10x. A rejected run sets `patient_results_held`.

`eqa_survey` and `eqa_result` cover external assessment, including WHO malaria slide panels.

---

## 11. Specimen retention

| Item | Retain |
|---|---|
| EDTA blood | 24–48 h at 2–8 °C |
| Citrate blood | 4 h |
| Transfusion samples | 7 days at 2–8 °C |
| Stained slides | 1 year (malaria slides per programme requirement) |
| Bone marrow slides | Indefinitely |
| Patient, request, result, report records | Indefinitely |
| Transfusion records | 30 years |
| Audit log | 10 years, append only |
| QC, EQA, maintenance | 5 years |

---

## 12. Before this goes live

1. **Verify every reference interval** against the local population and the instruments actually in
   use. The seeded values are widely used defaults, and `verified_on` is deliberately NULL until the
   laboratory signs each one off. This is an ISO 15189 requirement, not a formality — coagulation
   intervals in particular are reagent specific.
2. **Agree the critical result list** with the medical staff, and agree who may be telephoned out of
   hours.
3. **Decide the assumed white cell count** for malaria density when the patient's own count is not
   available. 8.0 ×10⁹/L is the common convention; confirm it locally.
4. **Set the accession number format** and whether it restarts each year.
5. **Populate wards, clinicians and instruments** — the seed data covers facilities and specimen
   types only.
6. **Plan for power and connectivity.** Cyclone season is the real availability test. Whatever
   database backs this needs an offline mode at the bench and a documented paper fallback, and
   backups need to leave the building.
