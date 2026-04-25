#!/usr/bin/env node
/**
 * ESCO ingestion workflow → standardized JSON for UNMAPPED analysis.
 *
 * Reads the ESCO v1.2.x classification CSV bundle and produces 6 derivative
 * JSON files in data/esco-derived/. These are what the backend M01 + M02
 * modules load at runtime.
 *
 * Usage:
 *   node scripts/02-esco.js [INPUT_DIR] [OUTPUT_DIR]
 *
 * Defaults:
 *   INPUT_DIR  = "C:/Users/paria/Desktop/ESCO dataset - v1.2.1 - classification - en - csv"
 *   OUTPUT_DIR = "data/esco-derived"
 *
 * Inputs consumed (6 of the 19 bundle files):
 *   ISCOGroups_en.csv                  → isco-08.json
 *   occupations_en.csv                 → esco-occupations.json
 *   skills_en.csv                      → esco-skills.json
 *   occupationSkillRelations_en.csv    → esco-occ-skills.json
 *   skillSkillRelations_en.csv         → esco-skill-graph.json
 *   transversalSkillsCollection_en.csv → esco-transversal-skills.json
 *
 * Files explicitly NOT used (and why):
 *   greenShareOcc, greenSkills*, digCompSkills*, digitalSkills*, language*,
 *   research*, broaderRelationsOccPillar, broaderRelationsSkillPillar,
 *   skillsHierarchy, skillGroups, conceptSchemes, dictionary
 *   → out of scope for M01+M02 hackathon build.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";

// ---------- Config ----------
const DEFAULT_INPUT =
  "C:/Users/paria/Desktop/ESCO dataset - v1.2.1 - classification - en - csv";
const DEFAULT_OUTPUT = "data/esco-derived";

const INPUT_DIR = process.argv[2] || DEFAULT_INPUT;
const OUTPUT_DIR = process.argv[3] || DEFAULT_OUTPUT;

// ---------- Helpers ----------
const log = (...args) => console.log(`[esco]`, ...args);

function readCsv(filename) {
  const path = join(INPUT_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`Missing input file: ${path}`);
  }
  log(`reading ${filename}`);
  const raw = readFileSync(path, "utf8");
  // ESCO files have multiline cells (descriptions, alt-labels) — relaxed parsing
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });
}

function writeJson(filename, data, label) {
  const path = join(OUTPUT_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
  const size = (JSON.stringify(data).length / 1024).toFixed(1);
  log(`wrote ${filename} — ${label} (${size} KB)`);
}

// "http://data.europa.eu/esco/isco/C2654" → "2654"
function iscoCodeFromUri(uri) {
  if (!uri) return null;
  const m = uri.match(/\/isco\/C(\d+)$/);
  return m ? m[1] : null;
}

// "2654" → "265"  |  "26" → "2"  |  "2" → null
function parentIscoCode(code) {
  if (!code || code.length <= 1) return null;
  return code.slice(0, -1);
}

// "altLabel1\naltLabel2\naltLabel3" → ["altLabel1", "altLabel2", "altLabel3"]
function splitMultiline(value) {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Transforms ----------

function buildIscoSpine(rows) {
  // Output: [{ code, title, level, parentCode, definition, uri }]
  const out = [];
  for (const r of rows) {
    const code = r.code || iscoCodeFromUri(r.conceptUri);
    if (!code) continue;
    out.push({
      code,
      title: r.preferredLabel || "",
      level: code.length, // 1=major, 2=sub-major, 3=minor, 4=unit
      parentCode: parentIscoCode(code),
      definition: (r.description || "").trim(),
      uri: r.conceptUri,
    });
  }
  // Sort numerically by code for predictable consumption
  out.sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

function buildOccupations(rows) {
  // Output: [{ uri, iscoCode, title, altLabels[], description, escoCode }]
  // Filter to "released" status only (skip drafts/deprecated)
  const out = [];
  for (const r of rows) {
    if (r.status && r.status !== "released") continue;
    if (!r.iscoGroup) continue; // we need ISCO mapping for joins
    out.push({
      uri: r.conceptUri,
      iscoCode: r.iscoGroup,
      title: r.preferredLabel || "",
      altLabels: splitMultiline(r.altLabels).slice(0, 8), // cap at 8 for size
      description: (r.description || "").trim().slice(0, 500),
      escoCode: r.code || null,
    });
  }
  return out;
}

function buildSkills(rows) {
  // Output: [{ uri, title, skillType, reuseLevel, description }]
  // skillType: "knowledge" | "skill/competence"
  // reuseLevel: "transversal" | "cross-sector" | "sector-specific" | "occupation-specific"
  const out = [];
  for (const r of rows) {
    if (r.status && r.status !== "released") continue;
    out.push({
      uri: r.conceptUri,
      title: r.preferredLabel || "",
      skillType: r.skillType || null,
      reuseLevel: r.reuseLevel || null,
      description: (r.description || "").trim().slice(0, 300),
    });
  }
  return out;
}

function buildOccSkillsBridge(rows) {
  // Output: { <occupationUri>: { essential: [skillUri], optional: [skillUri] } }
  const bridge = {};
  for (const r of rows) {
    const occ = r.occupationUri;
    const skill = r.skillUri;
    const rel = r.relationType; // "essential" | "optional"
    if (!occ || !skill || !rel) continue;
    if (!bridge[occ]) bridge[occ] = { essential: [], optional: [] };
    if (rel === "essential") bridge[occ].essential.push(skill);
    else if (rel === "optional") bridge[occ].optional.push(skill);
  }
  return bridge;
}

function buildSkillGraph(rows) {
  // Output: { <skillUri>: { broader: [skillUri], related: [skillUri], optional: [skillUri] } }
  const graph = {};
  for (const r of rows) {
    const src = r.originalSkillUri;
    const dst = r.relatedSkillUri;
    const rel = r.relationType; // typically "essential" | "optional" | broader-relations
    if (!src || !dst || !rel) continue;
    if (!graph[src]) graph[src] = { broader: [], related: [], optional: [] };
    const bucket = rel === "optional" ? "optional" : "related";
    graph[src][bucket].push(dst);
  }
  return graph;
}

function buildTransversalSkills(rows) {
  // Output: [{ uri, title, reuseLevel, description }]
  // These 96 skills are by definition the most transferable / automation-resilient
  return rows
    .filter((r) => !r.status || r.status === "released")
    .map((r) => ({
      uri: r.conceptUri,
      title: r.preferredLabel || "",
      reuseLevel: r.reuseLevel || "transversal",
      description: (r.description || "").trim().slice(0, 300),
    }));
}

// ---------- Stats / index ----------

function buildIndex(isco, occupations, skills, occSkillsBridge, skillGraph, transversal) {
  // A small lookup-friendly index for runtime.
  const iscoToOccupations = {};
  for (const occ of occupations) {
    if (!iscoToOccupations[occ.iscoCode]) iscoToOccupations[occ.iscoCode] = [];
    iscoToOccupations[occ.iscoCode].push({ uri: occ.uri, title: occ.title });
  }
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      iscoCodes: isco.length,
      occupations: occupations.length,
      skills: skills.length,
      occupationsWithSkills: Object.keys(occSkillsBridge).length,
      skillsInGraph: Object.keys(skillGraph).length,
      transversalSkills: transversal.length,
    },
    iscoToOccupations,
  };
}

// ---------- Main ----------

function main() {
  log(`input dir:  ${INPUT_DIR}`);
  log(`output dir: ${OUTPUT_DIR}`);
  if (!existsSync(INPUT_DIR)) {
    console.error(`ERROR: input directory does not exist: ${INPUT_DIR}`);
    process.exit(1);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. ISCO spine
  const iscoRows = readCsv("ISCOGroups_en.csv");
  const isco = buildIscoSpine(iscoRows);
  writeJson("isco-08.json", isco, `${isco.length} ISCO codes`);

  // 2. ESCO occupations (slim, with iscoGroup)
  const occRows = readCsv("occupations_en.csv");
  const occupations = buildOccupations(occRows);
  writeJson(
    "esco-occupations.json",
    occupations,
    `${occupations.length} occupations`,
  );

  // 3. ESCO skills (slim, with reuseLevel)
  const skillRows = readCsv("skills_en.csv");
  const skills = buildSkills(skillRows);
  writeJson("esco-skills.json", skills, `${skills.length} skills`);

  // 4. Occupation→Skill bridge
  const bridgeRows = readCsv("occupationSkillRelations_en.csv");
  const occSkills = buildOccSkillsBridge(bridgeRows);
  writeJson(
    "esco-occ-skills.json",
    occSkills,
    `bridge for ${Object.keys(occSkills).length} occupations`,
  );

  // 5. Skill→Skill graph
  const graphRows = readCsv("skillSkillRelations_en.csv");
  const skillGraph = buildSkillGraph(graphRows);
  writeJson(
    "esco-skill-graph.json",
    skillGraph,
    `graph from ${Object.keys(skillGraph).length} skills`,
  );

  // 6. Transversal skills (the resilience anchor)
  const transversalRows = readCsv("transversalSkillsCollection_en.csv");
  const transversal = buildTransversalSkills(transversalRows);
  writeJson(
    "esco-transversal-skills.json",
    transversal,
    `${transversal.length} transversal skills`,
  );

  // 7. Master index
  const index = buildIndex(
    isco,
    occupations,
    skills,
    occSkills,
    skillGraph,
    transversal,
  );
  writeJson("esco-index.json", index, "master index");

  log("DONE");
  log("counts:", JSON.stringify(index.counts, null, 2));
}

main();
