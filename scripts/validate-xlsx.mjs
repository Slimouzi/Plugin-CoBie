/**
 * Valide que `buildXlsxBlob` produit un xlsx structurellement conforme
 * aux attentes Excel / LibreOffice : feuilles, en-têtes, données, freeze
 * pane sur ligne 1, header bold + bg color, bordures.
 *
 * Lance : `node scripts/validate-xlsx.mjs`
 *
 * Lit le fichier généré avec `exceljs` (read mode) — c'est exactement ce
 * que ferait Excel / LibreOffice côté ouverture (mêmes parsers OOXML).
 * Si on voulait aussi tester avec openpyxl côté Python on pourrait, mais
 * exceljs.read est suffisamment indépendant du writer (read et write
 * sont deux pipelines séparés dans exceljs).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

import { buildXlsxBlob } from "../src/lib/exporter.js";
import { SHEET_HEADERS } from "../src/lib/extractor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, "..", ".tmp");

function syntheticSheets() {
  const sheets = {};
  // Une ligne témoin par feuille avec quelques colonnes pré-remplies pour
  // pouvoir vérifier que les valeurs traversent bien write→read.
  sheets.Facility = [{
    Name: "Facility A",
    CreatedBy: "n/a",
    CreatedOn: "2026-04-27T10:00:00",
    Category: "Facility",
    ProjectName: "Test Project",
    ExtIdentifier: "uuid-facility-1",
    Latitude: 48.8566,
    Longitude: 2.3522,
  }];
  sheets.Floor = [{
    Name: "RDC", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    Category: "Floor", ExtIdentifier: "uuid-storey-1", Elevation: 0,
  }];
  sheets.Space = [{
    Name: "Bureau 101", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    Category: "Space", FloorName: "RDC", ExtIdentifier: "uuid-space-1",
    GrossArea: 18.5,
  }];
  sheets.Zone = [{
    Name: "Zone Tertiaire", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    Category: "IfcZone", SpaceNames: "Bureau 101, Bureau 102",
  }];
  sheets.Type = [{
    Name: "Mur béton 20cm", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    Category: "IfcWall", AssetType: "Fixed",
  }];
  sheets.Component = [{
    Name: "Mur W-001", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    TypeName: "Mur béton 20cm", Space: "Bureau 101", FloorName: "RDC",
    ExtIdentifier: "uuid-comp-1",
  }];
  sheets.System = [{
    Name: "CVC principal", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    Category: "IfcSystem",
  }];
  sheets.Attribute = [{
    Name: "Pset_X.Color", CreatedBy: "n/a", CreatedOn: "2026-04-27T10:00:00",
    Category: "Pset_X", SheetName: "Component", RowName: "Mur W-001",
    Value: "Blanc",
  }];
  return sheets;
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${msg}`);
  }
}

async function main() {
  const sheets = syntheticSheets();
  console.log("→ Génération xlsx avec buildXlsxBlob…");
  const blob = await buildXlsxBlob(sheets);
  const buffer = Buffer.from(await blob.arrayBuffer());
  await mkdir(TMP, { recursive: true });
  const outPath = join(TMP, "validate.xlsx");
  await writeFile(outPath, buffer);
  console.log(`  → ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

  console.log("→ Relecture avec exceljs (read mode)…");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const expectedSheets = ["Facility", "Floor", "Space", "Zone", "Type", "Component", "System", "Attribute"];
  const actualSheets = wb.worksheets.map((w) => w.name);
  assert(
    expectedSheets.every((n) => actualSheets.includes(n)),
    `Les 8 feuilles COBie sont présentes (vu : ${actualSheets.join(", ")})`,
  );

  for (const name of expectedSheets) {
    const ws = wb.getWorksheet(name);
    const expected = SHEET_HEADERS[name];
    const actual = ws.getRow(1).values.slice(1); // exceljs values est 1-indexé
    assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      `${name} : header conforme à SHEET_HEADERS (${expected.length} colonnes)`,
    );

    const headerCell = ws.getCell(1, 1);
    assert(headerCell.font?.bold === true, `${name} : cellule header[A1] est bold`);
    assert(
      headerCell.fill?.type === "pattern" && headerCell.fill?.pattern === "solid",
      `${name} : cellule header[A1] a un fill solid`,
    );
    assert(
      !!headerCell.border?.top && !!headerCell.border?.bottom,
      `${name} : cellule header[A1] a des bordures`,
    );

    const views = ws.views || [];
    const frozen = views.find((v) => v.state === "frozen" && v.ySplit === 1);
    assert(!!frozen, `${name} : freeze pane sur la ligne 1`);
  }

  // Sanity sur quelques valeurs (round-trip).
  const facility = wb.getWorksheet("Facility");
  const facHeaders = facility.getRow(1).values.slice(1);
  const facData = facility.getRow(2).values.slice(1);
  const lat = facData[facHeaders.indexOf("Latitude")];
  const lon = facData[facHeaders.indexOf("Longitude")];
  assert(Math.abs(lat - 48.8566) < 1e-6, `Facility.Latitude round-trip OK (${lat})`);
  assert(Math.abs(lon - 2.3522) < 1e-6, `Facility.Longitude round-trip OK (${lon})`);

  // Largeurs de colonnes : la majorité doit être définie. exceljs élide les
  // <col> dont la largeur est proche de la défaut Excel (~8.43) ; ces
  // colonnes sont alors rendues à la largeur par défaut, ce qui est OK
  // pour la lecture par Excel/LibreOffice.
  const widths = facility.columns.map((c) => c.width).filter((w) => typeof w === "number" && w > 0);
  const minimum = Math.ceil(SHEET_HEADERS.Facility.length * 0.8);
  assert(
    widths.length >= minimum,
    `Facility : ≥${minimum} colonnes ont une largeur explicite (vu : ${widths.length}/${SHEET_HEADERS.Facility.length})`,
  );

  console.log(process.exitCode ? "\n✗ ÉCHEC" : "\n✓ OK — xlsx valide pour Excel / LibreOffice");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
