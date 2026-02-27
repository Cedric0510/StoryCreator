import { describe, expect, it } from "vitest";

import {
  createBlock,
  normalizeGameplayBlock,
  validateStoryBlocks,
  type GameplayBlock,
} from "./story";

describe("story gameplay schema", () => {
  it("creates gameplay block with point and click defaults", () => {
    const block = createBlock("gameplay", { x: 100, y: 120 }) as GameplayBlock;

    expect(block.mode).toBe("point_and_click");
    expect(block.overlays.length).toBeGreaterThan(0);
    expect(block.hotspots.length).toBeGreaterThan(0);
    expect(block.completionRule.type).toBe("all_required");
  });

  it("normalizes malformed gameplay payloads", () => {
    const base = createBlock("gameplay", { x: 0, y: 0 }) as GameplayBlock;
    const malformed = {
      ...base,
      overlays: undefined,
      hotspots: undefined,
      completionRule: null,
      completionEffects: null,
    } as unknown as GameplayBlock;

    const normalized = normalizeGameplayBlock(malformed);

    expect(normalized.mode).toBe("point_and_click");
    expect(normalized.overlays).toEqual([]);
    expect(normalized.hotspots).toEqual([]);
    expect(normalized.completionRule.type).toBe("all_required");
    expect(normalized.completionRule.requiredCount).toBe(1);
    expect(normalized.completionEffects).toEqual([]);
  });

  it("reports gameplay validation issues", () => {
    const title = createBlock("title", { x: 0, y: 0 });
    const gameplay = createBlock("gameplay", { x: 50, y: 50 }) as GameplayBlock;

    gameplay.hotspots = [];

    const issues = validateStoryBlocks([title, gameplay], title.id);

    expect(
      issues.some(
        (issue) =>
          issue.level === "error" &&
          issue.blockId === gameplay.id &&
          issue.message.includes("zone cliquable"),
      ),
    ).toBe(true);
  });

  it("detects hotspot links to missing overlays", () => {
    const title = createBlock("title", { x: 0, y: 0 });
    const gameplay = createBlock("gameplay", { x: 50, y: 50 }) as GameplayBlock;

    gameplay.hotspots = gameplay.hotspots.map((hotspot) => ({
      ...hotspot,
      toggleOverlayId: "overlay_missing",
    }));

    const issues = validateStoryBlocks([title, gameplay], title.id);

    expect(
      issues.some(
        (issue) =>
          issue.level === "error" &&
          issue.blockId === gameplay.id &&
          issue.message.includes("overlay introuvable"),
      ),
    ).toBe(true);
  });

  it("detects hotspot click actions targeting missing blocks", () => {
    const title = createBlock("title", { x: 0, y: 0 });
    const gameplay = createBlock("gameplay", { x: 50, y: 50 }) as GameplayBlock;

    gameplay.hotspots = gameplay.hotspots.map((hotspot) => ({
      ...hotspot,
      onClickActions: [
        {
          id: "action_1",
          type: "go_to_block",
          targetBlockId: "block_missing",
        },
      ],
    }));

    const issues = validateStoryBlocks([title, gameplay], title.id);

    expect(
      issues.some(
        (issue) =>
          issue.level === "error" &&
          issue.blockId === gameplay.id &&
          issue.message.includes("action vers un bloc supprime"),
      ),
    ).toBe(true);
  });

  it("detects hotspot item rewards targeting missing items", () => {
    const title = createBlock("title", { x: 0, y: 0 });
    const gameplay = createBlock("gameplay", { x: 50, y: 50 }) as GameplayBlock;

    gameplay.hotspots = gameplay.hotspots.map((hotspot) => ({
      ...hotspot,
      onClickActions: [
        {
          id: "action_item_1",
          type: "add_item",
          itemId: "item_missing",
          quantity: 1,
        },
      ],
    }));

    const issues = validateStoryBlocks([title, gameplay], title.id, []);

    expect(
      issues.some(
        (issue) =>
          issue.level === "error" &&
          issue.blockId === gameplay.id &&
          issue.message.includes("objet introuvable"),
      ),
    ).toBe(true);
  });
});
