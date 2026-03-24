import { BLOCK_LABELS, StoryBlock } from "@/lib/story";

interface NextBlockSelectProps {
  selectedBlockId: string;
  nextBlockId: string | null;
  blocks: StoryBlock[];
  canEdit: boolean;
  onChange: (targetId: string | null) => void;
}

export function NextBlockSelect({
  selectedBlockId,
  nextBlockId,
  blocks,
  canEdit,
  onChange,
}: NextBlockSelectProps) {
  return (
    <label>
      Bloc suivant
      <select
        value={nextBlockId ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={!canEdit}
      >
        <option value="">Fin histoire</option>
        {blocks
          .filter(
            (block) =>
              block.id !== selectedBlockId &&
              block.type !== "hero_profile" &&
              block.type !== "npc_profile",
          )
          .map((block) => (
            <option key={block.id} value={block.id}>
              {block.name} ({BLOCK_LABELS[block.type]})
            </option>
          ))}
      </select>
    </label>
  );
}
