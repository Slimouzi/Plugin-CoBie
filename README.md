# Plugin CoBie — BIMData Viewer

Plugin **100% navigateur** pour le [BIMData Viewer](https://github.com/bimdata/bimdata-viewer-sdk). Ajoute un bouton **« Export COBie »** dans la fenêtre 3D : au clic, le plugin appelle directement l'API BIMData avec le token OAuth2 du viewer, construit les 8 feuilles COBie en JS, génère le xlsx avec [exceljs](https://github.com/exceljs/exceljs) et déclenche le téléchargement.

**Pas de backend, pas de serveur intermédiaire.** Tout se passe dans le navigateur.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  Viewer BIMData (navigateur)               │
│                                                            │
│   CobieExportButton ──► BIMDataClient (fetch)              │
│                              │                             │
│                              ▼                             │
│                       api.bimdata.io  /element/raw, etc.   │
│                              │                             │
│                              ▼                             │
│                  extractor.js (8 feuilles)                 │
│                              │                             │
│                              ▼                             │
│                   exporter.js (exceljs ► xlsx Blob)        │
│                              │                             │
│                              ▼                             │
│                       téléchargement xlsx                  │
└────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install cobie-bimdata-viewer-plugin
```

```js
import { createBIMDataViewer } from "@bimdata/viewer";
import cobieExport from "cobie-bimdata-viewer-plugin";
import "cobie-bimdata-viewer-plugin/style.css";

const viewer = createBIMDataViewer({
  /* ... */
  plugins: [cobieExport],
});
```

Le plugin lit automatiquement `cloud.id`, `project.id`, `model.id` et `api.getAccessToken()` du contexte fourni par `bimdata-viewer`.

## Build depuis les sources

```bash
git clone https://github.com/Slimouzi/Plugin-CoBie.git
cd Plugin-CoBie
npm install
npm run build
# → dist/cobie-bimdata-viewer-plugin.es.js (+ .umd.js + style.css)
```

## Feuilles COBie générées

| Feuille | Source IFC | Notes |
|---------|------------|-------|
| Facility | IfcBuilding (+ IfcProject fallback) | IfcPostalAddress + Lat/Long depuis IfcSite |
| Floor | IfcBuildingStorey | Elevation, hauteur depuis Pset_BuildingStoreyCommon |
| Space | IfcSpace | FloorName via index spatial, surfaces depuis Qto |
| Zone | IfcZone | Liste des espaces membres |
| Type | IfcTypeObject *(fallback : déduit des composants)* | Manufacturer, ModelNumber, Warranty… |
| Component | Tous IfcElement non-spatial | TypeName, Space, FloorName, BaseQuantities |
| System | IfcSystem / IfcGroup | Liste des composants |
| Attribute | Toutes propriétés non-couvertes | Une ligne par propriété, avec sheet+row de référence |

## Routes BIMData consommées

Toutes en `GET` sur `https://api.bimdata.io/cloud/{cloudId}/project/{projectId}/model/{modelId}/...` :
- `/building`, `/building/{uuid}` (détail avec IfcPostalAddress)
- `/storey`, `/space`, `/zone`, `/system`
- `/element?type=IfcSite`, `/element-type` (best-effort)
- `/element/raw` (route optimisée bulk → dénormalisation locale)
- `structure_file` (S3 signé, parcours de l'arbre spatial)
- `/cloud/{cloudId}/project/{projectId}` et `/cloud/{cloudId}/project/{projectId}/model/{modelId}` (métadonnées)

Le token OAuth2 est lu du viewer ; aucun secret n'est embarqué dans le bundle.

## Validation locale

Avant publication, trois moyens de valider l'intégration sans dépendre d'un
backend :

### 1. Harnais dev/ avec fetch mocké

```bash
npm install
npm run dev
# → http://localhost:5173 — bouton plugin monté avec un contexte viewer
#    simulé. fetch est intercepté et sert des fixtures BIMData synthétiques
#    (8 feuilles non vides, lat/long, address, pset_X, etc.).
```

Le clic sur « Export COBie » télécharge un xlsx réel généré par
`buildXlsxBlob` à partir des fixtures (`dev/mock-fixtures.js`).

### 2. Validation du flux xlsx

```bash
npm run validate:xlsx
```

Génère un xlsx synthétique avec `buildXlsxBlob` et le relit avec ExcelJS pour
vérifier : 8 feuilles, headers conformes à `SHEET_HEADERS`, header bold + fill
solid + bordures, freeze pane sur ligne 1, round-trip numérique exact.

### 3. Stress test SpatialIndex (mémoire)

```bash
npm run validate:spatial
```

Construit un `SpatialIndex` sur 50 étages × 5 000 espaces × 100 000 éléments,
vérifie que le heap revient à son baseline après libération (seuil 30 MB) et
que les queries (`storeyOfElement`, `spaceOfElement`) n'allouent rien de
durable.

### 4. npm link dans un projet viewer existant

```bash
# Dans le repo plugin
cd Plugin-CoBie
npm run build          # produit dist/
npm link

# Dans votre projet viewer
cd ../mon-projet-viewer
npm link cobie-bimdata-viewer-plugin
```

Le plugin sera résolu depuis le checkout local. Toute reconstruction
(`npm run build`) sera immédiatement visible côté viewer après reload.

## Repo associé

L'implémentation Python complète (CLI + serveur MCP + audits) reste maintenue dans [Slimouzi/COBie-extract](https://github.com/Slimouzi/COBie-extract). Ce plugin en est la version client pure JS.

## Licence

MIT — voir [LICENSE](./LICENSE).
