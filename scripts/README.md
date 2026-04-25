# Data ingestion scripts

Each script reads a raw external dataset and writes standardized JSON to `data/<source>-derived/`. Backend modules (M01, M02, M03) load only the derived JSON at runtime — never the raw CSVs.

## Quickstart

```bash
npm install
npm run prepare:esco
```

That produces all ESCO derivatives in `data/esco-derived/`.

## scripts/02-esco.js

**Input:** ESCO v1.2.x classification CSV bundle (English).

Default location: `C:/Users/paria/Desktop/ESCO dataset - v1.2.1 - classification - en - csv/`

Override:
```bash
node scripts/02-esco.js "<path-to-bundle>" "<output-dir>"
```

**Reads 6 of the 19 bundle files:**
- `ISCOGroups_en.csv` — ISCO-08 hierarchy (570 codes across levels 1–4)
- `occupations_en.csv` — 3,008 ESCO occupations with `iscoGroup` mapping
- `skills_en.csv` — 13,890 skills with `skillType` and `reuseLevel`
- `occupationSkillRelations_en.csv` — bridge (occ → essential/optional skills)
- `skillSkillRelations_en.csv` — adjacency graph (skill → related skills)
- `transversalSkillsCollection_en.csv` — 96 cross-occupation transferable skills

**Skipped (not needed for M01+M02):** `greenShareOcc`, `greenSkillsCollection`, `digitalSkillsCollection`, `digCompSkillsCollection`, `languageSkillsCollection`, `researchOccupationsCollection`, `researchSkillsCollection`, `broaderRelationsOccPillar`, `broaderRelationsSkillPillar`, `skillsHierarchy`, `skillGroups`, `conceptSchemes`, `dictionary`.

**Outputs (in `data/esco-derived/`):**

| File | Shape | Used by |
|---|---|---|
| `isco-08.json` | `[{ code, title, level, parentCode, definition, uri }]` | M01 (classification target), all modules (joining) |
| `esco-occupations.json` | `[{ uri, iscoCode, title, altLabels, description, escoCode }]` | M01 (drilldown from ISCO → richer occupation labels) |
| `esco-skills.json` | `[{ uri, title, skillType, reuseLevel, description }]` | M01 (skill resolution), M02 (resilience scoring via reuseLevel) |
| `esco-occ-skills.json` | `{ <occUri>: { essential[], optional[] } }` | M01 (build profile from occupation) |
| `esco-skill-graph.json` | `{ <skillUri>: { broader[], related[], optional[] } }` | M02 (adjacent skills traversal) |
| `esco-transversal-skills.json` | `[{ uri, title, reuseLevel, description }]` | M02 (resilience anchor — most transferable skills) |
| `esco-index.json` | `{ counts, iscoToOccupations: { <isco>: [{uri,title}] } }` | runtime lookup index |

## Standardized JSON schemas

### `isco-08.json`
```json
[
  {
    "code": "7421",
    "title": "Electronics mechanics and servicers",
    "level": 4,
    "parentCode": "742",
    "definition": "Electronics mechanics and servicers fit, maintain, adjust...",
    "uri": "http://data.europa.eu/esco/isco/C7421"
  }
]
```

### `esco-occupations.json`
```json
[
  {
    "uri": "http://data.europa.eu/esco/occupation/15a7e87c-...",
    "iscoCode": "7421",
    "title": "smart home installer",
    "altLabels": ["home automation installer", "connected devices installer", "..."],
    "description": "Smart home installers install and maintain home automation systems...",
    "escoCode": "7421.7"
  }
]
```

### `esco-skills.json`
```json
[
  {
    "uri": "http://data.europa.eu/esco/skill/0005c151-...",
    "title": "manage musical staff",
    "skillType": "skill/competence",
    "reuseLevel": "sector-specific",
    "description": "Coordinate and oversee the duties..."
  }
]
```

### `esco-occ-skills.json`
```json
{
  "http://data.europa.eu/esco/occupation/15a7e87c-...": {
    "essential": [
      "http://data.europa.eu/esco/skill/<uuid>",
      "..."
    ],
    "optional": [
      "http://data.europa.eu/esco/skill/<uuid>"
    ]
  }
}
```

### `esco-skill-graph.json`
```json
{
  "http://data.europa.eu/esco/skill/<uuid>": {
    "broader": [],
    "related": ["http://data.europa.eu/esco/skill/<uuid>"],
    "optional": []
  }
}
```

### `esco-transversal-skills.json`
```json
[
  {
    "uri": "http://data.europa.eu/esco/skill/<uuid>",
    "title": "show initiative",
    "reuseLevel": "transversal",
    "description": "Take action and act independently..."
  }
]
```

### `esco-index.json`
```json
{
  "generatedAt": "2026-04-25T15:00:00.000Z",
  "counts": {
    "iscoCodes": 619,
    "occupations": 3043,
    "skills": 13960,
    "occupationsWithSkills": 3039,
    "skillsInGraph": 3759,
    "transversalSkills": 95
  },
  "iscoToOccupations": {
    "7421": [
      { "uri": "...", "title": "smart home installer" },
      { "uri": "...", "title": "avionics technician" }
    ]
  }
}
```

## How the modules consume these

**M01 (Skills Signal Engine)** — Claude classifies free-text → ISCO code → `iscoToOccupations[isco]` → pick best ESCO occupation → `esco-occ-skills[occUri].essential` → resolve URIs against `esco-skills.json` → return human-readable profile.

**M02 (AI Readiness Lens)** — for adjacent resilient skills:
1. Get current skills from M01 profile.
2. For each skill URI, walk `esco-skill-graph[skillUri].related`.
3. Filter related skills to `reuseLevel ∈ {transversal, cross-sector}`.
4. Optionally union with `esco-transversal-skills` for a baseline resilience set.
5. Rank by transferability + automation distance.

**M03 (Opportunity Matching)** — receives ISCO code and adjacent skills from M01+M02; reads `data/contexts/{country}/opportunities.json` (separate ingestion, not part of this script).
