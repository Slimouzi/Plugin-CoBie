/**
 * Stress test SpatialIndex : valide qu'il n'y a pas de fuite mémoire.
 *
 * On génère un modèle synthétique volumineux, on construit l'index,
 * on lit quelques relations (utilisation typique des builders), puis on
 * libère la référence et on force un GC. Le RSS doit revenir près de
 * sa valeur d'avant build.
 *
 * Lance avec :
 *   node --expose-gc scripts/stress-spatial-index.mjs
 *
 * Sans --expose-gc, le test tourne mais ne peut pas mesurer la
 * libération mémoire (`global.gc` n'est pas exposé).
 */
import { SpatialIndex } from "../src/lib/spatialIndex.js";

const N_STOREYS  = 50;
const N_SPACES   = 5_000;
const N_ELEMENTS = 100_000;

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function snapshotMemory(label) {
  const m = process.memoryUsage();
  console.log(
    `  [${label}]  rss=${fmtMB(m.rss).padStart(8)}` +
    `  heapUsed=${fmtMB(m.heapUsed).padStart(8)}` +
    `  external=${fmtMB(m.external).padStart(8)}`,
  );
  return m;
}

function generate() {
  console.log(`→ Génération synthétique : ${N_STOREYS} étages, ${N_SPACES} espaces, ${N_ELEMENTS} éléments`);
  const buildings = [{ uuid: "bld-1", name: "Building 1" }];
  const storeys = Array.from({ length: N_STOREYS }, (_, i) => ({
    uuid: `storey-${i}`, name: `Storey ${i}`,
  }));
  const spaces = Array.from({ length: N_SPACES }, (_, i) => ({
    id: i, uuid: `space-${i}`, name: `Space ${i}`,
    storey: `storey-${i % N_STOREYS}`,
  }));
  const elements = Array.from({ length: N_ELEMENTS }, (_, i) => ({
    uuid: `el-${i}`, type: "IfcWall", name: `Wall ${i}`,
    space: i % N_SPACES, // chaque élément dans un espace
  }));
  return { buildings, storeys, spaces, elements };
}

function exerciseIndex(index, sample) {
  // Simule la consommation par les builders : pour un échantillon d'éléments
  // et d'espaces, on demande l'étage parent.
  let counterStorey = 0, counterSpace = 0;
  for (let i = 0; i < sample.elements.length; i++) {
    if (index.storeyOfElement(sample.elements[i].uuid)) counterStorey++;
    if (index.spaceOfElement(sample.elements[i].uuid)) counterSpace++;
  }
  return { counterStorey, counterSpace };
}

async function main() {
  const hasGc = typeof globalThis.gc === "function";
  if (!hasGc) {
    console.warn("⚠ globalThis.gc indisponible — relance avec `node --expose-gc` pour mesurer la libération.");
  }

  const data = generate();

  if (hasGc) globalThis.gc();
  const before = snapshotMemory("before build");

  console.time("SpatialIndex build");
  let index = new SpatialIndex(data.buildings, data.storeys, data.spaces, data.elements);
  console.timeEnd("SpatialIndex build");
  const afterBuild = snapshotMemory("after build ");

  console.time("Index queries");
  const { counterStorey, counterSpace } = exerciseIndex(index, data);
  console.timeEnd("Index queries");
  console.log(`  élément→étage résolus : ${counterStorey}/${N_ELEMENTS}, élément→espace : ${counterSpace}/${N_ELEMENTS}`);
  const afterQueries = snapshotMemory("after queries");

  // Libération de toutes les références.
  index = null;
  data.buildings = data.storeys = data.spaces = data.elements = null;

  if (hasGc) {
    // 2 passes de GC pour laisser le marker-sweep stabiliser.
    globalThis.gc();
    await new Promise((r) => setTimeout(r, 50));
    globalThis.gc();
  }
  const after = snapshotMemory("after free  ");

  // Critère : le heap doit revenir à moins de +30 MB du baseline initial,
  // sinon on suspecte une fuite (ex: closure captant le dataset).
  const delta = after.heapUsed - before.heapUsed;
  const limit = 30 * 1024 * 1024;
  console.log(`\n  Δ heapUsed (after free − before) = ${fmtMB(delta)} (seuil : ${fmtMB(limit)})`);
  if (!hasGc) {
    console.log("  → Mesure indicative seulement (pas de --expose-gc).");
  } else if (delta > limit) {
    console.error(`✗ Δ heap au-dessus du seuil — possible fuite mémoire.`);
    process.exit(1);
  } else {
    console.log(`✓ Heap libéré correctement, pas de fuite détectée.`);
  }

  // Aussi un coup d'œil sur la croissance build→queries (devrait être ~0 :
  // les queries ne doivent rien allouer de durable).
  const growthDuringQueries = afterQueries.heapUsed - afterBuild.heapUsed;
  console.log(`  Δ heap (queries) = ${fmtMB(growthDuringQueries)} — devrait être ~0`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
