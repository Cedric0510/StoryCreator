import { Edge, MarkerType, Node } from "@xyflow/react";

import { StoryNodeData } from "@/components/StoryNode";
import {
  AssetRef,
  ChoiceLabel,
  DialogueBlock,
  GameplayBlock,
  GameplayHotspotClickAction,
  GameplayHotspotClickActionType,
  GameplayHotspot,
  GameplayOverlay,
  ProjectMeta,
  STORY_SCHEMA_VERSION,
  StoryBlock,
  TitleBlock,
  createDefaultHeroProfile,
  createBlock,
  createGameplayHotspotClickAction,
  createId,
  normalizeStoryBlock,
} from "@/lib/story";

export type EditorNode = Node<StoryNodeData>;
export type EditorEdge = Edge<{ label?: string }>;

export interface InitialStudio {
  nodes: EditorNode[];
  edges: EditorEdge[];
  project: ProjectMeta;
}

export interface CloudPayload {
  project: ProjectMeta;
  nodes: EditorNode[];
  edges: EditorEdge[];
  assetRefs: Record<string, AssetRef>;
}

export function choiceLabelFromHandle(handle: string | null | undefined) {
  if (!handle) return null;
  const match = /^choice-([A-D])$/.exec(handle);
  return match ? (match[1] as ChoiceLabel) : null;
}

export function buildEdge(source: string, target: string, sourceHandle: string): EditorEdge {
  const label = sourceHandle === "npc-link" ? "PNJ" : choiceLabelFromHandle(sourceHandle);
  const isNpcLink = sourceHandle === "npc-link";

  return {
    id: createId("edge"),
    source,
    target,
    sourceHandle,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#0f172a",
    },
    style: {
      stroke: isNpcLink ? "#0ea5e9" : "#0f172a",
      strokeWidth: 1.8,
      strokeDasharray: isNpcLink ? "6 4" : undefined,
    },
    label,
    labelStyle: {
      fontSize: 11,
      fontWeight: 700,
      fill: "#0f172a",
    },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 8,
    labelBgStyle: {
      fill: "#cbd5e1",
      fillOpacity: 0.94,
    },
  };
}

export function blockToNode(block: StoryBlock): EditorNode {
  const normalizedBlock = normalizeStoryBlock(block);
  return {
    id: normalizedBlock.id,
    type: "storyBlock",
    position: normalizedBlock.position,
    data: {
      block: normalizedBlock,
      isStart: false,
      hasError: false,
      hasWarning: false,
    },
  };
}

export function toSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function formatDbError(
  prefix: string,
  error: { message: string; code?: string | null; details?: string | null; hint?: string | null } | null,
) {
  if (!error) return `${prefix}: unknown`;

  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  return `${prefix}: ${parts.join(" | ")}`;
}

export function blockFromNode(node: EditorNode): StoryBlock {
  const block: StoryBlock = {
    ...node.data.block,
    position: node.position,
  };

  return normalizeStoryBlock(block);
}

export function collectAssetIds(block: StoryBlock) {
  if (block.type === "title") {
    return block.backgroundAssetId ? [block.backgroundAssetId] : [];
  }
  if (block.type === "cinematic") {
    return [block.backgroundAssetId, block.videoAssetId, block.voiceAssetId].filter(
      (value): value is string => Boolean(value),
    );
  }
  if (block.type === "dialogue") {
    return [block.backgroundAssetId, block.characterAssetId, block.npcImageAssetId, block.voiceAssetId].filter(
      (value): value is string => Boolean(value),
    );
  }
  if (block.type === "hero_profile") {
    return [];
  }
  if (block.type === "npc_profile") {
    return block.imageAssetIds.filter((value): value is string => Boolean(value));
  }
  const overlayIds = block.overlays
    .map((overlay) => overlay.assetId)
    .filter((value): value is string => Boolean(value));
  const hotspotSoundIds = block.hotspots
    .map((hotspot) => hotspot.soundAssetId)
    .filter((value): value is string => Boolean(value));
  return [block.backgroundAssetId, block.voiceAssetId, ...overlayIds, ...hotspotSoundIds].filter(
    (value): value is string => Boolean(value),
  );
}

export function collectReferencedAssetIds(blocks: StoryBlock[]) {
  const referencedAssetIds = new Set<string>();
  for (const block of blocks) {
    for (const assetId of collectAssetIds(block)) {
      referencedAssetIds.add(assetId);
    }
  }
  return referencedAssetIds;
}

export function collectProjectReferencedAssetIds(
  project: Pick<ProjectMeta, "items">,
  blocks: StoryBlock[],
) {
  const referencedAssetIds = collectReferencedAssetIds(blocks);
  const items = Array.isArray(project.items) ? project.items : [];
  for (const item of items) {
    if (item.iconAssetId) {
      referencedAssetIds.add(item.iconAssetId);
    }
  }
  return referencedAssetIds;
}

export function clampPercent(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Number(value.toFixed(2));
}

export function normalizeRectPercent(rect: { x: number; y: number; width: number; height: number }) {
  return {
    x: clampPercent(rect.x),
    y: clampPercent(rect.y),
    width: clampPercent(rect.width <= 0 ? 1 : rect.width),
    height: clampPercent(rect.height <= 0 ? 1 : rect.height),
  };
}

export function defaultGameplayOverlayDraft(): GameplayOverlay {
  return {
    id: createId("overlay"),
    name: "Objet",
    assetId: null,
    x: 35,
    y: 35,
    width: 20,
    height: 20,
    zIndex: 2,
    visibleByDefault: true,
  };
}

export function defaultGameplayHotspotDraft(): GameplayHotspot {
  return {
    id: createId("hotspot"),
    name: "Zone",
    required: true,
    message: "",
    toggleOverlayId: null,
    soundAssetId: null,
    effects: [],
    onClickActions: [],
    x: 35,
    y: 35,
    width: 20,
    height: 20,
  };
}

export function defaultGameplayHotspotActionDraft(
  type: GameplayHotspotClickActionType = "message",
): GameplayHotspotClickAction {
  return createGameplayHotspotClickAction(type);
}

export function requiredHotspotIds(block: GameplayBlock) {
  const required = block.hotspots.filter((hotspot) => hotspot.required).map((hotspot) => hotspot.id);
  if (required.length > 0) return required;
  return block.hotspots.map((hotspot) => hotspot.id);
}

export function isGameplayPointClickCompleted(block: GameplayBlock, foundHotspotIds: Set<string>) {
  if (block.hotspots.length === 0) return true;
  if (block.completionRule.type === "required_count") {
    const requiredCount = Math.max(1, Math.floor(block.completionRule.requiredCount || 1));
    return foundHotspotIds.size >= requiredCount;
  }

  const mustFind = requiredHotspotIds(block);
  return mustFind.every((hotspotId) => foundHotspotIds.has(hotspotId));
}

export async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function buildInitialStudio(): InitialStudio {
  const titleBlock = createBlock("title", { x: 70, y: 120 }) as TitleBlock;
  const introBlock = createBlock("cinematic", { x: 410, y: 120 });
  const dialogueBlock = createBlock("dialogue", { x: 760, y: 280 }) as DialogueBlock;

  titleBlock.name = "Accueil histoire";
  titleBlock.storyTitle = "Nouvelle histoire";
  titleBlock.subtitle = "Un moteur de light novel";
  titleBlock.nextBlockId = introBlock.id;

  if (introBlock.type === "cinematic") {
    introBlock.name = "Scene intro";
    introBlock.heading = "Prologue";
    introBlock.body = "L'aube se leve sur la ville. Le joueur rejoint son equipe.";
    introBlock.nextBlockId = dialogueBlock.id;
  }

  dialogueBlock.name = "Premier choix";
  dialogueBlock.speaker = "Ami";
  dialogueBlock.line = "As-tu bien dormi ?";
  dialogueBlock.choices = dialogueBlock.choices.map((choice) => {
    if (choice.label === "A") return { ...choice, text: "Oui" };
    if (choice.label === "B") return { ...choice, text: "Non" };
    return choice;
  });

  const nodes = [blockToNode(titleBlock), blockToNode(introBlock), blockToNode(dialogueBlock)];
  const edges = [
    buildEdge(titleBlock.id, introBlock.id, "next"),
    buildEdge(introBlock.id, dialogueBlock.id, "next"),
  ];

  const ownerId = createId("member");
  const editorId = createId("member");

  const project: ProjectMeta = {
    info: {
      id: createId("project"),
      title: "Untitled Story",
      slug: "untitled-story",
      synopsis: "Prototype light novel data-driven.",
      startBlockId: titleBlock.id,
      schemaVersion: STORY_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    },
    variables: [
      { id: createId("var"), name: "energie", initialValue: 0 },
      { id: createId("var"), name: "relation_ami", initialValue: 0 },
    ],
    items: [],
    hero: createDefaultHeroProfile(),
    members: [
      { id: ownerId, name: "Auteur A", role: "owner" },
      { id: editorId, name: "Auteur B", role: "editor" },
    ],
    activeMemberId: ownerId,
    editingLockMemberId: ownerId,
    logs: [
      {
        id: createId("log"),
        memberId: ownerId,
        timestamp: new Date().toISOString(),
        action: "project_init",
        details: "Projet initialise avec 3 blocs de base.",
      },
    ],
  };

  return { nodes, edges, project };
}

export function describeEffect(delta: number) {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function normalizeDelta(value: string) {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return 0;
  return parsed;
}

export function removeNodeReferences(block: StoryBlock, removedBlockId: string): StoryBlock {
  if (block.type === "dialogue") {
    return {
      ...block,
      npcProfileBlockId:
        block.npcProfileBlockId === removedBlockId ? null : block.npcProfileBlockId,
      npcImageAssetId: block.npcProfileBlockId === removedBlockId ? null : block.npcImageAssetId,
      choices: block.choices.map((choice) =>
        choice.targetBlockId === removedBlockId
          ? { ...choice, targetBlockId: null }
          : choice,
      ),
    };
  }

  if (block.type === "gameplay") {
    const nextBlockId = block.nextBlockId === removedBlockId ? null : block.nextBlockId;
    return {
      ...block,
      nextBlockId,
      hotspots: block.hotspots.map((hotspot) => ({
        ...hotspot,
        onClickActions: hotspot.onClickActions.map((action) =>
          action.type === "go_to_block" && action.targetBlockId === removedBlockId
            ? { ...action, targetBlockId: null }
            : action,
        ),
      })),
    };
  }

  if (block.nextBlockId === removedBlockId) {
    return { ...block, nextBlockId: null };
  }

  return block;
}

export function removeVariableReferences(block: StoryBlock, removedVariableId: string): StoryBlock {
  const nextEntryEffects = (block.entryEffects ?? []).filter(
    (effect) => effect.variableId !== removedVariableId,
  );

  if (block.type === "dialogue") {
    return {
      ...block,
      entryEffects: nextEntryEffects,
      choices: block.choices.map((choice) => ({
        ...choice,
        effects: choice.effects.filter((effect) => effect.variableId !== removedVariableId),
      })),
    };
  }

  if (block.type === "gameplay") {
    return {
      ...block,
      entryEffects: nextEntryEffects,
      hotspots: block.hotspots.map((hotspot) => ({
        ...hotspot,
        effects: hotspot.effects.filter((effect) => effect.variableId !== removedVariableId),
      })),
      completionEffects: block.completionEffects.filter(
        (effect) => effect.variableId !== removedVariableId,
      ),
    };
  }

  return {
    ...block,
    entryEffects: nextEntryEffects,
  };
}

export function removeItemReferences(block: StoryBlock, removedItemId: string): StoryBlock {
  if (block.type !== "gameplay") {
    return block;
  }

  return {
    ...block,
    hotspots: block.hotspots.map((hotspot) => ({
      ...hotspot,
      onClickActions: hotspot.onClickActions.map((action) =>
        action.type === "add_item" && action.itemId === removedItemId
          ? { ...action, itemId: null }
          : action,
      ),
    })),
  };
}

export function applyEffects(
  currentVariables: Record<string, number>,
  effects: { variableId: string; delta: number }[],
) {
  const next = { ...currentVariables };
  for (const effect of effects) {
    next[effect.variableId] = (next[effect.variableId] ?? 0) + effect.delta;
  }
  return next;
}

function serializeEffects(
  effects: { variableId: string; delta: number }[],
  variableNameById: Map<string, string>,
) {
  return effects.map((effect) => ({
    variableId: effect.variableId,
    variableName: variableNameById.get(effect.variableId) ?? "unknown",
    delta: effect.delta,
  }));
}

export function assetPath(assetId: string | null, assetRefs: Record<string, AssetRef>) {
  if (!assetId) return null;
  return assetRefs[assetId]?.packagePath ?? null;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function serializeBlock(
  block: StoryBlock,
  variableNameById: Map<string, string>,
  assetRefs: Record<string, AssetRef>,
) {
  if (block.type === "title") {
    return {
      id: block.id,
      type: block.type,
      name: block.name,
      position: block.position,
      notes: block.notes,
      entryEffects: serializeEffects(block.entryEffects ?? [], variableNameById),
      storyTitle: block.storyTitle,
      subtitle: block.subtitle,
      backgroundPath: assetPath(block.backgroundAssetId, assetRefs),
      buttonStyle: block.buttonStyle,
      nextBlockId: block.nextBlockId,
    };
  }

  if (block.type === "cinematic") {
    return {
      id: block.id,
      type: block.type,
      name: block.name,
      position: block.position,
      notes: block.notes,
      entryEffects: serializeEffects(block.entryEffects ?? [], variableNameById),
      heading: block.heading,
      body: block.body,
      backgroundPath: assetPath(block.backgroundAssetId, assetRefs),
      videoPath: assetPath(block.videoAssetId, assetRefs),
      voicePath: assetPath(block.voiceAssetId, assetRefs),
      autoAdvanceSeconds: block.autoAdvanceSeconds,
      nextBlockId: block.nextBlockId,
    };
  }

  if (block.type === "dialogue") {
    return {
      id: block.id,
      type: block.type,
      name: block.name,
      position: block.position,
      notes: block.notes,
      entryEffects: serializeEffects(block.entryEffects ?? [], variableNameById),
      speaker: block.speaker,
      line: block.line,
      backgroundPath: assetPath(block.backgroundAssetId, assetRefs),
      characterPath: assetPath(block.characterAssetId, assetRefs),
      npcProfileBlockId: block.npcProfileBlockId,
      npcImageAssetId: block.npcImageAssetId,
      npcImagePath: assetPath(block.npcImageAssetId, assetRefs),
      voicePath: assetPath(block.voiceAssetId, assetRefs),
      choices: block.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        text: choice.text,
        targetBlockId: choice.targetBlockId,
        effects: serializeEffects(choice.effects, variableNameById),
      })),
    };
  }

  if (block.type === "hero_profile") {
    return {
      id: block.id,
      type: block.type,
      name: block.name,
      position: block.position,
      notes: block.notes,
      entryEffects: serializeEffects(block.entryEffects ?? [], variableNameById),
    };
  }

  if (block.type === "npc_profile") {
    return {
      id: block.id,
      type: block.type,
      name: block.name,
      position: block.position,
      notes: block.notes,
      entryEffects: serializeEffects(block.entryEffects ?? [], variableNameById),
      npcName: block.npcName,
      npcLore: block.npcLore,
      defaultImageAssetId: block.defaultImageAssetId,
      defaultImagePath: assetPath(block.defaultImageAssetId, assetRefs),
      images: block.imageAssetIds.map((assetId) => ({
        assetId,
        path: assetPath(assetId, assetRefs),
      })),
    };
  }

  return {
    id: block.id,
    type: block.type,
    name: block.name,
    position: block.position,
    notes: block.notes,
    entryEffects: serializeEffects(block.entryEffects ?? [], variableNameById),
    mode: "point_and_click",
    objective: block.objective,
    backgroundPath: assetPath(block.backgroundAssetId, assetRefs),
    voicePath: assetPath(block.voiceAssetId, assetRefs),
    overlays: block.overlays.map((overlay) => ({
      id: overlay.id,
      name: overlay.name,
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      height: overlay.height,
      zIndex: overlay.zIndex,
      visibleByDefault: overlay.visibleByDefault,
      imagePath: assetPath(overlay.assetId, assetRefs),
    })),
    hotspots: block.hotspots.map((hotspot) => ({
      id: hotspot.id,
      name: hotspot.name,
      x: hotspot.x,
      y: hotspot.y,
      width: hotspot.width,
      height: hotspot.height,
      required: hotspot.required,
      message: hotspot.message,
      toggleOverlayId: hotspot.toggleOverlayId,
      soundPath: assetPath(hotspot.soundAssetId, assetRefs),
      effects: serializeEffects(hotspot.effects, variableNameById),
      onClickActions: hotspot.onClickActions.map((action) => {
        if (action.type === "message") {
          return {
            id: action.id,
            type: action.type,
            message: action.message,
          };
        }

        if (action.type === "add_item") {
          return {
            id: action.id,
            type: action.type,
            itemId: action.itemId,
            quantity: action.quantity,
          };
        }

        if (action.type === "disable_hotspot") {
          return {
            id: action.id,
            type: action.type,
            targetHotspotId: action.targetHotspotId,
          };
        }

        return {
          id: action.id,
          type: action.type,
          targetBlockId: action.targetBlockId,
        };
      }),
    })),
    completionRule: block.completionRule,
    completionEffects: serializeEffects(block.completionEffects, variableNameById),
    nextBlockId: block.nextBlockId,
  };
}

export function isCloudPayload(value: unknown): value is CloudPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CloudPayload>;
  return (
    Boolean(candidate.project) &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    Boolean(candidate.assetRefs)
  );
}

export function serializeStudioSnapshot(
  project: ProjectMeta,
  nodes: EditorNode[],
  edges: EditorEdge[],
  assetRefs: Record<string, AssetRef>,
) {
  return JSON.stringify({
    project,
    nodes,
    edges,
    assetRefs,
  });
}

export function buildStudioChangeFingerprint(
  project: ProjectMeta,
  nodes: EditorNode[],
  edges: EditorEdge[],
  assetRefs: Record<string, AssetRef>,
) {
  const nodePart = nodes
    .map((node) => `${node.id}:${node.position.x}:${node.position.y}`)
    .join("|");

  const edgePart = edges
    .map((edge) => `${edge.source}:${edge.sourceHandle ?? "next"}:${edge.target}`)
    .join("|");

  const assetIds = Object.keys(assetRefs).sort((a, b) => a.localeCompare(b));
  const assetPart = assetIds
    .map((assetId) => {
      const ref = assetRefs[assetId];
      if (!ref) return assetId;
      return `${assetId}:${ref.packagePath}:${ref.storagePath ?? ""}:${ref.size}`;
    })
    .join("|");

  return [
    project.info.updatedAt,
    project.info.startBlockId ?? "",
    project.info.title,
    project.info.slug,
    String(nodes.length),
    String(edges.length),
    String(assetIds.length),
    nodePart,
    edgePart,
    assetPart,
  ].join("~");
}
