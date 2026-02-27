# Contrat `story.json` (Studio Auteur)

Ce document fige le format exporte par l outil auteur pour la partie lecture.
Version courante: `schemaVersion = "1.1.0"`.

## Racine

```json
{
  "schemaVersion": "1.1.0",
  "exportedAt": "2026-02-24T10:00:00.000Z",
  "project": {
    "id": "project_xxx",
    "title": "Titre",
    "slug": "titre",
    "synopsis": "...",
    "startBlockId": "title_xxx",
    "updatedAt": "2026-02-24T10:00:00.000Z"
  },
  "variables": [],
  "itemsCatalog": [],
  "blocks": [],
  "graph": {
    "edges": []
  }
}
```

## Variables

- `variables[]` contient:
- `id`: string unique
- `name`: string
- `initialValue`: number

## Inventaire

- `itemsCatalog[]` contient:
- `id`: string unique
- `name`: string
- `description`: string
- `iconAssetId`: string | null
- `iconPath`: string | null

## Blocs

Chaque bloc contient au minimum:
- `id`: string
- `type`: `title | cinematic | dialogue | gameplay`
- `name`: string
- `position`: `{ x: number, y: number }`
- `notes`: string

### `title`

- `storyTitle`: string
- `subtitle`: string
- `backgroundPath`: string | null
- `buttonStyle`: `{ backgroundColor, textColor, borderColor, radius, fontSize }`
- `nextBlockId`: string | null

### `cinematic`

- `heading`: string
- `body`: string
- `backgroundPath`: string | null
- `videoPath`: string | null
- `voicePath`: string | null
- `autoAdvanceSeconds`: number | null
- `nextBlockId`: string | null

### `dialogue`

- `speaker`: string
- `line`: string
- `backgroundPath`: string | null
- `characterPath`: string | null
- `voicePath`: string | null
- `choices[]` (max 4):
- `id`: string
- `label`: `A | B | C | D`
- `text`: string
- `targetBlockId`: string | null
- `effects[]`: `{ variableId, variableName, delta }`

### `gameplay` (point_and_click)

- `mode`: string (`point_and_click` exporte actuellement)
- `objective`: string
- `backgroundPath`: string | null
- `voicePath`: string | null
- `overlays[]`:
- `id`, `name`, `x`, `y`, `width`, `height`, `zIndex`, `visibleByDefault`, `imagePath`
- `hotspots[]`:
- `id`, `name`, `x`, `y`, `width`, `height`, `required`, `message`, `toggleOverlayId`, `soundPath`, `effects[]`
- `onClickActions[]`:
- `message`: `{ id, type: "message", message }`
- `add_item`: `{ id, type: "add_item", itemId, quantity }`
- `disable_hotspot`: `{ id, type: "disable_hotspot", targetHotspotId }`
- `go_to_block`: `{ id, type: "go_to_block", targetBlockId }`
- `completionRule`: `{ type: "all_required" | "required_count", requiredCount: number }`
- `completionEffects[]`: `{ variableId, variableName, delta }`
- `nextBlockId`: string | null

## Coordonnees gameplay

- `x`, `y`, `width`, `height` sont en pourcentage (`0..100`).
- `x`, `y` representent le coin haut-gauche de l element.

## Graphe

- `graph.edges[]` contient:
- `source`: id bloc source
- `sourceHandle`: `next` ou `choice-A/B/C/D`
- `target`: id bloc cible

## Assets

- Les chemins (`backgroundPath`, `imagePath`, `soundPath`, etc.) pointent vers le zip exporte.
- Convention: `assets/{asset_id}-{nom_fichier_sanitize}`.

## Regles de compatibilite

- Ajout de champs: autorise sans casser les lecteurs tolerants.
- Suppression/renommage de champs: breaking change -> increment de `schemaVersion`.
- Le lecteur doit ignorer les champs inconnus.
