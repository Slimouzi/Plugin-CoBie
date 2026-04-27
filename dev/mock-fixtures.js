/**
 * Fixtures BIMData synthétiques pour le harnais dev/.
 *
 * Les routes répliquent la forme attendue par BIMDataClient et les builders
 * de feuilles. /element/raw utilise la forme normalisée (definitions +
 * tables d'index property_sets/layers/classifications/materials), c'est ce
 * que dénormalise BIMDataClient.denormalizeRawElements.
 */

const STOREY_UUID = "uuid-storey-rdc";
const SPACE_1_UUID = "uuid-space-101";
const SPACE_2_UUID = "uuid-space-102";
const BUILDING_UUID = "uuid-bld-1";
const SITE_UUID = "uuid-site-1";

export const fixtures = {
  // GET /cloud/{c}/project/{p}
  project: { id: 1, name: "Projet Mock" },

  // GET /cloud/{c}/project/{p}/model/{m}
  model: {
    id: 1,
    name: "Mock Building",
    structure_file: "https://mock.bimdata.io/structure.json",
  },

  // structure_file (S3)
  structure: [
    {
      uuid: "uuid-project",
      type: "IfcProject",
      children: [
        {
          uuid: SITE_UUID,
          type: "IfcSite",
          children: [
            {
              uuid: BUILDING_UUID,
              type: "IfcBuilding",
              children: [
                {
                  uuid: STOREY_UUID,
                  type: "IfcBuildingStorey",
                  children: [
                    { uuid: SPACE_1_UUID, type: "IfcSpace", children: [{ uuid: "uuid-wall-1", type: "IfcWall" }] },
                    { uuid: SPACE_2_UUID, type: "IfcSpace", children: [{ uuid: "uuid-wall-2", type: "IfcWall" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],

  buildings: [{ uuid: BUILDING_UUID, name: "Bâtiment Mock", description: "Bâtiment de démonstration" }],
  buildingDetail: {
    uuid: BUILDING_UUID,
    name: "Bâtiment Mock",
    description: "Bâtiment de démonstration",
    address: {
      addressLines: ["1 rue de la République"],
      town: "Paris",
      postalCode: "75001",
      country: "France",
    },
  },
  storeys: [{ uuid: STOREY_UUID, name: "RDC", elevation: 0 }],
  spaces: [
    { uuid: SPACE_1_UUID, name: "Bureau 101", description: "Bureau ouvert" },
    { uuid: SPACE_2_UUID, name: "Bureau 102", description: "Bureau fermé" },
  ],
  zones: [
    { uuid: "uuid-zone-tertiaire", name: "Zone Tertiaire", spaces: [SPACE_1_UUID, SPACE_2_UUID] },
  ],
  systems: [{ uuid: "uuid-sys-cvc", name: "CVC principal", elements: ["uuid-wall-1"] }],
  sites: [
    {
      uuid: SITE_UUID,
      type: "IfcSite",
      attributes: {
        properties: [
          { definition: { name: "RefLatitude" }, value: [48, 51, 23] },
          { definition: { name: "RefLongitude" }, value: [2, 21, 7] },
        ],
      },
    },
  ],
  elementTypes: [],

  // /element/raw — forme normalisée
  rawElements: {
    definitions: [
      { name: "Name", value_type: "string" },
      { name: "Description", value_type: "string" },
      { name: "Color", value_type: "string" },
    ],
    property_sets: [
      // 0 — attributes pour wall-1
      { name: "Attributes", type: "BaseAttributes", properties: [{ def_id: 0, value: "Mur W-001" }, { def_id: 1, value: "Mur béton" }] },
      // 1 — attributes pour wall-2
      { name: "Attributes", type: "BaseAttributes", properties: [{ def_id: 0, value: "Mur W-002" }] },
      // 2 — pset Pset_X attaché à wall-1
      { name: "Pset_X", type: "PropertySet", properties: [{ def_id: 2, value: "Blanc" }] },
    ],
    layers: [],
    classifications: [],
    materials: { materials_data: [{ name: "Béton" }] },
    elements: [
      { uuid: "uuid-wall-1", type: "IfcWall", attributes: 0, psets: [2], classifications: [], layers: [], material_list: [0] },
      { uuid: "uuid-wall-2", type: "IfcWall", attributes: 1, psets: [], classifications: [], layers: [], material_list: [] },
    ],
  },
};

/**
 * Installe un mock global de fetch qui matche les routes BIMData consommées
 * par BIMDataClient. Retourne une fonction `restore()` pour rétablir le
 * fetch original.
 */
export function installMockFetch() {
  const original = globalThis.fetch;
  const F = fixtures;

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url, "https://api.bimdata.io");
    const p = u.pathname;
    const q = u.searchParams;

    // structure_file (signé S3)
    if (u.host === "mock.bimdata.io" && p === "/structure.json") return json(F.structure);

    // /cloud/{c}/project/{p}/model/{m}/...
    const modelPrefix = /^\/cloud\/[^/]+\/project\/[^/]+\/model\/[^/]+/;
    if (modelPrefix.test(p)) {
      const sub = p.replace(modelPrefix, "") || "";
      if (sub === "" || sub === "/") return json(F.model);
      if (sub === "/element/raw") return json(F.rawElements);
      if (sub === "/element-type") return json(F.elementTypes);
      if (sub === "/element" && q.get("type") === "IfcSite") return json(F.sites);
      if (sub === "/building") return json(F.buildings);
      if (sub.startsWith("/building/")) return json(F.buildingDetail);
      if (sub === "/storey") return json(F.storeys);
      if (sub === "/space") return json(F.spaces);
      if (sub === "/zone") return json(F.zones);
      if (sub === "/system") return json(F.systems);
      return json({ detail: `mock: route non gérée ${sub}` }, 404);
    }
    // /cloud/{c}/project/{p}
    if (/^\/cloud\/[^/]+\/project\/[^/]+$/.test(p)) return json(F.project);

    // Délègue le reste à fetch natif si dispo (utile pour des assets locaux)
    if (original) return original(input);
    return json({ detail: "mock: aucun match" }, 404);
  };

  return () => {
    globalThis.fetch = original;
  };
}
