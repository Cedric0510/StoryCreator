"use client";

import {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  EdgeChange,
  MiniMap,
  NodeChange,
  NodeTypes,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";

import { AuthorStudioCloudPanel } from "@/components/AuthorStudioCloudPanel";
import { AuthorStudioBlockEditorPanel } from "@/components/AuthorStudioBlockEditorPanel";
import { AuthorStudioProjectPanel } from "@/components/AuthorStudioProjectPanel";
import { AuthorStudioStatusPanel } from "@/components/AuthorStudioStatusPanel";
import { HelpHint } from "@/components/HelpHint";
import { StoryNode, StoryNodeData } from "@/components/StoryNode";
import { useCloudProjectActions } from "@/components/useCloudProjectActions";
import { useCloudProjectState } from "@/components/useCloudProjectState";
import { useCloudProjectSession } from "@/components/useCloudProjectSession";
import { usePreviewRuntime } from "@/components/usePreviewRuntime";
import { useStudioAssets } from "@/components/useStudioAssets";
import {
  CloudPayload,
  EditorEdge,
  EditorNode,
  InitialStudio,
  blockFromNode,
  blockToNode,
  buildStudioChangeFingerprint,
  buildEdge,
  buildInitialStudio,
  choiceLabelFromHandle,
  clampPercent,
  defaultGameplayHotspotDraft,
  defaultGameplayHotspotActionDraft,
  defaultGameplayOverlayDraft,
  describeEffect,
  normalizeDelta,
  normalizeRectPercent,
  removeItemReferences,
  removeNodeReferences,
  removeVariableReferences,
} from "@/components/author-studio-core";
import {
  PlatformRole,
  GameplayPlacementTarget,
} from "@/components/author-studio-types";
import {
  BLOCK_LABELS,
  BlockType,
  CHOICE_LABELS,
  GameplayHotspotClickActionType,
  ProjectMeta,
  StoryBlock,
  ValidationIssue,
  blockTypeColor,
  createBlock,
  createId,
  normalizeHeroProfile,
  normalizeStoryBlock,
  validateStoryBlocks,
} from "@/lib/story";
import { allowSelfSignup } from "@/lib/runtimeFlags";

interface GameplayDragState {
  kind: "overlay" | "hotspot";
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

const nodeTypes: NodeTypes = { storyBlock: StoryNode };

function normalizeProjectItems(
  items: unknown,
): ProjectMeta["items"] {
  if (!Array.isArray(items)) return [];

  return items.map((entry, index) => {
    const candidate = entry as Partial<ProjectMeta["items"][number]>;
    const hasName = typeof candidate.name === "string" && candidate.name.trim().length > 0;
    return {
      id: typeof candidate.id === "string" && candidate.id ? candidate.id : createId("item"),
      name: hasName ? candidate.name!.trim() : `Objet ${index + 1}`,
      description: typeof candidate.description === "string" ? candidate.description : "",
      iconAssetId: typeof candidate.iconAssetId === "string" ? candidate.iconAssetId : null,
    };
  });
}

function normalizeProjectHero(
  hero: unknown,
  variables: ProjectMeta["variables"],
  items: ProjectMeta["items"],
): ProjectMeta["hero"] {
  const normalizedHero = normalizeHeroProfile(hero);
  const variableIds = new Set(variables.map((variable) => variable.id));
  const itemIds = new Set(items.map((item) => item.id));

  return {
    ...normalizedHero,
    baseStats: normalizedHero.baseStats.filter((stat) => variableIds.has(stat.variableId)),
    startingInventory: normalizedHero.startingInventory.filter((entry) =>
      itemIds.has(entry.itemId),
    ),
  };
}

export function AuthorStudioApp() {
  const [seed] = useState<InitialStudio>(() => buildInitialStudio());
  const [nodes, setNodes] = useState<EditorNode[]>(seed.nodes);
  const [edges, setEdges] = useState<EditorEdge[]>(seed.edges);
  const [project, setProject] = useState<ProjectMeta>(seed.project);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
    project.info.startBlockId,
  );
  const [lastValidation, setLastValidation] = useState<ValidationIssue[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [newVariableName, setNewVariableName] = useState("");
  const [ownPasswordInput, setOwnPasswordInput] = useState("");
  const [ownPasswordConfirmInput, setOwnPasswordConfirmInput] = useState("");
  const [adminCreateUserEmailInput, setAdminCreateUserEmailInput] = useState("");
  const [adminCreateUserPasswordInput, setAdminCreateUserPasswordInput] = useState("");
  const [adminCreateUserRole, setAdminCreateUserRole] = useState<PlatformRole>("reader");
  const {
    supabase,
    supabaseProjectRef,
    authLoading,
    authUser,
    authEmailInput,
    authPasswordInput,
    cloudBusy,
    cloudProjectId,
    cloudOwnerId,
    cloudEditingLockUserId,
    cloudProjectUpdatedAt,
    cloudLatestUpdatedAt,
    cloudAccessLevel,
    cloudAccessRows,
    cloudProfiles,
    cloudLogs,
    cloudProjects,
    platformRole,
    platformProfiles,
    shareEmailInput,
    shareAccessLevel,
    setAuthEmailInput,
    setAuthPasswordInput,
    setCloudBusy,
    setCloudProjectId,
    setCloudOwnerId,
    setCloudEditingLockUserId,
    setCloudProjectUpdatedAt,
    setCloudLatestUpdatedAt,
    setCloudAccessLevel,
    setCloudAccessRows,
    setCloudProfiles,
    setCloudLogs,
    setCloudProjects,
    setPlatformRole,
    setPlatformProfiles,
    setShareEmailInput,
    setShareAccessLevel,
  } = useCloudProjectState(setStatusMessage);
  const [newProjectWarningOpen, setNewProjectWarningOpen] = useState(false);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(() =>
    buildStudioChangeFingerprint(seed.project, seed.nodes, seed.edges, {}),
  );
  const [gameplayPlacementTarget, setGameplayPlacementTarget] =
    useState<GameplayPlacementTarget | null>(null);
  const [gameplayDragState, setGameplayDragState] = useState<GameplayDragState | null>(null);

  const blocks = useMemo(() => nodes.map((node) => blockFromNode(node)), [nodes]);
  const blockById = useMemo(
    () => new Map(blocks.map((block) => [block.id, block])),
    [blocks],
  );
  const {
    previewOpen,
    setPreviewOpen,
    previewState,
    previewBlock,
    previewFoundHotspotSet,
    previewDisabledHotspotSet,
    previewGameplayCompleted,
    previewGameplayProgressLabel,
    startPreview,
    continuePreview,
    pickPreviewChoice,
    pickPreviewHotspot,
    resetPreview,
  } = usePreviewRuntime({
    project,
    blockById,
    setStatusMessage,
  });
  const variableNameById = useMemo(
    () => new Map(project.variables.map((variable) => [variable.id, variable.name])),
    [project.variables],
  );
  const previewInventoryItems = useMemo(() => {
    if (!previewState) return [];
    return project.items.filter((item) => (previewState.inventory[item.id] ?? 0) > 0);
  }, [previewState, project.items]);

  const activeMember = useMemo(
    () => project.members.find((member) => member.id === project.activeMemberId) ?? null,
    [project.activeMemberId, project.members],
  );
  const lockHolder = useMemo(
    () =>
      project.members.find((member) => member.id === project.editingLockMemberId) ?? null,
    [project.editingLockMemberId, project.members],
  );
  const accountMustChangePassword = Boolean(
    (authUser?.user_metadata as Record<string, unknown> | undefined)?.must_change_password,
  );

  const isPlatformAdmin = platformRole === "admin";
  const canUseAuthorTools = isPlatformAdmin || platformRole === "author";
  const localCanEdit = true;
  const cloudCanWrite =
    canUseAuthorTools &&
    (isPlatformAdmin ||
      !cloudProjectId ||
      cloudAccessLevel === "owner" ||
      cloudAccessLevel === "write");
  const cloudCanManageAccess = Boolean(
    canUseAuthorTools && cloudProjectId && (isPlatformAdmin || cloudAccessLevel === "owner"),
  );
  const cloudLockHeldByOther =
    Boolean(cloudProjectId) &&
    Boolean(cloudEditingLockUserId) &&
    cloudEditingLockUserId !== authUser?.id;
  const cloudLockHolderName =
    cloudEditingLockUserId
      ? cloudProfiles[cloudEditingLockUserId]?.display_name ?? cloudEditingLockUserId
      : "libre";
  const cloudRevisionDrift =
    Boolean(cloudProjectId) &&
    Boolean(cloudProjectUpdatedAt) &&
    Boolean(cloudLatestUpdatedAt) &&
    cloudProjectUpdatedAt !== cloudLatestUpdatedAt;
  const canEdit = canUseAuthorTools && localCanEdit && cloudCanWrite && !cloudLockHeldByOther;
  const {
    refreshCloudSideData,
    appendCloudLog,
    acquireCloudLock,
    releaseCloudLock,
    refreshCloudProjects,
    refreshPlatformProfiles,
    setPlatformProfileRole,
    signInWithPassword,
    signUpWithPassword,
    signOutSupabase,
  } = useCloudProjectSession({
    supabase,
    allowSelfSignup,
    authUser,
    authEmailInput,
    authPasswordInput,
    platformRole,
    cloudProjectId,
    cloudOwnerId,
    cloudCanWrite,
    cloudEditingLockUserId,
    cloudProjects,
    setStatusMessage,
    setCloudBusy,
    setCloudAccessLevel,
    setCloudProjectId,
    setCloudOwnerId,
    setCloudEditingLockUserId,
    setCloudProjectUpdatedAt,
    setCloudLatestUpdatedAt,
    setCloudAccessRows,
    setCloudLogs,
    setCloudProjects,
    setCloudProfiles,
    setPlatformRole,
    setPlatformProfiles,
    setShareEmailInput,
  });
  const editBlockReason = !authUser
    ? "Acces restreint: connecte-toi pour utiliser la plateforme."
    : !canUseAuthorTools
      ? "Compte lecteur: un admin doit te passer en auteur pour activer les outils de creation."
      : !localCanEdit
        ? `Edition verrouillee. Seul ${lockHolder?.name ?? "un editeur"} peut modifier le graphe.`
        : cloudLockHeldByOther
          ? `Verrou cloud actif par ${cloudLockHolderName}.`
          : cloudProjectId && !cloudCanWrite
            ? "Droit cloud insuffisant: il faut un acces write ou owner pour modifier ce projet."
            : null;

  const liveIssues = useMemo(
    () => validateStoryBlocks(blocks, project.info.startBlockId, project.items),
    [blocks, project.info.startBlockId, project.items],
  );

  const issuesByBlock = useMemo(() => {
    const map = new Map<string, { hasError: boolean; hasWarning: boolean }>();
    for (const issue of liveIssues) {
      if (!issue.blockId) continue;
      const current = map.get(issue.blockId) ?? { hasError: false, hasWarning: false };
      if (issue.level === "error") current.hasError = true;
      if (issue.level === "warning") current.hasWarning = true;
      map.set(issue.blockId, current);
    }
    return map;
  }, [liveIssues]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const flags = issuesByBlock.get(node.id) ?? {
          hasError: false,
          hasWarning: false,
        };
        return {
          ...node,
          data: {
            ...node.data,
            isStart: project.info.startBlockId === node.id,
            hasError: flags.hasError,
            hasWarning: flags.hasWarning,
          },
        };
      }),
    [issuesByBlock, nodes, project.info.startBlockId],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedBlockId) ?? null,
    [nodes, selectedBlockId],
  );
  const selectedBlock = selectedNode?.data.block ?? null;

  const visibleIssues = lastValidation.length > 0 ? lastValidation : liveIssues;
  const totalErrors = visibleIssues.filter((issue) => issue.level === "error").length;

  const logAction = useCallback((action: string, details: string) => {
    setProject((current) => {
      const entry = {
        id: createId("log"),
        memberId: current.activeMemberId,
        timestamp: new Date().toISOString(),
        action,
        details,
      };
      return {
        ...current,
        info: {
          ...current.info,
          updatedAt: entry.timestamp,
        },
        logs: [entry, ...current.logs].slice(0, 250),
      };
    });
  }, []);

  const {
    assetRefs,
    assetFiles,
    assetPreviewSrcById,
    setAssetRefs,
    ensureAssetPreviewSrc,
    registerAsset,
    createAssetInputHandler,
    getAssetFileName,
    clearAllAssetState,
    hydrateAssetRefs,
    exportZip,
    cleanupLocalOrphanAssetRefs,
  } = useStudioAssets({
    blocks,
    project,
    edges,
    variableNameById,
    canEdit,
    supabase,
    authUser,
    setLastValidation,
    setStatusMessage,
    logAction,
  });
  const currentFingerprint = useMemo(
    () => buildStudioChangeFingerprint(project, nodes, edges, assetRefs),
    [assetRefs, edges, nodes, project],
  );
  const hasUnsavedChanges = currentFingerprint !== lastSavedFingerprint;
  const markStudioClean = useCallback(
    (fingerprint?: string) => {
      setLastSavedFingerprint(fingerprint ?? currentFingerprint);
    },
    [currentFingerprint],
  );

  const hydrateStudioFromPayload = useCallback((payload: CloudPayload) => {
    const normalizedNodes = payload.nodes.map((node) => {
      const block = node.data.block as StoryBlock;
      const normalizedBlock = normalizeStoryBlock(block);
      return {
        ...node,
        data: {
          ...node.data,
          block: normalizedBlock,
        },
      } as EditorNode;
    });

    const normalizedProject: ProjectMeta = {
      ...payload.project,
      items: normalizeProjectItems((payload.project as ProjectMeta & { items?: unknown }).items),
    };
    normalizedProject.hero = normalizeProjectHero(
      (payload.project as ProjectMeta & { hero?: unknown }).hero,
      normalizedProject.variables,
      normalizedProject.items,
    );

    setProject(normalizedProject);
    setNodes(normalizedNodes);
    setEdges(payload.edges);
    hydrateAssetRefs(payload.assetRefs ?? {});
    setGameplayPlacementTarget(null);
    setGameplayDragState(null);
    setCloudEditingLockUserId(null);
    setCloudProjectUpdatedAt(null);
    setCloudLatestUpdatedAt(null);
    setCloudProfiles({});
    setSelectedBlockId(normalizedProject.info.startBlockId ?? null);
    setLastValidation([]);
    markStudioClean(
      buildStudioChangeFingerprint(
        normalizedProject,
        payload.nodes,
        payload.edges,
        payload.assetRefs ?? {},
      ),
    );
  }, [
    hydrateAssetRefs,
    markStudioClean,
    setCloudEditingLockUserId,
    setCloudLatestUpdatedAt,
    setCloudProfiles,
    setCloudProjectUpdatedAt,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedBlock) {
        setGameplayPlacementTarget(null);
        setGameplayDragState(null);
        return;
      }

      if (selectedBlock.type !== "gameplay") {
        setGameplayPlacementTarget(null);
        setGameplayDragState(null);

        if (selectedBlock.type === "npc_profile") {
          for (const assetId of selectedBlock.imageAssetIds) {
            void ensureAssetPreviewSrc(assetId);
          }
        }
        return;
      }

      if (gameplayDragState) {
        const exists =
          gameplayDragState.kind === "overlay"
            ? selectedBlock.overlays.some((overlay) => overlay.id === gameplayDragState.id)
            : selectedBlock.hotspots.some((hotspot) => hotspot.id === gameplayDragState.id);
        if (!exists) {
          setGameplayDragState(null);
        }
      }

      const wantedAssetIds = new Set<string>();
      if (selectedBlock.backgroundAssetId) wantedAssetIds.add(selectedBlock.backgroundAssetId);
      for (const overlay of selectedBlock.overlays) {
        if (overlay.assetId) wantedAssetIds.add(overlay.assetId);
      }

      for (const assetId of wantedAssetIds) {
        void ensureAssetPreviewSrc(assetId);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ensureAssetPreviewSrc, gameplayDragState, selectedBlock]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!previewOpen || !previewState?.currentBlockId) return;

      const block = blockById.get(previewState.currentBlockId);
      if (!block) return;

      const wantedAssetIds = new Set<string>();
      if (block.type === "title") {
        if (block.backgroundAssetId) wantedAssetIds.add(block.backgroundAssetId);
      } else if (block.type === "cinematic") {
        if (block.backgroundAssetId) wantedAssetIds.add(block.backgroundAssetId);
      } else if (block.type === "dialogue") {
        if (block.backgroundAssetId) wantedAssetIds.add(block.backgroundAssetId);
        if (block.characterAssetId) wantedAssetIds.add(block.characterAssetId);
        if (block.npcImageAssetId) wantedAssetIds.add(block.npcImageAssetId);
        if (block.npcProfileBlockId) {
          const npcBlock = blockById.get(block.npcProfileBlockId);
          if (npcBlock && npcBlock.type === "npc_profile") {
            if (npcBlock.defaultImageAssetId) wantedAssetIds.add(npcBlock.defaultImageAssetId);
            for (const imageAssetId of npcBlock.imageAssetIds) {
              wantedAssetIds.add(imageAssetId);
            }
          }
        }
      } else if (block.type === "npc_profile") {
        for (const imageAssetId of block.imageAssetIds) {
          wantedAssetIds.add(imageAssetId);
        }
      } else if (block.type === "gameplay") {
        if (block.backgroundAssetId) wantedAssetIds.add(block.backgroundAssetId);
        for (const overlay of block.overlays) {
          if (overlay.assetId) wantedAssetIds.add(overlay.assetId);
        }
      }

      for (const assetId of wantedAssetIds) {
        void ensureAssetPreviewSrc(assetId);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [blockById, ensureAssetPreviewSrc, previewOpen, previewState?.currentBlockId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const item of project.items) {
        if (item.iconAssetId) {
          void ensureAssetPreviewSrc(item.iconAssetId);
        }
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ensureAssetPreviewSrc, project.items]);

  const touchProject = useCallback(() => {
    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<EditorNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<EditorEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const updateBlock = useCallback(
    (blockId: string, updater: (block: StoryBlock) => StoryBlock) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === blockId
            ? {
                ...node,
                data: {
                  ...node.data,
                  block: updater(node.data.block),
                },
              }
            : node,
        ),
      );
      touchProject();
    },
    [touchProject],
  );

  const setConnection = useCallback(
    (sourceId: string, sourceHandle: string, targetId: string | null) => {
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== sourceId) return node;

          if (node.data.block.type === "dialogue") {
            const label = choiceLabelFromHandle(sourceHandle);
            if (!label) return node;

            return {
              ...node,
              data: {
                ...node.data,
                block: {
                  ...node.data.block,
                  choices: node.data.block.choices.map((choice) =>
                    choice.label === label
                      ? { ...choice, targetBlockId: targetId }
                      : choice,
                  ),
                },
              },
            };
          }

          if (
            node.data.block.type === "hero_profile" ||
            node.data.block.type === "npc_profile"
          ) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              block: {
                ...node.data.block,
                nextBlockId: targetId,
              } as StoryBlock,
            },
          };
        }),
      );

      setEdges((current) => {
        const withoutCurrent = current.filter(
          (edge) =>
            !(
              edge.source === sourceId &&
              (edge.sourceHandle ?? "next") === sourceHandle
            ),
        );

        if (!targetId) return withoutCurrent;
        return [...withoutCurrent, buildEdge(sourceId, targetId, sourceHandle)];
      });

      touchProject();
    },
    [touchProject],
  );

  const linkNpcProfileToDialogue = useCallback(
    (npcBlockId: string, dialogueBlockId: string) => {
      setNodes((current) => {
        const npcBlock = current.find((node) => node.id === npcBlockId)?.data.block;
        if (!npcBlock || npcBlock.type !== "npc_profile") return current;

        return current.map((node) => {
          if (node.id !== dialogueBlockId || node.data.block.type !== "dialogue") return node;
          const selectedNpcImage =
            node.data.block.npcImageAssetId &&
            npcBlock.imageAssetIds.includes(node.data.block.npcImageAssetId)
              ? node.data.block.npcImageAssetId
              : npcBlock.defaultImageAssetId ?? npcBlock.imageAssetIds[0] ?? null;

          return {
            ...node,
            data: {
              ...node.data,
              block: {
                ...node.data.block,
                speaker: npcBlock.npcName.trim() || node.data.block.speaker,
                npcProfileBlockId: npcBlockId,
                npcImageAssetId: selectedNpcImage,
              },
            },
          };
        });
      });

      setEdges((current) => {
        const withoutTargetNpcEdge = current.filter(
          (edge) => !((edge.sourceHandle ?? "") === "npc-link" && edge.target === dialogueBlockId),
        );
        const alreadyLinked = withoutTargetNpcEdge.some(
          (edge) =>
            edge.source === npcBlockId &&
            edge.target === dialogueBlockId &&
            (edge.sourceHandle ?? "") === "npc-link",
        );
        if (alreadyLinked) return withoutTargetNpcEdge;
        return [...withoutTargetNpcEdge, buildEdge(npcBlockId, dialogueBlockId, "npc-link")];
      });

      touchProject();
    },
    [touchProject],
  );

  const unlinkNpcProfileFromDialogue = useCallback(
    (dialogueBlockId: string) => {
      updateBlock(dialogueBlockId, (block) => {
        if (block.type !== "dialogue") return block;
        return {
          ...block,
          npcProfileBlockId: null,
          npcImageAssetId: null,
        };
      });
      setEdges((current) =>
        current.filter(
          (edge) => !((edge.sourceHandle ?? "") === "npc-link" && edge.target === dialogueBlockId),
        ),
      );
      touchProject();
    },
    [touchProject, updateBlock],
  );

  const addBlock = useCallback(
    (type: BlockType) => {
      if (!canEdit) return;

      const position = {
        x: 120 + (nodes.length % 5) * 90,
        y: 120 + Math.floor(nodes.length / 3) * 70,
      };
      const block = createBlock(type, position);

      setNodes((current) => [...current, blockToNode(block)]);
      setSelectedBlockId(block.id);

      if (!project.info.startBlockId) {
        setProject((current) => ({
          ...current,
          info: {
            ...current.info,
            startBlockId: block.id,
            updatedAt: new Date().toISOString(),
          },
        }));
      }

      logAction("add_block", `${BLOCK_LABELS[type]} (${block.id})`);
      setStatusMessage(`${BLOCK_LABELS[type]} ajoute.`);
    },
    [canEdit, logAction, nodes.length, project.info.startBlockId],
  );

  const deleteSelectedBlock = useCallback(() => {
    if (!canEdit || !selectedBlockId) return;

    const deleted = blockById.get(selectedBlockId);
    if (!deleted) return;

    setNodes((current) =>
      current
        .filter((node) => node.id !== selectedBlockId)
        .map((node) => ({
          ...node,
          data: {
            ...node.data,
            block: removeNodeReferences(node.data.block, selectedBlockId),
          },
        })),
    );
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== selectedBlockId && edge.target !== selectedBlockId,
      ),
    );

    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        startBlockId:
          current.info.startBlockId === selectedBlockId
            ? null
            : current.info.startBlockId,
        updatedAt: new Date().toISOString(),
      },
    }));

    setSelectedBlockId(null);
    logAction("delete_block", `${deleted.name} (${deleted.id})`);
    setStatusMessage(`Bloc ${deleted.name} supprime.`);
  }, [blockById, canEdit, logAction, selectedBlockId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      if (!connection.source || !connection.target) return;

      const sourceNode = blockById.get(connection.source);
      if (!sourceNode) return;
      const targetNode = blockById.get(connection.target);
      if (!targetNode) return;

      if (sourceNode.type === "npc_profile") {
        if (targetNode.type !== "dialogue") {
          setStatusMessage("Le bloc PNJ peut uniquement se lier a un bloc Dialogue.");
          return;
        }
        linkNpcProfileToDialogue(sourceNode.id, targetNode.id);
        logAction("link_npc_dialogue", `${sourceNode.name} -> ${targetNode.name}`);
        return;
      }

      if (sourceNode.type === "hero_profile") {
        setStatusMessage("Le bloc Fiche Hero est visuel uniquement pour le moment.");
        return;
      }

      if (sourceNode.type === "dialogue") {
        const label = choiceLabelFromHandle(connection.sourceHandle);
        if (!label) return;
        const handle = `choice-${label}`;
        setConnection(connection.source, handle, connection.target);
        logAction("link", `${sourceNode.name} choix ${label} -> ${connection.target}`);
        return;
      }

      setConnection(connection.source, "next", connection.target);
      logAction("link", `${sourceNode.name} -> ${connection.target}`);
    },
    [blockById, canEdit, linkNpcProfileToDialogue, logAction, setConnection, setStatusMessage],
  );

  const updateSelectedBlock = useCallback((updater: (block: StoryBlock) => StoryBlock) => {
    if (!canEdit || !selectedBlockId) return;
    updateBlock(selectedBlockId, updater);
  }, [canEdit, selectedBlockId, updateBlock]);

  const setSelectedDynamicField = useCallback((key: string, value: unknown) => {
    updateSelectedBlock((block) => ({ ...block, [key]: value } as StoryBlock));
  }, [updateSelectedBlock]);

  const onAssetInput = useCallback(
    (fieldName: string) =>
      createAssetInputHandler(fieldName, (targetField, assetId) => {
        setSelectedDynamicField(targetField, assetId);
      }),
    [createAssetInputHandler, setSelectedDynamicField],
  );

  const clearAsset = useCallback((fieldName: string) => {
    if (!canEdit) return;
    setSelectedDynamicField(fieldName, null);
  }, [canEdit, setSelectedDynamicField]);

  const renderAssetAttachment = useCallback(
    (fieldName: string, assetId: string | null) => (
      <div className="asset-line">
        <small>{getAssetFileName(assetId)}</small>
        <button
          className="button-secondary"
          onClick={() => clearAsset(fieldName)}
          disabled={!canEdit || !assetId}
        >
          Retirer
        </button>
      </div>
    ),
    [canEdit, clearAsset, getAssetFileName],
  );

  const renderAssetAttachmentWithRemove = useCallback(
    (assetId: string | null, onRemove: () => void) => (
      <div className="asset-line">
        <small>{getAssetFileName(assetId)}</small>
        <button
          className="button-secondary"
          onClick={onRemove}
          disabled={!canEdit || !assetId}
        >
          Retirer
        </button>
      </div>
    ),
    [canEdit, getAssetFileName],
  );

  const setStartBlock = (blockId: string) => {
    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        startBlockId: blockId,
        updatedAt: new Date().toISOString(),
      },
    }));
    logAction("set_start_block", blockId);
  };

  const addDialogueChoice = () => {
    if (!canEdit || !selectedBlock || selectedBlock.type !== "dialogue") return;
    if (selectedBlock.choices.length >= 4) return;

    const label = CHOICE_LABELS[selectedBlock.choices.length];
    updateSelectedBlock((block) => {
      if (block.type !== "dialogue") return block;
      return {
        ...block,
        choices: [
          ...block.choices,
          {
            id: createId("choice"),
            label,
            text: "",
            targetBlockId: null,
            effects: [],
          },
        ],
      };
    });
    logAction("add_choice", `${selectedBlock.id} choix ${label}`);
  };

  const removeDialogueChoice = () => {
    if (!canEdit || !selectedBlock || selectedBlock.type !== "dialogue") return;
    if (selectedBlock.choices.length <= 1) return;

    const removed = selectedBlock.choices[selectedBlock.choices.length - 1];
    setConnection(selectedBlock.id, `choice-${removed.label}`, null);
    updateSelectedBlock((block) => {
      if (block.type !== "dialogue") return block;
      return {
        ...block,
        choices: block.choices.slice(0, -1),
      };
    });
    logAction("remove_choice", `${selectedBlock.id} choix ${removed.label}`);
  };

  const addVariable = () => {
    if (!canEdit) return;
    const cleanName = newVariableName.trim();
    if (!cleanName) return;

    const exists = project.variables.some(
      (variable) => variable.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (exists) {
      setStatusMessage("Cette variable existe deja.");
      return;
    }

    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
      variables: [
        ...current.variables,
        { id: createId("var"), name: cleanName, initialValue: 0 },
      ],
    }));
    setNewVariableName("");
    logAction("add_variable", cleanName);
  };

  const deleteVariable = (variableId: string) => {
    if (!canEdit) return;

    const deleted = project.variables.find((variable) => variable.id === variableId);
    if (!deleted) return;

    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
      variables: current.variables.filter((variable) => variable.id !== variableId),
      hero: {
        ...current.hero,
        baseStats: current.hero.baseStats.filter((stat) => stat.variableId !== variableId),
      },
    }));

    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          block: removeVariableReferences(node.data.block, variableId),
        },
      })),
    );
    setStatusMessage(`Variable ${deleted.name} supprimee.`);
    logAction("delete_variable", deleted.name);
  };

  const createItem = useCallback((name: string, iconFile: File | null) => {
    if (!canEdit) return false;
    const cleanName = name.trim();
    if (!cleanName) {
      setStatusMessage("Saisis un nom pour creer un objet.");
      return false;
    }
    if (!iconFile) {
      setStatusMessage("Ajoute une image pour cet objet.");
      return false;
    }

    const nameAlreadyUsed = project.items.some(
      (item) => item.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (nameAlreadyUsed) {
      setStatusMessage("Un objet avec ce nom existe deja.");
      return false;
    }

    const iconAssetId = registerAsset(iconFile);
    void ensureAssetPreviewSrc(iconAssetId);

    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
      items: [
        ...current.items,
        {
          id: createId("item"),
          name: cleanName,
          description: "",
          iconAssetId,
        },
      ],
    }));

    logAction("add_item", cleanName);
    setStatusMessage(`Objet ${cleanName} ajoute.`);
    return true;
  }, [canEdit, ensureAssetPreviewSrc, logAction, project.items, registerAsset, setStatusMessage]);

  const renameItem = useCallback((itemId: string, name: string) => {
    if (!canEdit) return;
    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
      items: current.items.map((item) =>
        item.id === itemId
          ? { ...item, name }
          : item,
      ),
    }));
  }, [canEdit]);

  const deleteItem = useCallback((itemId: string) => {
    if (!canEdit) return;

    const item = project.items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
      items: current.items.filter((candidate) => candidate.id !== itemId),
      hero: {
        ...current.hero,
        startingInventory: current.hero.startingInventory.filter((entry) => entry.itemId !== itemId),
      },
    }));
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          block: removeItemReferences(node.data.block, itemId),
        },
      })),
    );
    logAction("delete_item", item.name);
    setStatusMessage(`Objet ${item.name} supprime. Les recompenses liees ont ete nettoyees.`);
  }, [canEdit, logAction, project.items, setStatusMessage]);

  const replaceItemIcon = useCallback((itemId: string, file: File) => {
    if (!canEdit) return;
    const assetId = registerAsset(file);
    void ensureAssetPreviewSrc(assetId);

    setProject((current) => ({
      ...current,
      info: {
        ...current.info,
        updatedAt: new Date().toISOString(),
      },
      items: current.items.map((item) =>
        item.id === itemId
          ? { ...item, iconAssetId: assetId }
          : item,
      ),
    }));
    logAction("replace_item_icon", file.name);
    setStatusMessage(`Image objet mise a jour: ${file.name}.`);
  }, [canEdit, ensureAssetPreviewSrc, logAction, registerAsset, setStatusMessage]);

  const updateChoiceField = (
    choiceId: string,
    field: "text" | "targetBlockId",
    value: string,
  ) => {
    if (!selectedBlock || selectedBlock.type !== "dialogue") return;

    if (field === "targetBlockId") {
      const choice = selectedBlock.choices.find((item) => item.id === choiceId);
      if (!choice) return;
      setConnection(
        selectedBlock.id,
        `choice-${choice.label}`,
        value ? value : null,
      );
      return;
    }

    updateSelectedBlock((block) => {
      if (block.type !== "dialogue") return block;
      return {
        ...block,
        choices: block.choices.map((choice) =>
          choice.id === choiceId ? { ...choice, [field]: value } : choice,
        ),
      };
    });
  };

  const addBlockEntryEffect = () => {
    if (!selectedBlock) return;
    const fallbackVariableId = project.variables[0]?.id;
    if (!fallbackVariableId) {
      setStatusMessage("Ajoute d'abord une variable globale.");
      return;
    }

    updateSelectedBlock((block) => ({
      ...block,
      entryEffects: [...(block.entryEffects ?? []), { variableId: fallbackVariableId, delta: 1 }],
    }));
  };

  const updateBlockEntryEffect = (
    effectIndex: number,
    key: "variableId" | "delta",
    value: string,
  ) => {
    updateSelectedBlock((block) => ({
      ...block,
      entryEffects: (block.entryEffects ?? []).map((effect, index) =>
        index === effectIndex
          ? {
              ...effect,
              [key]: key === "delta" ? normalizeDelta(value) : value,
            }
          : effect,
      ),
    }));
  };

  const removeBlockEntryEffect = (effectIndex: number) => {
    updateSelectedBlock((block) => ({
      ...block,
      entryEffects: (block.entryEffects ?? []).filter((_, index) => index !== effectIndex),
    }));
  };

  const addChoiceEffect = (choiceId: string) => {
    if (!selectedBlock || selectedBlock.type !== "dialogue") return;
    const fallbackVariableId = project.variables[0]?.id;
    if (!fallbackVariableId) {
      setStatusMessage("Ajoute d'abord une variable globale.");
      return;
    }

    updateSelectedBlock((block) => {
      if (block.type !== "dialogue") return block;
      return {
        ...block,
        choices: block.choices.map((choice) =>
          choice.id === choiceId
            ? {
                ...choice,
                effects: [
                  ...choice.effects,
                  {
                    variableId: fallbackVariableId,
                    delta: 1,
                  },
                ],
              }
            : choice,
        ),
      };
    });
  };

  const updateChoiceEffect = (
    choiceId: string,
    effectIndex: number,
    key: "variableId" | "delta",
    value: string,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "dialogue") return block;
      return {
        ...block,
        choices: block.choices.map((choice) => {
          if (choice.id !== choiceId) return choice;
          return {
            ...choice,
            effects: choice.effects.map((effect, index) =>
              index === effectIndex
                ? {
                    ...effect,
                    [key]: key === "delta" ? normalizeDelta(value) : value,
                  }
                : effect,
            ),
          };
        }),
      };
    });
  };

  const removeChoiceEffect = (choiceId: string, effectIndex: number) => {
    updateSelectedBlock((block) => {
      if (block.type !== "dialogue") return block;
      return {
        ...block,
        choices: block.choices.map((choice) =>
          choice.id === choiceId
            ? {
                ...choice,
                effects: choice.effects.filter((_, index) => index !== effectIndex),
              }
            : choice,
        ),
      };
    });
  };

  const addGameplayEffect = () => {
    if (!selectedBlock || selectedBlock.type !== "gameplay") return;
    const fallbackVariableId = project.variables[0]?.id;
    if (!fallbackVariableId) {
      setStatusMessage("Ajoute d'abord une variable globale.");
      return;
    }

    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        completionEffects: [
          ...block.completionEffects,
          { variableId: fallbackVariableId, delta: 1 },
        ],
      };
    });
  };

  const updateGameplayEffect = (
    effectIndex: number,
    key: "variableId" | "delta",
    value: string,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        completionEffects: block.completionEffects.map((effect, index) =>
          index === effectIndex
            ? {
                ...effect,
                [key]: key === "delta" ? normalizeDelta(value) : value,
              }
            : effect,
        ),
      };
    });
  };

  const removeGameplayEffect = (effectIndex: number) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        completionEffects: block.completionEffects.filter(
          (_, index) => index !== effectIndex,
        ),
      };
    });
  };

  const updateGameplayOverlayRect = (
    overlayId: string,
    key: "x" | "y" | "width" | "height",
    value: number,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        overlays: block.overlays.map((overlay) => {
          if (overlay.id !== overlayId) return overlay;
          const next = normalizeRectPercent({
            x: key === "x" ? value : overlay.x,
            y: key === "y" ? value : overlay.y,
            width: key === "width" ? value : overlay.width,
            height: key === "height" ? value : overlay.height,
          });
          return {
            ...overlay,
            ...next,
          };
        }),
      };
    });
  };

  const updateGameplayHotspotRect = (
    hotspotId: string,
    key: "x" | "y" | "width" | "height",
    value: number,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) => {
          if (hotspot.id !== hotspotId) return hotspot;
          const next = normalizeRectPercent({
            x: key === "x" ? value : hotspot.x,
            y: key === "y" ? value : hotspot.y,
            width: key === "width" ? value : hotspot.width,
            height: key === "height" ? value : hotspot.height,
          });
          return {
            ...hotspot,
            ...next,
          };
        }),
      };
    });
  };

  const addGameplayOverlay = () => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        overlays: [...block.overlays, defaultGameplayOverlayDraft()],
      };
    });
  };

  const removeGameplayOverlay = (overlayId: string) => {
    setGameplayPlacementTarget((current) =>
      current?.kind === "overlay" && current.id === overlayId ? null : current,
    );
    setGameplayDragState((current) =>
      current?.kind === "overlay" && current.id === overlayId ? null : current,
    );
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        overlays: block.overlays.filter((overlay) => overlay.id !== overlayId),
        hotspots: block.hotspots.map((hotspot) =>
          hotspot.toggleOverlayId === overlayId
            ? { ...hotspot, toggleOverlayId: null }
            : hotspot,
        ),
      };
    });
  };

  const clearGameplayOverlayAsset = (overlayId: string) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        overlays: block.overlays.map((overlay) =>
          overlay.id === overlayId
            ? { ...overlay, assetId: null }
            : overlay,
        ),
      };
    });
  };

  const addGameplayHotspot = () => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: [...block.hotspots, defaultGameplayHotspotDraft()],
      };
    });
  };

  const removeGameplayHotspot = (hotspotId: string) => {
    setGameplayPlacementTarget((current) =>
      current?.kind === "hotspot" && current.id === hotspotId ? null : current,
    );
    setGameplayDragState((current) =>
      current?.kind === "hotspot" && current.id === hotspotId ? null : current,
    );
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.filter((hotspot) => hotspot.id !== hotspotId),
      };
    });
  };

  const clearGameplayHotspotSound = (hotspotId: string) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) =>
          hotspot.id === hotspotId
            ? { ...hotspot, soundAssetId: null }
            : hotspot,
        ),
      };
    });
  };

  const updateGameplayHotspotEffect = (
    hotspotId: string,
    effectIndex: number,
    key: "variableId" | "delta",
    value: string,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) => {
          if (hotspot.id !== hotspotId) return hotspot;
          return {
            ...hotspot,
            effects: hotspot.effects.map((effect, index) =>
              index === effectIndex
                ? {
                    ...effect,
                    [key]: key === "delta" ? normalizeDelta(value) : value,
                  }
                : effect,
            ),
          };
        }),
      };
    });
  };

  const addGameplayHotspotEffect = (hotspotId: string) => {
    const fallbackVariableId = project.variables[0]?.id;
    if (!fallbackVariableId) {
      setStatusMessage("Ajoute d'abord une variable globale.");
      return;
    }

    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) =>
          hotspot.id === hotspotId
            ? {
                ...hotspot,
                effects: [...hotspot.effects, { variableId: fallbackVariableId, delta: 1 }],
              }
            : hotspot,
        ),
      };
    });
  };

  const removeGameplayHotspotEffect = (hotspotId: string, effectIndex: number) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) =>
          hotspot.id === hotspotId
            ? {
                ...hotspot,
                effects: hotspot.effects.filter((_, index) => index !== effectIndex),
              }
            : hotspot,
        ),
      };
    });
  };

  const addGameplayHotspotAction = (
    hotspotId: string,
    type: GameplayHotspotClickActionType = "message",
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) => {
          if (hotspot.id !== hotspotId) return hotspot;
          const draft = defaultGameplayHotspotActionDraft(type);
          if (draft.type === "add_item" && project.items.length > 0) {
            draft.itemId = project.items[0].id;
          }
          if (draft.type === "disable_hotspot") {
            draft.targetHotspotId = hotspot.id;
          }
          return {
            ...hotspot,
            onClickActions: [...hotspot.onClickActions, draft],
          };
        }),
      };
    });
  };

  const updateGameplayHotspotAction = (
    hotspotId: string,
    actionId: string,
    field:
      | "type"
      | "message"
      | "itemId"
      | "quantity"
      | "targetHotspotId"
      | "targetBlockId",
    value: string,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) => {
          if (hotspot.id !== hotspotId) return hotspot;
          return {
            ...hotspot,
            onClickActions: hotspot.onClickActions.map((action) => {
              if (action.id !== actionId) return action;

              if (field === "type") {
                const actionType = value as GameplayHotspotClickActionType;
                const draft = defaultGameplayHotspotActionDraft(actionType);
                if (draft.type === "add_item" && project.items.length > 0) {
                  draft.itemId = project.items[0].id;
                }
                if (draft.type === "disable_hotspot") {
                  draft.targetHotspotId = hotspot.id;
                }
                return {
                  ...draft,
                  id: action.id,
                };
              }

              if (field === "message" && action.type === "message") {
                return {
                  ...action,
                  message: value,
                };
              }

              if (field === "itemId" && action.type === "add_item") {
                return {
                  ...action,
                  itemId: value || null,
                };
              }

              if (field === "quantity" && action.type === "add_item") {
                return {
                  ...action,
                  quantity: Math.max(1, Math.floor(normalizeDelta(value))),
                };
              }

              if (field === "targetHotspotId" && action.type === "disable_hotspot") {
                return {
                  ...action,
                  targetHotspotId: value || null,
                };
              }

              if (field === "targetBlockId" && action.type === "go_to_block") {
                return {
                  ...action,
                  targetBlockId: value || null,
                };
              }

              return action;
            }),
          };
        }),
      };
    });
  };

  const removeGameplayHotspotAction = (hotspotId: string, actionId: string) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;
      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) =>
          hotspot.id === hotspotId
            ? {
                ...hotspot,
                onClickActions: hotspot.onClickActions.filter((action) => action.id !== actionId),
              }
            : hotspot,
        ),
      };
    });
  };

  const clampSceneCoordinate = (value: number, size: number) => {
    const safeSize = clampPercent(size);
    const maxOrigin = Math.max(0, 100 - safeSize);
    return clampPercent(Math.min(Math.max(value, 0), maxOrigin));
  };

  const moveGameplayElement = (
    kind: "overlay" | "hotspot",
    elementId: string,
    x: number,
    y: number,
  ) => {
    updateSelectedBlock((block) => {
      if (block.type !== "gameplay") return block;

      if (kind === "overlay") {
        return {
          ...block,
          overlays: block.overlays.map((overlay) => {
            if (overlay.id !== elementId) return overlay;
            return {
              ...overlay,
              x: clampSceneCoordinate(x, overlay.width),
              y: clampSceneCoordinate(y, overlay.height),
            };
          }),
        };
      }

      return {
        ...block,
        hotspots: block.hotspots.map((hotspot) => {
          if (hotspot.id !== elementId) return hotspot;
          return {
            ...hotspot,
            x: clampSceneCoordinate(x, hotspot.width),
            y: clampSceneCoordinate(y, hotspot.height),
          };
        }),
      };
    });
  };

  const startGameplayElementDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: "overlay" | "hotspot",
    elementId: string,
    elementX: number,
    elementY: number,
  ) => {
    if (!canEdit || !selectedBlock || selectedBlock.type !== "gameplay") return;

    const scene = event.currentTarget.parentElement;
    if (!scene || !scene.classList.contains("pointclick-editor-scene")) return;

    const rect = scene.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pointerX = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const pointerY = clampPercent(((event.clientY - rect.top) / rect.height) * 100);

    setGameplayPlacementTarget(null);
    setGameplayDragState({
      kind,
      id: elementId,
      pointerId: event.pointerId,
      offsetX: pointerX - elementX,
      offsetY: pointerY - elementY,
    });

    scene.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const onGameplayScenePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gameplayDragState) return;
    if (event.pointerId !== gameplayDragState.pointerId) return;
    if (!selectedBlock || selectedBlock.type !== "gameplay") return;

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pointerX = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const pointerY = clampPercent(((event.clientY - rect.top) / rect.height) * 100);

    moveGameplayElement(
      gameplayDragState.kind,
      gameplayDragState.id,
      pointerX - gameplayDragState.offsetX,
      pointerY - gameplayDragState.offsetY,
    );

    event.preventDefault();
  };

  const onGameplayScenePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gameplayDragState) return;
    if (event.pointerId !== gameplayDragState.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setGameplayDragState(null);
  };

  const onGameplaySceneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectedBlock || selectedBlock.type !== "gameplay" || !gameplayPlacementTarget) return;

    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const xPercent = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const yPercent = clampPercent(((event.clientY - rect.top) / rect.height) * 100);

    if (gameplayPlacementTarget.kind === "overlay") {
      const overlay = selectedBlock.overlays.find((item) => item.id === gameplayPlacementTarget.id);
      if (!overlay) return;
      moveGameplayElement(
        "overlay",
        overlay.id,
        xPercent - overlay.width / 2,
        yPercent - overlay.height / 2,
      );
      return;
    }

    const hotspot = selectedBlock.hotspots.find((item) => item.id === gameplayPlacementTarget.id);
    if (!hotspot) return;
    moveGameplayElement(
      "hotspot",
      hotspot.id,
      xPercent - hotspot.width / 2,
      yPercent - hotspot.height / 2,
    );
  };

  const runValidation = () => {
    setLastValidation(liveIssues);
    const errorCount = liveIssues.filter((issue) => issue.level === "error").length;
    const warningCount = liveIssues.filter((issue) => issue.level === "warning").length;
    setStatusMessage(
      `Validation terminee: ${errorCount} erreur(s), ${warningCount} warning(s).`,
    );
    logAction("validate", `${errorCount} erreur(s), ${warningCount} warning(s)`);
  };

  const resetStudioToBlank = (options?: { preserveStatusMessage?: boolean }) => {
    const fresh = buildInitialStudio();
    setProject(fresh.project);
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
    clearAllAssetState();
    setGameplayPlacementTarget(null);
    setGameplayDragState(null);
    setSelectedBlockId(fresh.project.info.startBlockId ?? null);
    setLastValidation([]);
    resetPreview();
    setCloudProjectId(null);
    setCloudOwnerId(null);
    setCloudEditingLockUserId(null);
    setCloudProjectUpdatedAt(null);
    setCloudLatestUpdatedAt(null);
    setCloudAccessLevel(null);
    setCloudAccessRows([]);
    setCloudLogs([]);
    setCloudProfiles({});
    setShareEmailInput("");
    markStudioClean(buildStudioChangeFingerprint(fresh.project, fresh.nodes, fresh.edges, {}));
    if (!options?.preserveStatusMessage) {
      setStatusMessage("Nouveau projet initialise.");
    }
  };

  const {
    saveCloudProject,
    loadCloudProject,
    downloadCloudProjectBundle,
    grantCloudAccess,
    revokeCloudAccess,
    cleanupCloudOrphanAssets,
  } = useCloudProjectActions({
    supabase,
    authUser,
    project,
    nodes,
    edges,
    blocks,
    assetRefs,
    assetFiles,
    cloudProjectId,
    cloudOwnerId,
    cloudCanWrite,
    cloudCanManageAccess,
    cloudEditingLockUserId,
    cloudProjectUpdatedAt,
    cloudRevisionDrift,
    shareEmailInput,
    shareAccessLevel,
    cloudLockHeldByOther,
    hasUnsavedChanges,
    setStatusMessage,
    setCloudBusy,
    setAssetRefs,
    setCloudProjectId,
    setCloudOwnerId,
    setCloudEditingLockUserId,
    setCloudProjectUpdatedAt,
    setCloudLatestUpdatedAt,
    setCloudAccessLevel,
    setShareEmailInput,
    markStudioClean,
    refreshCloudSideData,
    refreshCloudProjects,
    appendCloudLog,
    acquireCloudLock,
    hydrateStudioFromPayload,
  });

  const changeOwnPassword = async () => {
    if (!supabase || !authUser) {
      setStatusMessage("Connecte-toi pour changer ton mot de passe.");
      return;
    }
    if (ownPasswordInput.length < 8) {
      setStatusMessage("Le nouveau mot de passe doit contenir au moins 8 caracteres.");
      return;
    }
    if (ownPasswordInput !== ownPasswordConfirmInput) {
      setStatusMessage("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    setCloudBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: ownPasswordInput,
        data: { must_change_password: false },
      });
      if (error) {
        setStatusMessage(`Erreur changement mot de passe: ${error.message}`);
        return;
      }

      setOwnPasswordInput("");
      setOwnPasswordConfirmInput("");
      setStatusMessage("Mot de passe mis a jour.");
    } finally {
      setCloudBusy(false);
    }
  };

  const createUserFromAdminPanel = async () => {
    if (!supabase || !authUser || !isPlatformAdmin) {
      setStatusMessage("Action reservee aux admins connectes.");
      return;
    }

    const email = adminCreateUserEmailInput.trim().toLowerCase();
    if (!email) {
      setStatusMessage("Saisis un email utilisateur.");
      return;
    }
    if (adminCreateUserPasswordInput.length < 8) {
      setStatusMessage("Le mot de passe provisoire doit contenir au moins 8 caracteres.");
      return;
    }

    setCloudBusy(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        setStatusMessage(
          `Session admin invalide: ${sessionError?.message ?? "reconnecte-toi puis reessaie"}`,
        );
        return;
      }

      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-supabase-access-token": session.access_token,
        },
        body: JSON.stringify({
          email,
          password: adminCreateUserPasswordInput,
          role: adminCreateUserRole,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        email?: string;
        role?: string;
      };
      if (!response.ok) {
        setStatusMessage(`Erreur creation compte: ${payload.error ?? "unknown"}`);
        return;
      }

      setAdminCreateUserEmailInput("");
      setAdminCreateUserPasswordInput("");
      setAdminCreateUserRole("reader");
      await refreshPlatformProfiles();
      setStatusMessage(
        `Compte cree: ${payload.email ?? email} (${payload.role ?? adminCreateUserRole}).`,
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const requestNewProject = () => {
    setNewProjectWarningOpen(true);
  };

  const confirmNewProjectWithoutSave = () => {
    setNewProjectWarningOpen(false);
    resetStudioToBlank();
  };

  const saveCloudAndCreateNewProject = async () => {
    const saved = await saveCloudProject();
    if (!saved) return;
    setNewProjectWarningOpen(false);
    resetStudioToBlank({ preserveStatusMessage: true });
    setStatusMessage("Projet sauvegarde dans le cloud, puis nouveau projet initialise.");
  };

  return (
    <div className="studio-root">
      <header className="studio-header">
        <div className="studio-header-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ui-assets/logo/crlogo.png"
            alt="CadaRium"
            className="studio-brand-icon"
          />
          <h1 className="studio-brand-name">
            CadaRium <em>Studio</em>
          </h1>
          <HelpHint title="Studio auteur">
            Espace de creation de light novel: construis les blocs, relie-les dans le graphe,
            valide puis exporte JSON + assets.
          </HelpHint>
        </div>
        <div className="studio-header-actions">
          <a
            className="button-secondary nav-action-button nav-action-guide"
            href="/guide-premier-projet"
            target="_blank"
            rel="noreferrer"
          >
            Guide 1er projet
          </a>
          <button
            className="button-secondary nav-action-button nav-action-new"
            onClick={requestNewProject}
            disabled={!authUser || !canUseAuthorTools}
          >
            Nouveau projet
          </button>
          <button
            className="button-secondary nav-action-button nav-action-validate"
            onClick={runValidation}
            disabled={!authUser}
          >
            Valider
          </button>
          <button
            className="button-secondary nav-action-button nav-action-preview"
            onClick={startPreview}
            disabled={!authUser}
          >
            Preview
          </button>
          <button
            className="button-primary nav-action-button nav-action-export"
            onClick={exportZip}
            disabled={!authUser}
          >
            Export ZIP
          </button>
        </div>
      </header>

      <AuthorStudioStatusPanel
        activeMemberLabel={activeMember ? `${activeMember.name} (${activeMember.role})` : "none"}
        lockHolderName={lockHolder ? lockHolder.name : "libre"}
        cloudLockHolderName={cloudLockHolderName}
        blocksCount={blocks.length}
        totalErrors={totalErrors}
        cloudUserLabel={authUser?.email ?? "deconnecte"}
        cloudAccessLevel={cloudAccessLevel}
        cloudProjectUpdatedAt={cloudProjectUpdatedAt}
        supabaseProjectRef={supabaseProjectRef}
        hasUnsavedChanges={hasUnsavedChanges}
        editBlockReason={editBlockReason}
        cloudRevisionDrift={cloudRevisionDrift}
        cloudLatestUpdatedAt={cloudLatestUpdatedAt}
        statusMessage={statusMessage}
      />

      <div className="studio-grid">
        <div className="panel-left-stack">
          <AuthorStudioCloudPanel
            supabaseEnabled={Boolean(supabase)}
            allowSelfSignup={allowSelfSignup}
            authLoading={authLoading}
            authUser={authUser}
            authEmailInput={authEmailInput}
            authPasswordInput={authPasswordInput}
            platformRole={platformRole}
            isPlatformAdmin={isPlatformAdmin}
            onAuthEmailInputChange={setAuthEmailInput}
            onAuthPasswordInputChange={setAuthPasswordInput}
            onSignIn={() => {
              void signInWithPassword();
            }}
            onSignUp={() => {
              void signUpWithPassword();
            }}
            onSignOut={() => {
              void signOutSupabase();
            }}
            ownPasswordInput={ownPasswordInput}
            ownPasswordConfirmInput={ownPasswordConfirmInput}
            accountMustChangePassword={accountMustChangePassword}
            onOwnPasswordInputChange={setOwnPasswordInput}
            onOwnPasswordConfirmInputChange={setOwnPasswordConfirmInput}
            onChangeOwnPassword={() => {
              void changeOwnPassword();
            }}
            onRefreshProjects={() => {
              void refreshCloudProjects();
            }}
            onSaveProject={() => {
              void saveCloudProject();
            }}
            onAcquireLock={() => {
              void acquireCloudLock();
            }}
            onReleaseLock={() => {
              void releaseCloudLock();
            }}
            onForceTakeoverLock={() => {
              void acquireCloudLock({ forceTakeover: true });
            }}
            cloudBusy={cloudBusy}
            cloudCanWrite={cloudCanWrite}
            cloudProjectId={cloudProjectId}
            cloudAccessLevel={cloudAccessLevel}
            cloudProjectUpdatedAt={cloudProjectUpdatedAt}
            cloudEditingLockUserId={cloudEditingLockUserId}
            cloudLockHolderName={cloudLockHolderName}
            cloudLockHeldByOther={cloudLockHeldByOther}
            cloudProjects={cloudProjects}
            onOpenProject={(projectId) => {
              void loadCloudProject(projectId);
            }}
            onDownloadProjectBundle={(projectId) => {
              void downloadCloudProjectBundle(projectId);
            }}
            canEdit={canEdit}
            onCleanupLocalOrphanAssetRefs={cleanupLocalOrphanAssetRefs}
            onCleanupCloudOrphanAssets={() => {
              void cleanupCloudOrphanAssets();
            }}
            cloudCanManageAccess={cloudCanManageAccess}
            shareEmailInput={shareEmailInput}
            onShareEmailInputChange={setShareEmailInput}
            shareAccessLevel={shareAccessLevel}
            onShareAccessLevelChange={setShareAccessLevel}
            onGrantAccess={() => {
              void grantCloudAccess();
            }}
            cloudAccessRows={cloudAccessRows}
            cloudProfiles={cloudProfiles}
            onRevokeAccess={(userId) => {
              void revokeCloudAccess(userId);
            }}
            cloudLogs={cloudLogs}
            platformProfiles={platformProfiles}
            adminCreateUserEmailInput={adminCreateUserEmailInput}
            adminCreateUserPasswordInput={adminCreateUserPasswordInput}
            adminCreateUserRole={adminCreateUserRole}
            onAdminCreateUserEmailInputChange={setAdminCreateUserEmailInput}
            onAdminCreateUserPasswordInputChange={setAdminCreateUserPasswordInput}
            onAdminCreateUserRoleChange={setAdminCreateUserRole}
            onAdminCreateUser={() => {
              void createUserFromAdminPanel();
            }}
            onRefreshPlatformProfiles={() => {
              void refreshPlatformProfiles();
            }}
            onSetPlatformProfileRole={(userId, role) => {
              void setPlatformProfileRole(userId, role);
            }}
          />

          {authUser ? (
            <AuthorStudioProjectPanel
              project={project}
              setProject={setProject}
              canEdit={canEdit}
              newVariableName={newVariableName}
              onNewVariableNameChange={setNewVariableName}
              onAddVariable={addVariable}
              onDeleteVariable={deleteVariable}
              onAddBlock={addBlock}
              assetPreviewSrcById={assetPreviewSrcById}
              getAssetFileName={getAssetFileName}
              onCreateItem={createItem}
              onRenameItem={renameItem}
              onDeleteItem={deleteItem}
              onReplaceItemIcon={replaceItemIcon}
            />
          ) : (
            <aside className="panel panel-left">
              <section className="panel-section">
                <h2>Acces restreint</h2>
                <p className="empty-placeholder">
                  Connecte-toi avec un compte valide pour acceder au studio.
                </p>
              </section>
            </aside>
          )}
        </div>

        {authUser ? (
          <>
            <main className="panel panel-canvas">
              <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedBlockId(node.id)}
                nodesDraggable={canEdit}
                nodesConnectable={canEdit}
                elementsSelectable
                fitView
                deleteKeyCode={null}
              >
                <Background variant={BackgroundVariant.Dots} gap={14} size={1} />
                <MiniMap
                  pannable
                  zoomable
                  nodeStrokeWidth={3}
                  nodeColor={(node) => blockTypeColor((node.data as StoryNodeData).block.type)}
                />
                <Controls />
              </ReactFlow>
            </main>

            <AuthorStudioBlockEditorPanel
              selectedBlock={selectedBlock}
              canEdit={canEdit}
              project={project}
              blocks={blocks}
              visibleIssues={visibleIssues}
              onDeleteSelectedBlock={deleteSelectedBlock}
              onRunValidation={runValidation}
              onSetStartBlock={setStartBlock}
              onSetSelectedDynamicField={setSelectedDynamicField}
              onUpdateSelectedBlock={updateSelectedBlock}
              onSetConnection={setConnection}
              onAssetInput={onAssetInput}
              renderAssetAttachment={renderAssetAttachment}
              renderAssetAttachmentWithRemove={renderAssetAttachmentWithRemove}
              onAddDialogueChoice={addDialogueChoice}
              onRemoveDialogueChoice={removeDialogueChoice}
              onUpdateChoiceField={updateChoiceField}
              onUnlinkDialogueNpcProfile={unlinkNpcProfileFromDialogue}
              onAddBlockEntryEffect={addBlockEntryEffect}
              onUpdateBlockEntryEffect={updateBlockEntryEffect}
              onRemoveBlockEntryEffect={removeBlockEntryEffect}
              onAddChoiceEffect={addChoiceEffect}
              onUpdateChoiceEffect={updateChoiceEffect}
              onRemoveChoiceEffect={removeChoiceEffect}
              onAddGameplayOverlay={addGameplayOverlay}
              onRemoveGameplayOverlay={removeGameplayOverlay}
              onUpdateGameplayOverlayRect={updateGameplayOverlayRect}
              onClearGameplayOverlayAsset={clearGameplayOverlayAsset}
              onAddGameplayHotspot={addGameplayHotspot}
              onRemoveGameplayHotspot={removeGameplayHotspot}
              onUpdateGameplayHotspotRect={updateGameplayHotspotRect}
              onClearGameplayHotspotSound={clearGameplayHotspotSound}
              onAddGameplayHotspotEffect={addGameplayHotspotEffect}
              onUpdateGameplayHotspotEffect={updateGameplayHotspotEffect}
              onRemoveGameplayHotspotEffect={removeGameplayHotspotEffect}
              onAddGameplayHotspotAction={addGameplayHotspotAction}
              onUpdateGameplayHotspotAction={updateGameplayHotspotAction}
              onRemoveGameplayHotspotAction={removeGameplayHotspotAction}
              onAddGameplayEffect={addGameplayEffect}
              onUpdateGameplayEffect={updateGameplayEffect}
              onRemoveGameplayEffect={removeGameplayEffect}
              gameplayPlacementTarget={gameplayPlacementTarget}
              onSetGameplayPlacementTarget={setGameplayPlacementTarget}
              onStartGameplayElementDrag={startGameplayElementDrag}
              onGameplaySceneClick={onGameplaySceneClick}
              onGameplayScenePointerMove={onGameplayScenePointerMove}
              onGameplayScenePointerEnd={onGameplayScenePointerEnd}
              assetPreviewSrcById={assetPreviewSrcById}
              onRegisterAsset={registerAsset}
              onEnsureAssetPreviewSrc={ensureAssetPreviewSrc}
              onStatusMessage={setStatusMessage}
            />
          </>
        ) : (
          <main className="panel panel-canvas">
            <section className="panel-section">
              <h2>Inscription requise</h2>
              <p className="empty-placeholder">
                La plateforme est reservee aux comptes enregistres. Cree un compte, confirme ton
                email, puis connecte-toi.
              </p>
            </section>
          </main>
        )}
      </div>

      <footer className="studio-footer">
        <a className="studio-footer-link" href="/confidentialite" target="_blank" rel="noreferrer">
          Confidentialite
        </a>
        <span className="studio-footer-separator">·</span>
        <a className="studio-footer-link" href="/mentions-legales" target="_blank" rel="noreferrer">
          Mentions legales
        </a>
      </footer>

      {newProjectWarningOpen && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <h2>Nouveau projet</h2>
            <p>Tu vas fermer le projet en cours et ouvrir une page vierge.</p>
            <p className="confirm-warning">
              {hasUnsavedChanges
                ? "Attention: des modifications ne sont pas encore sauvegardees."
                : "Pense a sauvegarder si besoin avant de quitter ce projet."}
            </p>
            <div className="confirm-actions">
              <button
                className="button-secondary"
                onClick={() => setNewProjectWarningOpen(false)}
                disabled={cloudBusy}
              >
                Annuler
              </button>
              <button
                className="button-danger"
                onClick={confirmNewProjectWithoutSave}
                disabled={cloudBusy}
              >
                Quitter sans sauvegarder
              </button>
            </div>
            <button
              className="button-primary confirm-save-button"
              onClick={() => {
                void saveCloudAndCreateNewProject();
              }}
              disabled={cloudBusy || !authUser || !supabase}
            >
              Sauvegarder cloud
            </button>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="preview-overlay">
          <div className="preview-modal">
            <header className="preview-header">
              <div>
                <h2>Preview de lecture</h2>
                <p>
                  Bloc courant:{" "}
                  <strong>{previewBlock ? `${previewBlock.name} (${previewBlock.type})` : "fin"}</strong>
                </p>
              </div>
              <div className="row-inline">
                <button className="button-secondary" onClick={startPreview}>
                  Restart
                </button>
                <button className="button-secondary" onClick={() => setPreviewOpen(false)}>
                  Fermer
                </button>
              </div>
            </header>

            <div className="preview-body">
              <section className="preview-scene">
                {!previewBlock && (
                  <div className="preview-end">
                    <h3>Fin de parcours</h3>
                    <p>Le parcours est termine ou aucune cible n a ete definie.</p>
                  </div>
                )}

                {previewBlock?.type === "title" && (
                  <div className="preview-card">
                    <h3>{previewBlock.storyTitle}</h3>
                    <p>{previewBlock.subtitle || "Sous titre vide"}</p>
                    <button
                      className="button-primary"
                      style={{
                        backgroundColor: previewBlock.buttonStyle.backgroundColor,
                        color: previewBlock.buttonStyle.textColor,
                        borderColor: previewBlock.buttonStyle.borderColor,
                        borderRadius: `${previewBlock.buttonStyle.radius}px`,
                        fontSize: `${previewBlock.buttonStyle.fontSize}px`,
                      }}
                      onClick={continuePreview}
                    >
                      Continuer
                    </button>
                  </div>
                )}

                {previewBlock?.type === "cinematic" && (
                  <div className="preview-card">
                    <h3>{previewBlock.heading}</h3>
                    <p>{previewBlock.body || "Texte cinematic vide"}</p>
                    <button className="button-primary" onClick={continuePreview}>
                      Continuer
                    </button>
                  </div>
                )}

                {previewBlock?.type === "dialogue" && (
                  (() => {
                    const linkedNpc =
                      previewBlock.npcProfileBlockId
                        ? blockById.get(previewBlock.npcProfileBlockId)
                        : null;
                    const previewSpeaker =
                      linkedNpc && linkedNpc.type === "npc_profile" && linkedNpc.npcName.trim()
                        ? linkedNpc.npcName
                        : previewBlock.speaker;

                    return (
                      <div className="preview-card">
                        <h3>{previewSpeaker || "Personnage"}</h3>
                        <p>{previewBlock.line || "Ligne vide"}</p>
                        <div className="preview-choice-grid">
                          {previewBlock.choices.map((choice) => (
                            <button
                              key={choice.id}
                              className="button-soft preview-choice"
                              onClick={() => pickPreviewChoice(choice.id)}
                            >
                              <strong>{choice.label}</strong>
                              <span>{choice.text || "Choix vide"}</span>
                              {choice.effects.length > 0 && (
                                <small>
                                  {choice.effects
                                    .map((effect) => {
                                      const variableName =
                                        variableNameById.get(effect.variableId) ?? effect.variableId;
                                      return `${variableName} ${describeEffect(effect.delta)}`;
                                    })
                                    .join(" | ")}
                                </small>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}

                {previewBlock?.type === "hero_profile" && (
                  <div className="preview-card">
                    <h3>Fiche Hero</h3>
                    <p>Bloc visuel de reference hero.</p>
                    <button className="button-primary" onClick={continuePreview}>
                      Continuer
                    </button>
                  </div>
                )}

                {previewBlock?.type === "npc_profile" && (
                  <div className="preview-card">
                    <h3>{previewBlock.npcName || "PNJ"}</h3>
                    <p>{previewBlock.npcLore || "Lore PNJ vide."}</p>
                    <button className="button-primary" onClick={continuePreview}>
                      Continuer
                    </button>
                  </div>
                )}

                {previewBlock?.type === "gameplay" && (
                  <div className="preview-card">
                    <h3>Gameplay: point_and_click</h3>
                    <p>{previewBlock.objective || "Objectif vide"}</p>
                    <div className="preview-pointclick-meta">
                      <span
                        className={`chip ${previewGameplayCompleted ? "chip-start" : "chip-warning"}`}
                      >
                        {previewGameplayCompleted ? "objectif atteint" : "objectif en cours"}
                      </span>
                      <small>{previewGameplayProgressLabel}</small>
                    </div>

                    <div className="preview-pointclick-scene-wrap">
                      <div
                        className="preview-pointclick-scene"
                        style={
                          assetPreviewSrcById[previewBlock.backgroundAssetId ?? ""]
                            ? {
                                backgroundImage: `url(${assetPreviewSrcById[previewBlock.backgroundAssetId ?? ""]})`,
                              }
                            : undefined
                        }
                      >
                        {!assetPreviewSrcById[previewBlock.backgroundAssetId ?? ""] && (
                          <div className="pointclick-editor-empty-bg">Fond gameplay manquant</div>
                        )}

                        {[...previewBlock.overlays]
                          .sort((a, b) => a.zIndex - b.zIndex)
                          .map((overlay) => {
                            const isVisible =
                              previewState?.gameplayOverlayVisibility[overlay.id] ??
                              overlay.visibleByDefault;
                            if (!isVisible) return null;

                            return (
                              <div
                                key={overlay.id}
                                className="preview-pointclick-overlay"
                                style={{
                                  left: `${overlay.x}%`,
                                  top: `${overlay.y}%`,
                                  width: `${overlay.width}%`,
                                  height: `${overlay.height}%`,
                                  zIndex: overlay.zIndex,
                                  backgroundImage: assetPreviewSrcById[overlay.assetId ?? ""]
                                    ? `url(${assetPreviewSrcById[overlay.assetId ?? ""]})`
                                    : undefined,
                                }}
                              >
                                {!assetPreviewSrcById[overlay.assetId ?? ""] && (
                                  <span>{overlay.name || "Overlay"}</span>
                                )}
                              </div>
                            );
                          })}

                        {previewBlock.hotspots.map((hotspot) => {
                          const found = previewFoundHotspotSet.has(hotspot.id);
                          return (
                            <button
                              key={hotspot.id}
                              type="button"
                              className={`preview-pointclick-hotspot ${
                                found ? "preview-pointclick-hotspot-found" : ""
                              } ${
                                previewDisabledHotspotSet.has(hotspot.id)
                                  ? "preview-pointclick-hotspot-disabled"
                                  : ""
                              }`}
                              style={{
                                left: `${hotspot.x}%`,
                                top: `${hotspot.y}%`,
                                width: `${hotspot.width}%`,
                                height: `${hotspot.height}%`,
                              }}
                              onClick={() => pickPreviewHotspot(hotspot.id)}
                              disabled={previewDisabledHotspotSet.has(hotspot.id)}
                            >
                              <span>{hotspot.name || "Zone"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {previewState?.gameplayMessage && (
                      <p className="preview-gameplay-message">{previewState.gameplayMessage}</p>
                    )}
                    {previewBlock.completionEffects.length > 0 && (
                      <ul className="preview-effects">
                        {previewBlock.completionEffects.map((effect, index) => {
                          const variableName =
                            variableNameById.get(effect.variableId) ?? effect.variableId;
                          return (
                            <li key={`${effect.variableId}-${index}`}>
                              {variableName} {describeEffect(effect.delta)}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button
                      className="button-primary"
                      onClick={continuePreview}
                      disabled={!previewGameplayCompleted}
                    >
                      {previewGameplayCompleted ? "Continuer" : "Objectif non atteint"}
                    </button>
                  </div>
                )}
              </section>

              <section className="preview-vars">
                <h3>Variables runtime</h3>
                {previewState && (
                  <ul>
                    {project.variables.map((variable) => (
                      <li key={variable.id}>
                        <span>{variable.name}</span>
                        <strong>{previewState.variables[variable.id] ?? 0}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                <h3>Inventaire runtime</h3>
                {previewState && previewInventoryItems.length > 0 && (
                  <ul>
                    {previewInventoryItems.map((item) => (
                      <li key={item.id}>
                        <span>{item.name}</span>
                        <strong>{previewState.inventory[item.id] ?? 0}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                {previewState && previewInventoryItems.length === 0 && (
                  <p className="empty-placeholder">Aucun objet recupere.</p>
                )}
                {previewState?.ended && <p className="ok-line">Parcours termine.</p>}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

