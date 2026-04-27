/** Orchestre la récupération des données BIMData et la construction des feuilles COBie. */
import { BIMDataClient } from "./bimdataClient.js";
import { SpatialIndex } from "./spatialIndex.js";
import * as facility from "./sheets/facility.js";
import * as floor from "./sheets/floor.js";
import * as space from "./sheets/space.js";
import * as zone from "./sheets/zone.js";
import * as type_ from "./sheets/type.js";
import * as component from "./sheets/component.js";
import * as system from "./sheets/system.js";
import * as attribute from "./sheets/attribute.js";

const SPATIAL_TYPES = new Set(["project", "site", "building", "storey", "space"]);

function walkSpatialTree(node, ctx, storeyUuid, spaceUuid) {
  if (Array.isArray(node)) {
    for (const item of node) walkSpatialTree(item, ctx, storeyUuid, spaceUuid);
    return;
  }
  if (!node || typeof node !== "object") return;

  const ntype = (node.type || "").toLowerCase();
  const uuid = node.uuid;

  if (ntype === "storey") {
    storeyUuid = uuid;
    spaceUuid = null;
  } else if (ntype === "space") {
    if (storeyUuid && uuid) ctx.spaceToStorey.set(uuid, storeyUuid);
    spaceUuid = uuid;
  } else if (ntype && !SPATIAL_TYPES.has(ntype) && uuid) {
    if (storeyUuid) ctx.elementToStorey.set(uuid, storeyUuid);
    if (spaceUuid) ctx.elementToSpace.set(uuid, spaceUuid);
    if (node.object_type) ctx.elementObjectType.set(uuid, node.object_type);
  }

  for (const child of node.children || []) walkSpatialTree(child, ctx, storeyUuid, spaceUuid);
}

async function safeGet(label, fn, onWarn) {
  try {
    return await fn();
  } catch (err) {
    if (onWarn) onWarn(`Avertissement: impossible de récupérer ${label}: ${err.message || err}`);
    return null;
  }
}

/**
 * Construit les 8 feuilles COBie depuis un BIMDataClient configuré.
 *
 * @param {BIMDataClient} client
 * @param {(msg: string) => void} [log] callback de progression (info + warnings)
 * @returns {Promise<{sheets: Record<string, object[]>, modelName: string}>}
 */
export async function extractCobie(client, log) {
  const note = log || (() => {});
  note("Récupération des données BIMData...");

  const project = await safeGet("projet", () => client.getProject(), note);
  const model = await safeGet("modèle", () => client.getModel(), note);
  const buildingsRaw = (await safeGet("bâtiments", () => client.getBuildings(), note)) || [];
  const sites = (await safeGet("sites", () => client.getSites(), note)) || [];

  // Enrichir chaque bâtiment avec son détail (IfcPostalAddress inclus).
  const buildings = [];
  for (const b of buildingsRaw) {
    const uuid = b.uuid;
    let merged = b;
    if (uuid) {
      const detail = await safeGet(`détail bâtiment ${uuid}`, () => client.getBuildingDetail(uuid), note);
      if (detail) merged = { ...b, ...detail };
    }
    buildings.push(merged);
  }

  const storeys = (await safeGet("étages", () => client.getStoreys(), note)) || [];
  const spaces = (await safeGet("espaces", () => client.getSpaces(), note)) || [];
  const elements = (await safeGet("éléments", () => client.getRawElements(), note)) || [];
  const elementTypes = (await safeGet("types", () => client.getElementTypes(), note)) || [];
  const systems = (await safeGet("systèmes", () => client.getSystems(), note)) || [];
  const zones = (await safeGet("zones", () => client.getZones(), note)) || [];

  note(`  ${sites.length} site(s), ${buildings.length} bâtiment(s), ${storeys.length} étage(s), ${spaces.length} espace(s), ${elements.length} élément(s)`);

  // Enrich spaces from elements (le endpoint /space ne renvoie pas les psets).
  const elementsByUuid = new Map(elements.map((e) => [e.uuid, e]));
  for (const sp of spaces) {
    const el = elementsByUuid.get(sp.uuid);
    if (el) sp.property_sets = el.property_sets || [];
  }

  // Parcours de l'arbre spatial pour les mappings hérités.
  const ctx = {
    spaceToStorey: new Map(),
    elementToStorey: new Map(),
    elementToSpace: new Map(),
    elementObjectType: new Map(),
  };
  try {
    const tree = await client.getStructureTree();
    walkSpatialTree(tree, ctx, null, null);
  } catch (e) {
    note(`  Avertissement: impossible de charger structure_file: ${e.message || e}`);
  }

  for (const sp of spaces) {
    const sUuid = ctx.spaceToStorey.get(sp.uuid);
    if (sUuid) sp.storey_uuid = sUuid;
  }
  const spacesByUuid = new Map(spaces.map((sp) => [sp.uuid, sp]));
  for (const el of elements) {
    const u = el.uuid;
    if (ctx.elementToStorey.has(u)) el.storey_uuid = ctx.elementToStorey.get(u);
    const spUuid = ctx.elementToSpace.get(u);
    if (spUuid && spacesByUuid.has(spUuid)) el.space = spacesByUuid.get(spUuid).id;
    if (ctx.elementObjectType.has(u) && !el.object_type) el.object_type = ctx.elementObjectType.get(u);
  }

  note("Construction de l'index spatial...");
  const index = new SpatialIndex(buildings, storeys, spaces, elements);

  note("Génération des feuilles COBie...");
  const sheets = {
    Facility: facility.build(buildings, project, model, sites),
    Floor: floor.build(storeys),
    Space: space.build(spaces, index),
    Zone: zone.build(zones),
    Type: type_.build(elementTypes, elements),
    Component: component.build(elements, index),
    System: system.build(systems),
    Attribute: attribute.build(buildings, storeys, spaces, elements),
  };

  for (const [name, rows] of Object.entries(sheets)) {
    note(`  ${name}: ${rows.length} ligne(s)`);
  }

  const modelName = (model && model.name) || (project && project.name) || "cobie_output";
  return { sheets, modelName };
}

export const SHEET_HEADERS = {
  Facility: facility.HEADERS,
  Floor: floor.HEADERS,
  Space: space.HEADERS,
  Zone: zone.HEADERS,
  Type: type_.HEADERS,
  Component: component.HEADERS,
  System: system.HEADERS,
  Attribute: attribute.HEADERS,
};
