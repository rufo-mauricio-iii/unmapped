# UNMAPPED — Dataset Selection

Pre-flight reference for which real datasets we ingest, why, and which we explicitly skip. Driven by 7-hour build constraint + brief requirement to surface ≥2 econometric signals visibly with real (not synthetic) data.

---

## Recommendations

| Module | Primary | Secondary | Combined ingest |
|---|---|---|---|
| **M01 Skills Signal Engine** | **ESCO** v1.1.1 | **ISCO-08** | 45 min |
| **M02 AI Readiness Lens** | **Frey-Osborne 2013** | **ESCO skill-relations** | 30 min |
| **M03 Opportunity Matching** | **ILOSTAT** (`EAR_4MTH_SEX_OCU_NB`) | **WDI** sector indicators | 60 min |

Total ≈ 165 person-min across 3 parallel agents = ~60 wall-clock min.

---

## Per-dataset detail

### ESCO (European Skills, Competences, Occupations) — PRIMARY M01
- **What:** 3,008 occupations + 13,890 skills, mapped to ISCO-08, 28 languages incl. EN
- **Measures:** occupation → essential/optional skills graph; skill → skill relations
- **Format:** Bulk CSV bundle (~20 files zipped). EU PSI license, free reuse globally.
- **Auth:** None
- **Ghana/India coverage:** EU-built but ISCO-08 mapping makes it globally portable. No country-specific labor data — it's the taxonomy.
- **Example:** `occupation: software developer, conceptUri=..., iscoGroup=2512, essentialSkill: "use software design patterns"`
- **Why we picked it:** Only free, multilingual, ISCO-mapped skills graph. The skill-skill relations directly power M02's "adjacent resilient skills" output.
- **Source:** https://esco.ec.europa.eu/en/use-esco/download

### ISCO-08 — PRIMARY M01 (taxonomy spine)
- **What:** 436 unit groups in a 4-level hierarchy (10 major → 43 sub-major → 130 minor → 436 unit)
- **Measures:** code + title + definition + tasks list
- **Format:** Excel/CSV from ILO. Public domain.
- **Auth:** None
- **Ghana/India coverage:** Universal — both countries report labor stats against ISCO-08
- **Example:** `2512, Software developers, Research/analyse/evaluate requirements... design/develop/test...`
- **Why we picked it:** Non-negotiable. Without ISCO codes nothing joins to ILOSTAT, ESCO, or Frey-Osborne.
- **Source:** https://www.ilo.org/public/english/bureau/stat/isco/isco08/

### Frey-Osborne 2013 — PRIMARY M02
- **What:** 702 US SOC occupations × one automation probability column
- **Measures:** Probability (0–1) of computerization in next 1–2 decades
- **Format:** Appendix table from the Future of Employment paper, re-published as CSV on multiple GitHub mirrors
- **Auth:** None
- **Ghana/India coverage:** US-coded. Requires SOC→ISCO-08 crosswalk to map onto Ghana/India occupation data.
- **Example:**
  - `SOC=43-9021, Data Entry Keyers, probability=0.99`
  - `SOC=23-1011, Lawyers, probability=0.035`
- **Why we picked it:** Single 702-row CSV, ship-in-10-min. Methodology is pre-LLM and US-centric, but it's the canonical comparable score. We surface a disclaimer card on the risk panel. The brief rewards honesty about limitations.
- **Risk:** Outdated. Mitigation = context calibration factor in country config + visible "Methodology: Frey & Osborne 2013, US-occupation-coded, calibrated for Ghana low-infrastructure context (×0.85)."
- **Source:** Original paper appendix; mirrored CSV available widely.

### ILOSTAT — PRIMARY M03
- **What:** Labor statistics by country / year / sex / age / occupation (ISCO-08)
- **Measures we need:**
  - `EAR_4MTH_SEX_OCU_NB` — mean monthly earnings by occupation
  - `EMP_TEMP_SEX_OCU_NB` — employment by occupation (sector growth proxy)
  - `UNE_TUNE_SEX_AGE_NB` — youth unemployment
- **Format:** Bulk CSV per indicator (gzipped). SDMX API exists — we don't use it (pre-cache only).
- **Auth:** None
- **Ghana/India coverage:** Both. Ghana has gaps 2018–2022 in wage data; use 2-digit ISCO to avoid empty cells. India is solid via PLFS at 4-digit.
- **Example:** `ref_area=GHA, indicator=EAR_4MTH_SEX_OCU_NB, sex=SEX_T, classif1=OCU_ISCO08_2, time=2022, obs_value=2847.5` (monthly earnings GHS, ISCO 2-digit "Professionals")
- **Why we picked it:** Only source giving wages by ISCO occupation for both target countries.
- **Source:** https://ilostat.ilo.org/data/ → Bulk download portal

### WDI (World Bank World Development Indicators) — SECONDARY M03
- **What:** 1,500+ country-year indicators (macro: GDP, labor force, education enrollment, sector shares)
- **Measures we need:** sector employment shares, sector GDP growth, employment-to-population
- **Format:** Bulk CSV zip + JSON API
- **Auth:** None
- **Ghana/India coverage:** Full
- **Example:** `country=IND, indicator=SL.EMP.TOTL.SP.ZS, year=2023, value=49.7` (employment-to-population %)
- **Why we picked it:** Aggregates only — not occupation-level — but powers the country-context strip on cards: "Ghana: agriculture +3.2% CAGR, services +4.1%."
- **Source:** https://data.worldbank.org/

### SOC ↔ ISCO-08 crosswalk — JOIN UTILITY
- **What:** US Bureau of Labor Statistics crosswalk file
- **Why:** Required to map Frey-Osborne (SOC) onto ESCO + ILOSTAT (ISCO).
- **Format:** Excel/CSV, free
- **Effort:** 15 min
- **Source:** https://www.bls.gov/soc/soccrosswalks.htm

---

## Trade-offs we resolved

### ESCO vs O*NET vs ISCO for skills taxonomy
- **ISCO** = codes only. Required as spine.
- **ESCO** = codes + skills graph + ISCO-mapped + multilingual + free. Best dual-use for M01 and M02.
- **O*NET** = richer numerical skill scores but US-SOC native (extra crosswalk tax). Stretch goal only.
- **Decision:** ESCO + ISCO. O*NET only if ESCO descriptions feel too sparse by 13:00.

### Frey-Osborne vs WB STEP vs ILO indices for automation risk
- **Frey-Osborne**: outdated, US-coded, but a single CSV, demo-legible, 10-min ingest.
- **WB STEP**: task-level (better methodology) but registration-walled and **India is missing entirely**.
- **ILO automation indices**: no clean downloadable file — methodology lives in PDF reports.
- **Decision:** Frey-Osborne with disclaimer card + context calibration factor.

### ILOSTAT vs WDI for wages
- **ILOSTAT**: occupation-level wages. This is what M03 cards need.
- **WDI**: aggregate macro only. Country-context strip.
- **Decision:** Both, different jobs.

### API vs bulk CSV
- **Decision:** All 5 sources offer bulk CSV. Pre-cache at session start. Zero live API calls during demo. Demo fragility is the #1 hackathon killer.

---

## Skip list

| Dataset | Reason |
|---|---|
| **WB STEP Skills Measurement** | Registration friction + India missing |
| **WB Enterprise Surveys** | Registration friction, weak signal |
| **WB Global Labor Database** | Registration, redundant with ILOSTAT |
| **Worldwide Governance Indicators** | No fit to any module |
| **Wittgenstein Centre education projections** | Nice-to-have country-context fluff; cut for time |
| **UN Population Projections** | Optional — only if we want a "youth cohort size" stat |
| **UNESCO UIS** | Education context, weak fit, time cost |
| **Global Findex** | Financial inclusion focus, weak fit |
| **WB Human Capital Index** | Country-level single score, low signal density |
| **ITU Digital Development** | Only if we build a digital-opportunities filter |
| **ILO Future of Work** | Not a distinct dataset — already in ILOSTAT |

---

## Coverage caveats

- **Ghana ILOSTAT wage data is thin** for 2018–2022. Use 2-digit ISCO (10 major + 43 sub-major groups) instead of 4-digit unit groups to avoid empty cells.
- **India ILOSTAT data is solid** via PLFS (Periodic Labour Force Survey). 4-digit available.
- **Frey-Osborne is US-coded.** Every probability we surface goes through the SOC→ISCO crosswalk. Some occupations don't crosswalk cleanly (informal economy roles especially) — fall back to nearest 3-digit ISCO group with a "calibrated estimate" note.

---

## Per-agent ingest plan

| Agent | Files to fetch + clean | Time |
|---|---|---|
| **A (M01)** | ISCO-08 Excel + ESCO CSV bundle + SOC↔ISCO crosswalk | 60 min |
| **B (M02)** | Frey-Osborne CSV + join to ISCO via crosswalk + ESCO skill-relations slice | 45 min |
| **C (M03)** | ILOSTAT (3 indicators filtered to GHA+IND) + WDI sector employment | 60 min |

All outputs land in `data/` per the structure in `SCOPE.md`. Each agent commits its raw download + cleaned derivative.
