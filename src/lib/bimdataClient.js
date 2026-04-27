/**
 * Client HTTP BIMData côté navigateur (fetch).
 *
 * Reçoit cloud_id / project_id / model_id et un access_token OAuth2 fourni
 * par le viewer (via api.getAccessToken()). Toutes les routes utilisent le
 * préfixe /model/ (l'ancien préfixe /ifc/ est déprécié).
 */

const DEFAULT_BASE_URL = "https://api.bimdata.io";

export class BIMDataClient {
  /**
   * @param {object} opts
   * @param {string|number} opts.cloudId
   * @param {string|number} opts.projectId
   * @param {string|number} opts.modelId
   * @param {string} opts.accessToken  Bearer OAuth2
   * @param {string} [opts.baseUrl="https://api.bimdata.io"]
   */
  constructor({ cloudId, projectId, modelId, accessToken, baseUrl } = {}) {
    if (!cloudId || !projectId || !modelId) {
      throw new Error("BIMDataClient: cloudId, projectId, modelId requis.");
    }
    if (!accessToken) {
      throw new Error("BIMDataClient: accessToken requis.");
    }
    this.cloudId = cloudId;
    this.projectId = projectId;
    this.modelId = modelId;
    this.accessToken = accessToken;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  _modelPath(suffix = "") {
    return `/cloud/${this.cloudId}/project/${this.projectId}/model/${this.modelId}${suffix}`;
  }

  async _get(path, params) {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`BIMData ${resp.status} ${resp.statusText} on ${path}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
    }
    return resp.json();
  }

  // ── Hiérarchie spatiale ────────────────────────────────────────────────

  getSites() {
    return this._get(this._modelPath("/element"), { type: "IfcSite" });
  }

  getBuildings() {
    return this._get(this._modelPath("/building"));
  }

  getBuildingDetail(uuid) {
    return this._get(this._modelPath(`/building/${uuid}`));
  }

  getStoreys() {
    return this._get(this._modelPath("/storey"));
  }

  getSpaces() {
    return this._get(this._modelPath("/space"));
  }

  getZones() {
    return this._get(this._modelPath("/zone"));
  }

  // ── Éléments ───────────────────────────────────────────────────────────

  /**
   * /element/raw : route optimisée renvoyant la totalité des éléments en
   * forme normalisée. On dénormalise pour exposer la même structure que
   * /element aux builders COBie (psets/classifications/layers/materials
   * inlinés).
   */
  async getRawElements() {
    const raw = await this._get(this._modelPath("/element/raw"));
    return BIMDataClient.denormalizeRawElements(raw);
  }

  static denormalizeRawElements(raw) {
    if (!raw || typeof raw !== "object") return [];
    const defs = raw.definitions || [];
    const psetsTable = raw.property_sets || [];
    const layersTable = raw.layers || [];
    const classificationsTable = raw.classifications || [];
    const materialsTable = (raw.materials && raw.materials.materials_data) || [];

    const expandPset = (idx) => {
      if (!Number.isInteger(idx) || idx < 0 || idx >= psetsTable.length) return null;
      const p = psetsTable[idx];
      const properties = (p.properties || []).map((prop) => {
        const di = prop.def_id;
        const df = Number.isInteger(di) && di >= 0 && di < defs.length ? defs[di] : {};
        return {
          definition: { name: df.name, value_type: df.value_type, unit: df.unit, description: df.description },
          value: prop.value,
        };
      });
      return { name: p.name, type: p.type, description: p.description, properties };
    };

    const byIndex = (table, indices) =>
      (indices || [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < table.length)
        .map((i) => table[i]);

    const out = [];
    for (const el of raw.elements || []) {
      const attrPset = expandPset(el.attributes);
      const attrLookup = {};
      if (attrPset) {
        for (const prop of attrPset.properties) {
          const nm = prop.definition && prop.definition.name;
          if (nm) attrLookup[nm] = prop.value;
        }
      }
      const psetsInlined = (el.psets || []).map(expandPset).filter(Boolean);
      const materialList = (el.material_list || [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < materialsTable.length)
        .map((i) => ({ material: { name: materialsTable[i].name } }));

      out.push({
        uuid: el.uuid,
        type: el.type,
        name: attrLookup.Name,
        description: attrLookup.Description,
        longname: attrLookup.LongName,
        object_type: attrLookup.ObjectType,
        attributes: attrPset,
        property_sets: psetsInlined,
        classifications: byIndex(classificationsTable, el.classifications),
        layers: byIndex(layersTable, el.layers),
        material_list: materialList,
      });
    }
    return out;
  }

  // ── Types ──────────────────────────────────────────────────────────────

  async getElementTypes() {
    try {
      return await this._get(this._modelPath("/element-type"));
    } catch {
      return []; // endpoint pas toujours disponible — fallback dans la feuille Type
    }
  }

  // ── Systèmes ───────────────────────────────────────────────────────────

  getSystems() {
    return this._get(this._modelPath("/system"));
  }

  // ── Projet / modèle ────────────────────────────────────────────────────

  getProject() {
    return this._get(`/cloud/${this.cloudId}/project/${this.projectId}`);
  }

  getModel() {
    return this._get(this._modelPath());
  }

  /**
   * structure.json : arborescence project → site → building → storey → space → element.
   * L'URL signée est dans model.structure_file (S3, sans header Authorization).
   */
  async getStructureTree() {
    const model = await this.getModel();
    const url = model && model.structure_file;
    if (!url) return [];
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`structure_file ${resp.status} ${resp.statusText}`);
    return resp.json();
  }
}
