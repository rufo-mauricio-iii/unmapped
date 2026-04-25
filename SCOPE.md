# UNMAPPED — Scope & Plan

**Hackathon:** UNMAPPED Challenge 05 — World Bank Youth Summit (MIT Club of Northern California / MIT Club of Germany)
**Date:** 2026-04-25, 10:45 → 18:00 (7h15m)
**Team:** 3 Claude Code agents in parallel + 1 human orchestrator

---

## What we are building

A **configurable infrastructure layer** that turns young people's unmapped skills (informal experience, self-taught capabilities, education) into a portable profile, scores it for AI-driven displacement risk, and synthesizes it into ranked real-world opportunities for two distinct country contexts (Ghana + India), without code changes between contexts.

Anchor persona: **Amara**, 22, Ghanaian, multilingual, entrepreneurial, self-taught coder, invisible to formal credentialing systems.

---

## Modules — all 3, vertical slice ownership

We ship all three modules. Each is owned end-to-end by one agent (backend + frontend + integration). Module 03 has a hard kill-switch at 12:30 (see Risk Register).

### Module 01 — Skills Signal Engine *(Agent 1)*
- **Input:** free-text experience + structured fields (education level, languages, country)
- **Process:** Claude maps text → top-3 ISCO-08 occupation codes with confidence scores
- **Output:** portable `SkillsProfile` (human-readable, owned by user)
- **Surfaced signal #1:** ISCO-08 classification (Skills Taxonomy category)

### Module 02 — AI Readiness & Displacement Risk Lens *(Agent 2)*
- **Input:** ISCO codes from Module 01
- **Process:** Frey-Osborne lookup → automation probability; Claude generates 5 adjacent resilient skills calibrated to the active country context
- **Output:** `RiskScore` + adjacent skill chips
- **Surfaced signal #2:** Frey-Osborne automation probability (Automation & AI Readiness category)

### Module 03 — Opportunity Matching & Synthesis *(Agent 3)*
- **Input:** `SkillsProfile` + `RiskScore` + active country context
- **Process:** join against pre-cached `opportunities.json` (real ILOSTAT wages + WB WDI sector growth), rank by skill match × resilience score
- **Output:** ranked `Opportunity[]` with wage + growth visible per card; aggregate dashboard for policy view
- **Surfaced signal #3 (bonus):** ILOSTAT median wage + WB WDI sector growth per opportunity

**No live API calls.** Module 03 reads from static JSON committed under `data/contexts/{country}/opportunities.json`. Real data, pre-cached at the start of the day.

---

## File structure

```
unmapped/
├── README.md
├── SCOPE.md                            # this file
├── AGENTS.md                           # extends master rules
├── .env.example                        # ANTHROPIC_API_KEY only
├── .gitignore
├── package.json                        # workspace root
│
├── shared/                             # ORCHESTRATOR owns. Locked before agents start.
│   ├── api-contract.md                 # endpoint shapes + example payloads
│   ├── types.ts                        # SkillsProfile, IscoCode, RiskScore, Opportunity
│   ├── context-schema.json             # required fields in every country config
│   └── i18n-keys.json                  # canonical UI label keys
│
├── data/                               # static, real, committed
│   ├── isco-08/isco-08-codes.csv
│   ├── frey-osborne/automation-probabilities.csv
│   ├── esco-skills/skills.csv
│   └── contexts/
│       ├── ghana/
│       │   ├── config.json             # lang, calibration, label overrides
│       │   ├── opportunities.json      # ILOSTAT + WDI snapshot, ~50-100 occupations
│       │   └── sectors.json            # ISCO → sector mapping
│       └── india/
│           ├── config.json
│           ├── opportunities.json
│           └── sectors.json
│
├── backend/
│   ├── server.js                       # ORCHESTRATOR. Mounts each module router.
│   ├── lib/
│   │   ├── claude.js                   # ORCHESTRATOR. Shared Anthropic SDK wrapper.
│   │   └── context-loader.js           # ORCHESTRATOR. Reads data/contexts/.
│   └── modules/
│       ├── m01-skills/                 # AGENT 1
│       │   ├── routes.js
│       │   ├── classifier.js
│       │   └── profile-builder.js
│       ├── m02-risk/                   # AGENT 2
│       │   ├── routes.js
│       │   ├── automation-lookup.js
│       │   └── adjacent-skills.js
│       └── m03-opportunities/          # AGENT 3
│           ├── routes.js
│           ├── matcher.js
│           └── data-loader.js
│
├── frontend/
│   └── src/
│       ├── App.jsx                     # ORCHESTRATOR. Routes + ContextSwitcher.
│       ├── lib/
│       │   ├── api.js                  # ORCHESTRATOR. Shared fetch helpers.
│       │   ├── i18n.js                 # ORCHESTRATOR. Static label dictionary.
│       │   └── context.jsx             # ORCHESTRATOR. Active-country state.
│       └── modules/
│           ├── m01-skills/             # AGENT 1
│           │   ├── SkillsForm.jsx
│           │   └── ProfileCard.jsx
│           ├── m02-risk/               # AGENT 2
│           │   ├── RiskGauge.jsx
│           │   └── AdjacentSkills.jsx
│           └── m03-opportunities/      # AGENT 3
│               ├── OpportunityCard.jsx
│               ├── OpportunityList.jsx
│               └── PolicyDashboard.jsx
│
├── scripts/
│   ├── prepare-isco.js                 # one-shot CSV cleaner
│   └── prepare-context.js              # ILOSTAT/WDI → opportunities.json
│
└── demo/
    ├── pitch.md                        # 90-second talk track
    └── demo-script.md                  # click-by-click walkthrough
```

**Ownership rules (non-negotiable for parallel agents):**
1. Each agent edits ONLY files inside its `modules/m0X-*/` directories (backend + frontend).
2. Each agent READS from `shared/` and `data/`, never writes.
3. Orchestrator owns: scaffolding, `shared/`, `backend/server.js`, `backend/lib/`, `frontend/src/App.jsx`, `frontend/src/lib/`.
4. Agent 3 also owns `data/contexts/` — that's their critical path data prep.

---

## API contract (lock by 11:15)

All endpoints return JSON. Errors return `{ error: string }` with a 4xx/5xx status.

### `POST /api/m01/classify`
Map free-text experience to ISCO-08 codes.
```json
// Request
{
  "text": "I sell phone accessories at my mother's stall and fix screens for neighbors",
  "education": "secondary",
  "languages": ["en", "tw"],
  "context": "ghana"
}
// Response
{
  "profile": {
    "iscoCandidates": [
      { "code": "5223", "title": "Shop sales assistants", "confidence": 0.78 },
      { "code": "7421", "title": "Electronic mechanics", "confidence": 0.61 },
      { "code": "5221", "title": "Street and market salespersons", "confidence": 0.54 }
    ],
    "skills": ["customer service", "mobile repair", "informal trade"],
    "rationale": "Combines retail-customer interaction with hands-on electronics repair..."
  }
}
```

### `GET /api/m02/risk?isco=5223&context=ghana`
```json
{
  "isco": "5223",
  "automationProbability": 0.92,
  "source": "Frey-Osborne 2013, calibrated for Ghana low-infrastructure adjustment factor 0.85",
  "calibratedProbability": 0.78,
  "band": "high"
}
```

### `GET /api/m02/adjacent?isco=5223&context=ghana`
```json
{
  "adjacent": [
    { "skill": "Customer relationship management", "rationale": "..." },
    { "skill": "Inventory bookkeeping", "rationale": "..." },
    { "skill": "Mobile money agent operations", "rationale": "..." },
    { "skill": "Social media marketing", "rationale": "..." },
    { "skill": "Light electronics troubleshooting", "rationale": "..." }
  ]
}
```

### `GET /api/m03/opportunities?context=ghana&isco=5223&adjacent=...`
```json
{
  "opportunities": [
    {
      "id": "gh-2421-001",
      "title": "Mobile money agent",
      "iscoCode": "4211",
      "medianWageMonthlyUSD": 180,
      "wageSource": "ILOSTAT 2023",
      "sectorGrowth5y": 0.34,
      "growthSource": "WB WDI 2018-2023, financial services",
      "matchScore": 0.81,
      "resilienceScore": 0.72,
      "rationale": "Combines retail-customer skill with growing fintech sector..."
    }
  ]
}
```

### `GET /api/m03/aggregate?context=ghana`
For PolicyDashboard. Returns aggregate statistics computed from opportunities.json + simulated user assessments.
```json
{
  "context": "ghana",
  "totalAssessed": 1240,
  "highRiskShare": 0.41,
  "topAtRiskOccupations": [...],
  "topResilientPathways": [...],
  "sectorGrowthTopFive": [...]
}
```

---

## Shared types

```ts
// shared/types.ts
export type CountryContext = 'ghana' | 'india';

export type IscoCode = {
  code: string;          // 4-digit ISCO-08
  title: string;
  confidence?: number;   // 0..1, present in classification output
};

export type SkillsProfile = {
  iscoCandidates: IscoCode[];
  skills: string[];
  rationale: string;
};

export type RiskScore = {
  isco: string;
  automationProbability: number;     // raw Frey-Osborne 0..1
  calibratedProbability: number;     // context-adjusted 0..1
  band: 'low' | 'medium' | 'high';
  source: string;
};

export type AdjacentSkill = {
  skill: string;
  rationale: string;
};

export type Opportunity = {
  id: string;
  title: string;
  iscoCode: string;
  medianWageMonthlyUSD: number;
  wageSource: string;
  sectorGrowth5y: number;            // decimal, e.g. 0.34 = +34% over 5y
  growthSource: string;
  matchScore: number;                // 0..1
  resilienceScore: number;           // 0..1
  rationale: string;
};
```

---

## Country context schema

```json
// data/contexts/{country}/config.json
{
  "country": "ghana",
  "language": "en",
  "labels": {
    "title": "Skills passport",
    "subtitleYouth": "Map your experience to opportunities"
  },
  "calibration": {
    "automationFactor": 0.85,
    "rationale": "Lower automation pace in low-infrastructure contexts"
  },
  "iscoSubsetWeighting": "informal-economy",
  "currency": "USD",
  "wageReferenceYear": 2023
}
```

Both `ghana/config.json` and `india/config.json` must conform to this schema. Adding a third context = drop in a new directory, no code changes.

---

## Time plan

| Window | Agent 1 (M01) | Agent 2 (M02) | Agent 3 (M03 / data) | Orchestrator |
|---|---|---|---|---|
| 10:45–11:15 | wait | wait | **start ILOSTAT + WDI download + clean** | scaffold repo, lock `shared/`, push initial commit |
| 11:15–12:30 | classifier + ProfileCard | risk lookup + RiskGauge | finish `ghana/opportunities.json` | wire shared lib, integrate first endpoints |
| 12:30 ✅ | **CHECKPOINT** | **CHECKPOINT** | **HARD GATE: opportunities.json exists or M03 dies** | reconcile contracts |
| 12:30–13:30 | adjacent-aware ProfileCard | adjacent-skills + chips | `india/opportunities.json` + matcher | merge integration |
| 13:30–14:30 | polish profile UX | risk band coloring + tooltips | OpportunityList + cards | PolicyDashboard scaffold |
| 14:30–15:30 | i18n labels | i18n labels | aggregate fixtures + dashboard | **ContextSwitcher integration** |
| 15:30–16:30 | end-to-end demo flow | end-to-end demo flow | end-to-end demo flow | deploy to Vercel/Railway |
| 16:30–17:15 | bug bash | bug bash | bug bash | record demo video |
| 17:15–18:00 | submission buffer | submission buffer | submission buffer | submit |

---

## What we are explicitly NOT building

- ❌ **Audio input** (whiteboard task ①). Text + structured fields only.
- ❌ **Multi-language LLM output**. UI labels translated via i18n (EN + 1 other); Claude responses stay in English.
- ❌ **Auth, accounts, persistence of user assessments**. Single ephemeral session per browser tab.
- ❌ **Live econometric API integrations**. Pre-cached JSON only.
- ❌ **Real database**. Flat files; in-memory only for runtime aggregates.
- ❌ **Wittgenstein Centre education projections**. Out of scope unless time remains at 16:00.

---

## Risk register

| # | Risk | Trigger | Mitigation | Kill switch |
|---|---|---|---|---|
| 1 | Module 03 data prep slips past 12:30 | `ghana/opportunities.json` not populated by 12:30 | Agent 3 starts data prep at 10:45 sharp | Drop M03, reassign Agent 3 to polish + i18n on M01+M02 |
| 2 | Agents collide on shared files | Merge conflict on `shared/` or `backend/server.js` | Strict ownership rule: agents never edit orchestrator-owned paths | Orchestrator manually reconciles |
| 3 | Claude classifier returns junk ISCO codes | Confidence < 0.4 across all candidates | Validate against ISCO CSV at lookup time | Show "low confidence — please add detail" prompt |
| 4 | ContextSwitcher doesn't wire to all 3 modules cleanly | Switching country doesn't refresh M02 calibration or M03 opportunities | Lock `context` query param contract early, every endpoint reads it | Force page reload on context switch (acceptable demo cheat) |
| 5 | Demo video record runs over | Recording unfinished by 17:00 | Pre-write demo-script.md by 15:00, dry-run at 15:30 | Submit live demo URL only, skip video |

---

## Demo script (90 seconds)

> "Meet **Amara** — 22, Ghanaian. She's been selling phone accessories at her mother's stall and fixing screens for neighbors. Formal employers can't see her.
>
> [Type into form] She enters her experience in plain English. Module 01 maps it to ISCO-08 — she's a Shop Sales Assistant with adjacent strengths in electronics repair and informal trade. **Real classification, real taxonomy.**
>
> [Risk panel appears] Module 02 surfaces the Frey-Osborne automation probability — 92%, calibrated for Ghana to 78%. We tell her the truth: this work is exposed. But here are five adjacent resilient skills — mobile money agent operations, social media marketing, and light electronics troubleshooting.
>
> [Opportunity list appears] Module 03 synthesizes. Ranked opportunities pulled from real ILOSTAT wages and World Bank sector growth — mobile money agent at $180/month, fintech sector growing 34% over five years. **Two econometric signals visible on every card.**
>
> [Click ContextSwitcher → India] Watch this. Same Amara, same profile, **different country context.** No code change. Opportunities re-rank, calibration shifts, labels swap. The infrastructure is country-agnostic.
>
> [Click PolicyView] Program officers and policymakers see the aggregate: of 1,240 youth assessed in Ghana, 41% are in high-automation-risk occupations, here are the resilient pathways.
>
> One profile. Two contexts. Three modules. Real data."

---

## Open decisions

1. **Confirm second context**: Ghana + India, or Ghana + Bangladesh / + Kenya?
2. **Frontend host**: Vercel (frontend) + Railway (backend), or single fly.io deploy?
3. **Demo video**: Loom (fast) or formal recording with overlay?

---

## Definition of "done" for the submission

- ✅ Both `ghana` and `india` contexts working with one ContextSwitcher click
- ✅ Module 01 + 02 produce real outputs from real CSVs (not synthetic)
- ✅ Module 03 surfaces ≥2 econometric signals visibly per opportunity card
- ✅ PolicyView shows aggregated risk + resilient pathway view
- ✅ Deployed live URL (not localhost)
- ✅ 90-second demo video recorded
- ✅ README explains how to add a third country (the localizability claim, made concrete)

If we hit all 7 by 17:15, we ship. If we hit 5 of 7 with a deployed URL and a recorded video, we still ship and explain limitations honestly — the brief explicitly rewards "acknowledging limitations and unknown variables."
