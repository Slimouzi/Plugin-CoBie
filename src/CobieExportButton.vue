<template>
  <button
    class="cobie-export-btn"
    :disabled="loading"
    :title="tooltip"
    @click="onExport"
  >
    <span v-if="!loading">📥 Export COBie</span>
    <span v-else>⏳ {{ progress || "Extraction…" }}</span>
  </button>
  <p v-if="error" class="cobie-error">{{ error }}</p>
</template>

<script setup>
import { computed, ref } from "vue";
import { BIMDataClient } from "./lib/bimdataClient.js";
import { extractCobie } from "./lib/extractor.js";
import { buildXlsxBlob } from "./lib/exporter.js";

const props = defineProps({
  api: { type: Object, default: () => ({}) },
  cloud: { type: Object, default: () => ({}) },
  project: { type: Object, default: () => ({}) },
  model: { type: Object, default: () => ({}) },
});

const loading = ref(false);
const error = ref("");
const progress = ref("");

const tooltip = computed(() => `Extrait le COBie du modèle « ${props.model?.name || "?"} »`);

async function resolveAccessToken() {
  if (typeof props.api?.getAccessToken === "function") return await props.api.getAccessToken();
  return props.api?.accessToken || props.api?.user?.accessToken || null;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeName(s) {
  return (s || "export").replace(/[\\/:*?"<>|]+/g, "_");
}

async function onExport() {
  error.value = "";
  progress.value = "";
  loading.value = true;
  try {
    const accessToken = await resolveAccessToken();
    if (!accessToken) throw new Error("Token d'accès BIMData introuvable dans le contexte plugin.");
    const cloudId = props.cloud?.id;
    const projectId = props.project?.id;
    const modelId = props.model?.id;
    if (!cloudId || !projectId || !modelId) {
      throw new Error("Identifiants cloud/project/model manquants dans le contexte.");
    }

    const client = new BIMDataClient({ cloudId, projectId, modelId, accessToken });
    const { sheets, modelName } = await extractCobie(client, (msg) => {
      progress.value = msg.replace(/^\s+/, "").slice(0, 80);
      // eslint-disable-next-line no-console
      console.info("[cobie-export]", msg);
    });

    progress.value = "Génération xlsx…";
    const blob = await buildXlsxBlob(sheets);

    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
    downloadBlob(blob, `COBie_${safeName(modelName)}_${ts}.xlsx`);
  } catch (err) {
    error.value = err?.message || String(err);
    // eslint-disable-next-line no-console
    console.error("[cobie-export]", err);
  } finally {
    loading.value = false;
    progress.value = "";
  }
}
</script>

<style scoped>
.cobie-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid #2563eb;
  background: #2563eb;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}
.cobie-export-btn:hover:not(:disabled) { background: #1d4ed8; }
.cobie-export-btn:disabled { opacity: 0.6; cursor: progress; }
.cobie-error {
  color: #b91c1c;
  font-size: 0.8rem;
  margin: 0.3rem 0 0;
  max-width: 320px;
}
</style>
