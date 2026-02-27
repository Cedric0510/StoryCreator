"use client";

import { ChangeEvent, useCallback, useState } from "react";
import JSZip from "jszip";
import { SupabaseClient, User } from "@supabase/supabase-js";

import {
  EditorEdge,
  assetPath,
  collectProjectReferencedAssetIds,
  downloadBlob,
  fileToDataUrl,
  serializeBlock,
} from "@/components/author-studio-core";
import {
  AssetRef,
  ProjectMeta,
  StoryBlock,
  ValidationIssue,
  createId,
  sanitizeFileName,
  validateStoryBlocks,
} from "@/lib/story";

const SUPABASE_ASSET_BUCKET = "author-assets";

interface UseStudioAssetsParams {
  blocks: StoryBlock[];
  project: ProjectMeta;
  edges: EditorEdge[];
  variableNameById: Map<string, string>;
  canEdit: boolean;
  supabase: SupabaseClient | null;
  authUser: User | null;
  setLastValidation: (issues: ValidationIssue[]) => void;
  setStatusMessage: (message: string) => void;
  logAction: (action: string, details: string) => void;
}

type AttachAssetField = (fieldName: string, assetId: string) => void;

export function useStudioAssets({
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
}: UseStudioAssetsParams) {
  const [assetRefs, setAssetRefs] = useState<Record<string, AssetRef>>({});
  const [assetFiles, setAssetFiles] = useState<Record<string, File>>({});
  const [assetPreviewSrcById, setAssetPreviewSrcById] = useState<Record<string, string>>({});

  const ensureAssetPreviewSrc = useCallback(
    async (assetId: string | null) => {
      if (!assetId) return null;
      if (assetPreviewSrcById[assetId]) return assetPreviewSrcById[assetId];

      const localFile = assetFiles[assetId];
      if (localFile) {
        try {
          const dataUrl = await fileToDataUrl(localFile);
          setAssetPreviewSrcById((current) => ({ ...current, [assetId]: dataUrl }));
          return dataUrl;
        } catch {
          return null;
        }
      }

      const ref = assetRefs[assetId];
      if (!ref?.storagePath || !supabase || !authUser) return null;

      const bucket = ref.storageBucket ?? SUPABASE_ASSET_BUCKET;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(ref.storagePath, 60 * 60);
      if (error || !data?.signedUrl) return null;

      setAssetPreviewSrcById((current) => ({ ...current, [assetId]: data.signedUrl }));
      return data.signedUrl;
    },
    [assetFiles, assetPreviewSrcById, assetRefs, authUser, supabase],
  );

  const registerAsset = useCallback((file: File) => {
    const assetId = createId("asset");
    const ref: AssetRef = {
      id: assetId,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      packagePath: `assets/${assetId}-${sanitizeFileName(file.name)}`,
      uploadedAt: new Date().toISOString(),
      storageBucket: null,
      storagePath: null,
    };
    setAssetRefs((current) => ({ ...current, [assetId]: ref }));
    setAssetFiles((current) => ({ ...current, [assetId]: file }));
    return assetId;
  }, []);

  const createAssetInputHandler = useCallback(
    (fieldName: string, onAttachField: AttachAssetField) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return;

        const file = event.target.files?.[0];
        if (!file) return;

        const assetId = registerAsset(file);
        onAttachField(fieldName, assetId);
        void ensureAssetPreviewSrc(assetId);
        logAction("attach_asset", `${file.name} -> ${fieldName}`);
        setStatusMessage(`Asset ${file.name} ajoute.`);
        event.target.value = "";
      },
    [canEdit, ensureAssetPreviewSrc, logAction, registerAsset, setStatusMessage],
  );

  const getAssetFileName = useCallback(
    (assetId: string | null) => assetRefs[assetId ?? ""]?.fileName ?? "Aucun asset",
    [assetRefs],
  );

  const clearAllAssetState = useCallback(() => {
    setAssetRefs({});
    setAssetFiles({});
    setAssetPreviewSrcById({});
  }, []);

  const hydrateAssetRefs = useCallback((nextRefs: Record<string, AssetRef>) => {
    setAssetRefs(nextRefs);
    setAssetFiles({});
    setAssetPreviewSrcById({});
  }, []);

  const exportZip = useCallback(async () => {
    const issues = validateStoryBlocks(blocks, project.info.startBlockId);
    setLastValidation(issues);

    const errors = issues.filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      setStatusMessage("Corrige les erreurs bloquantes avant export.");
      return;
    }

    const referencedAssetIds = collectProjectReferencedAssetIds(project, blocks);
    for (const assetId of referencedAssetIds) {
      if (!assetRefs[assetId]) {
        setStatusMessage(`Asset reference introuvable (${assetId}).`);
        return;
      }
    }

    const payload = {
      schemaVersion: project.info.schemaVersion,
      exportedAt: new Date().toISOString(),
      project: {
        id: project.info.id,
        title: project.info.title,
        slug: project.info.slug,
        synopsis: project.info.synopsis,
        startBlockId: project.info.startBlockId,
        updatedAt: project.info.updatedAt,
      },
      variables: project.variables,
      itemsCatalog: project.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        iconAssetId: item.iconAssetId,
        iconPath: assetPath(item.iconAssetId, assetRefs),
      })),
      hero: {
        name: project.hero.name,
        lore: project.hero.lore,
        baseStats: project.hero.baseStats.map((stat) => ({
          id: stat.id,
          variableId: stat.variableId,
          variableName: variableNameById.get(stat.variableId) ?? "unknown",
          value: stat.value,
        })),
        npcs: project.hero.npcs.map((npc) => ({
          id: npc.id,
          name: npc.name,
          lore: npc.lore,
          baseFriendship: npc.baseFriendship,
        })),
        startingInventory: project.hero.startingInventory.map((entry) => {
          const item = project.items.find((candidate) => candidate.id === entry.itemId) ?? null;
          return {
            id: entry.id,
            itemId: entry.itemId,
            itemName: item?.name ?? "unknown",
            quantity: entry.quantity,
            iconAssetId: item?.iconAssetId ?? null,
            iconPath: assetPath(item?.iconAssetId ?? null, assetRefs),
          };
        }),
      },
      blocks: blocks.map((block) => serializeBlock(block, variableNameById, assetRefs)),
      graph: {
        edges: edges.map((edge) => ({
          source: edge.source,
          sourceHandle: edge.sourceHandle ?? "next",
          target: edge.target,
        })),
      },
    };

    const zip = new JSZip();
    zip.file("story.json", JSON.stringify(payload, null, 2));

    for (const assetId of referencedAssetIds) {
      const ref = assetRefs[assetId];
      if (!ref) continue;

      const localFile = assetFiles[assetId];
      if (localFile) {
        zip.file(ref.packagePath, localFile);
        continue;
      }

      if (!ref.storagePath) {
        setStatusMessage(
          `Asset manquant pour export: ${ref.fileName}. Reimporte le fichier puis sauvegarde cloud.`,
        );
        return;
      }

      if (!supabase || !authUser) {
        setStatusMessage(
          `Connexion cloud requise pour telecharger ${ref.fileName} depuis Supabase Storage.`,
        );
        return;
      }

      const bucket = ref.storageBucket ?? SUPABASE_ASSET_BUCKET;
      const { data, error } = await supabase.storage.from(bucket).download(ref.storagePath);
      if (error || !data) {
        setStatusMessage(
          `Erreur telechargement asset (${ref.fileName}): ${error?.message ?? "unknown"}`,
        );
        return;
      }

      zip.file(ref.packagePath, data);
    }

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    downloadBlob(blob, `${project.info.slug || "story"}-bundle.zip`);
    setStatusMessage(`Export reussi: ${referencedAssetIds.size} asset(s) dans le ZIP.`);
    logAction("export_zip", `${referencedAssetIds.size} assets`);
  }, [
    assetFiles,
    assetRefs,
    authUser,
    blocks,
    edges,
    logAction,
    project,
    setLastValidation,
    setStatusMessage,
    supabase,
    variableNameById,
  ]);

  const removeAssetIdsFromState = useCallback((assetIds: string[]) => {
    if (assetIds.length === 0) return 0;
    const staleIds = new Set(assetIds);

    setAssetRefs((current) => {
      const next = { ...current };
      for (const assetId of staleIds) {
        delete next[assetId];
      }
      return next;
    });

    setAssetFiles((current) => {
      const next = { ...current };
      for (const assetId of staleIds) {
        delete next[assetId];
      }
      return next;
    });

    setAssetPreviewSrcById((current) => {
      const next = { ...current };
      for (const assetId of staleIds) {
        delete next[assetId];
      }
      return next;
    });

    return staleIds.size;
  }, []);

  const cleanupLocalOrphanAssetRefs = useCallback(() => {
    const referencedAssetIds = collectProjectReferencedAssetIds(project, blocks);
    const staleAssetIds = Object.keys(assetRefs).filter(
      (assetId) => !referencedAssetIds.has(assetId),
    );

    if (staleAssetIds.length === 0) {
      setStatusMessage("Aucune reference asset orpheline en local.");
      return;
    }

    const removedCount = removeAssetIdsFromState(staleAssetIds);
    setStatusMessage(`Nettoyage local termine: ${removedCount} reference(s) asset supprimee(s).`);
    logAction("asset_cleanup_local", `${removedCount} reference(s) supprimee(s)`);
  }, [assetRefs, blocks, logAction, project, removeAssetIdsFromState, setStatusMessage]);

  return {
    assetRefs,
    assetFiles,
    assetPreviewSrcById,
    setAssetRefs,
    setAssetFiles,
    setAssetPreviewSrcById,
    ensureAssetPreviewSrc,
    registerAsset,
    createAssetInputHandler,
    getAssetFileName,
    clearAllAssetState,
    hydrateAssetRefs,
    exportZip,
    cleanupLocalOrphanAssetRefs,
  };
}
