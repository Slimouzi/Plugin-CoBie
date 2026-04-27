/**
 * Plugin BIMData Viewer : "Export COBie" 100% navigateur.
 *
 * Récupère le modèle via l'API BIMData (token OAuth2 fourni par le viewer),
 * construit les 8 feuilles COBie en JS, génère le xlsx avec exceljs, et
 * déclenche le téléchargement — sans backend.
 */
import CobieExportButton from "./CobieExportButton.vue";

// Réexports pour usage hors viewer (tests, intégrations custom).
export { BIMDataClient } from "./lib/bimdataClient.js";
export { extractCobie, SHEET_HEADERS } from "./lib/extractor.js";
export { buildXlsxBlob } from "./lib/exporter.js";

export default {
  name: "cobie-export",
  component: CobieExportButton,
  addToWindows: ["3d", "viewer3d"],
  button: {
    position: "right",
    icon: "download",
    keepOpen: false,
  },
};
