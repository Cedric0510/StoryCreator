"use client";

import { Handle, Node, NodeProps, Position } from "@xyflow/react";

import { HelpHint } from "@/components/HelpHint";
import { BLOCK_LABELS, DialogueBlock, StoryBlock, blockTypeColor } from "@/lib/story";

export interface StoryNodeData {
  [key: string]: unknown;
  block: StoryBlock;
  isStart: boolean;
  hasError: boolean;
  hasWarning: boolean;
}

type StoryEditorNode = Node<StoryNodeData>;

function DialogueOutputs({ block }: { block: DialogueBlock }) {
  return (
    <div className="story-node-dialogue-outputs">
      {block.choices.map((choice) => (
        <div key={choice.id} className="story-node-choice-row">
          <span className="story-node-choice-label">{choice.label}</span>
          <span className="story-node-choice-text">
            {choice.text.trim() || "Choix vide"}
          </span>
          <Handle
            type="source"
            id={`choice-${choice.label}`}
            position={Position.Right}
            className="story-node-handle"
          />
        </div>
      ))}
    </div>
  );
}

function blockSummary(block: StoryBlock) {
  if (block.type === "title") return block.storyTitle || "Titre vide";
  if (block.type === "cinematic") return block.heading || "Cinematique";
  if (block.type === "dialogue") return `${block.speaker}: ${block.line || "..."}`;
  if (block.type === "hero_profile") return "Fiche du hero (visuel)";
  if (block.type === "npc_profile") return `${block.npcName || "PNJ"} (${block.imageAssetIds.length} image(s))`;
  const hotspotCount = block.hotspots?.length ?? 0;
  if (!block.objective.trim()) return `Point&Click (${hotspotCount} zone(s))`;
  return `${block.objective} (${hotspotCount} zone(s))`;
}

function blockHelp(block: StoryBlock) {
  if (block.type === "title") {
    return "Ecran d'accueil de l'histoire: titre, fond, style des boutons et lien vers la suite.";
  }
  if (block.type === "cinematic") {
    return "Scene narrative lineaire: texte, image/video/voix puis passage au bloc suivant.";
  }
  if (block.type === "dialogue") {
    return "Conversation a choix: chaque reponse peut modifier des variables et ouvrir une branche.";
  }
  if (block.type === "hero_profile") {
    return "Bloc visuel de reference du hero, relie aux donnees definies dans la fiche hero du projet.";
  }
  if (block.type === "npc_profile") {
    return "Profil PNJ reutilisable (nom, lore, images) pour alimenter les blocs dialogue.";
  }
  return "Scene point & clic avec zones interactives, actions au clic, objets et condition de fin.";
}

function NpcProfileOutput() {
  return (
    <div className="story-node-footer">
      <span>Lier a un dialogue</span>
      <Handle
        type="source"
        id="npc-link"
        position={Position.Right}
        className="story-node-handle"
      />
    </div>
  );
}

export function StoryNode({ data, selected }: NodeProps<StoryEditorNode>) {
  const color = blockTypeColor(data.block.type);
  const summary = blockSummary(data.block);
  const canReceiveConnections =
    data.block.type !== "hero_profile" && data.block.type !== "npc_profile";

  return (
    <div
      className={`story-node ${selected ? "story-node-selected" : ""}`}
      style={{ borderColor: color }}
    >
      {canReceiveConnections && (
        <Handle
          type="target"
          position={Position.Left}
          className="story-node-handle"
        />
      )}
      <header className="story-node-header">
        <div className="story-node-header-main">
          <span
            className="story-node-type-chip"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {BLOCK_LABELS[data.block.type]}
          </span>
          {data.isStart && <span className="story-node-start-chip">START</span>}
        </div>
        <HelpHint
          title={`Bloc ${BLOCK_LABELS[data.block.type]}`}
          className="story-node-help"
          align="right"
        >
          {blockHelp(data.block)}
        </HelpHint>
      </header>
      <h4 className="story-node-title">{data.block.name || BLOCK_LABELS[data.block.type]}</h4>
      <p className="story-node-summary">{summary}</p>
      {data.block.type === "dialogue" ? (
        <DialogueOutputs block={data.block} />
      ) : data.block.type === "npc_profile" ? (
        <NpcProfileOutput />
      ) : data.block.type === "hero_profile" ? (
        <div className="story-node-footer">
          <span>Bloc visuel</span>
        </div>
      ) : (
        <div className="story-node-footer">
          <span>Suivant</span>
          <Handle
            type="source"
            id="next"
            position={Position.Right}
            className="story-node-handle"
          />
        </div>
      )}
      {(data.hasError || data.hasWarning) && (
        <div className="story-node-issues">
          {data.hasError ? "Erreurs a corriger" : "Warnings detectes"}
        </div>
      )}
    </div>
  );
}
