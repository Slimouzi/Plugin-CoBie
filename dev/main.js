/**
 * Harnais de développement local : monte CobieExportButton dans une page
 * isolée avec un contexte viewer simulé et un fetch interceptor qui sert
 * des fixtures BIMData synthétiques.
 *
 * Lance avec : npm run dev
 */
import { createApp, h } from "vue";
import { fixtures, installMockFetch } from "./mock-fixtures.js";
import CobieExportButton from "../src/CobieExportButton.vue";

installMockFetch();

const summary = document.getElementById("fixtures-summary");
if (summary) {
  summary.textContent = [
    `model         → ${fixtures.model.name}`,
    `buildings     → ${fixtures.buildings.length}`,
    `storeys       → ${fixtures.storeys.length}`,
    `spaces        → ${fixtures.spaces.length}`,
    `zones         → ${fixtures.zones.length}`,
    `systems       → ${fixtures.systems.length}`,
    `raw.elements  → ${fixtures.rawElements.elements.length}`,
    `raw.psets     → ${fixtures.rawElements.property_sets.length}`,
  ].join("\n");
}

// Contexte minimal que le viewer BIMData fournirait au plugin.
const mockContext = {
  api: { getAccessToken: async () => "mock-access-token" },
  cloud: { id: "mock-cloud" },
  project: { id: "mock-project", name: "Projet Mock" },
  model: { id: "mock-model", name: "Mock Building" },
};

createApp({
  render: () => h(CobieExportButton, mockContext),
}).mount("#app");
