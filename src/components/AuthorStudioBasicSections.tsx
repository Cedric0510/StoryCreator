import { ChangeEvent, ReactNode } from "react";

import {
  SWITCH_DEFAULT_HANDLE,
  normalizeDelta,
} from "@/components/author-studio-core";
import { HelpHint } from "@/components/HelpHint";
import { NextBlockSelect } from "@/components/AuthorStudioNextBlockSelect";
import {
  BLOCK_LABELS,
  ChoiceBlock,
  ProjectMeta,
  StoryBlock,
  SwitchBlock,
  TitleBlock,
  createId,
} from "@/lib/story";

interface TitleEditorSectionProps {
  block: TitleBlock;
  canEdit: boolean;
  blocks: StoryBlock[];
  onSetSelectedDynamicField: (key: string, value: unknown) => void;
  onUpdateSelectedBlock: (updater: (block: StoryBlock) => StoryBlock) => void;
  onSetConnection: (sourceId: string, sourceHandle: string, targetId: string | null) => void;
  onAssetInput: (fieldName: string) => (event: ChangeEvent<HTMLInputElement>) => void;
  renderAssetAttachment: (fieldName: string, assetId: string | null) => ReactNode;
}

export function TitleEditorSection({
  block,
  canEdit,
  blocks,
  onSetSelectedDynamicField,
  onUpdateSelectedBlock,
  onSetConnection,
  onAssetInput,
  renderAssetAttachment,
}: TitleEditorSectionProps) {
  return (
    <div className="subsection">
      <div className="title-with-help">
        <h3>Bloc titre</h3>
        <HelpHint title="Bloc ecran titre">
          Configure la page d&apos;accueil de l&apos;histoire: image de fond, texte et style des
          boutons.
        </HelpHint>
      </div>
      <label>
        Titre histoire
        <input
          value={block.storyTitle}
          onChange={(event) => onSetSelectedDynamicField("storyTitle", event.target.value)}
          disabled={!canEdit}
        />
      </label>
      <label>
        Sous titre
        <input
          value={block.subtitle}
          onChange={(event) => onSetSelectedDynamicField("subtitle", event.target.value)}
          disabled={!canEdit}
        />
      </label>
      <label>
        Image de fond
        <input
          type="file"
          accept="image/*"
          onChange={onAssetInput("backgroundAssetId")}
          disabled={!canEdit}
        />
      </label>
      {renderAssetAttachment("backgroundAssetId", block.backgroundAssetId)}

      <div className="grid-two">
        <label>
          Bouton BG
          <input
            type="color"
            value={block.buttonStyle.backgroundColor}
            onChange={(event) =>
              onUpdateSelectedBlock((candidate) => {
                if (candidate.type !== "title") return candidate;
                return {
                  ...candidate,
                  buttonStyle: { ...candidate.buttonStyle, backgroundColor: event.target.value },
                };
              })
            }
            disabled={!canEdit}
          />
        </label>
        <label>
          Bouton texte
          <input
            type="color"
            value={block.buttonStyle.textColor}
            onChange={(event) =>
              onUpdateSelectedBlock((candidate) => {
                if (candidate.type !== "title") return candidate;
                return {
                  ...candidate,
                  buttonStyle: { ...candidate.buttonStyle, textColor: event.target.value },
                };
              })
            }
            disabled={!canEdit}
          />
        </label>
        <label>
          Border
          <input
            type="color"
            value={block.buttonStyle.borderColor}
            onChange={(event) =>
              onUpdateSelectedBlock((candidate) => {
                if (candidate.type !== "title") return candidate;
                return {
                  ...candidate,
                  buttonStyle: { ...candidate.buttonStyle, borderColor: event.target.value },
                };
              })
            }
            disabled={!canEdit}
          />
        </label>
        <label>
          Rayon
          <input
            type="number"
            value={block.buttonStyle.radius}
            onChange={(event) =>
              onUpdateSelectedBlock((candidate) => {
                if (candidate.type !== "title") return candidate;
                return {
                  ...candidate,
                  buttonStyle: { ...candidate.buttonStyle, radius: normalizeDelta(event.target.value) },
                };
              })
            }
            disabled={!canEdit}
          />
        </label>
      </div>

      <NextBlockSelect
        selectedBlockId={block.id}
        nextBlockId={block.nextBlockId}
        blocks={blocks}
        canEdit={canEdit}
        onChange={(targetId) => onSetConnection(block.id, "next", targetId)}
      />
    </div>
  );
}

interface SwitchEditorSectionProps {
  block: SwitchBlock;
  canEdit: boolean;
  blocks: StoryBlock[];
  project: ProjectMeta;
  onUpdateSelectedBlock: (updater: (block: StoryBlock) => StoryBlock) => void;
  onSetConnection: (sourceId: string, sourceHandle: string, targetId: string | null) => void;
}

export function SwitchEditorSection({
  block,
  canEdit,
  blocks,
  project,
  onUpdateSelectedBlock,
  onSetConnection,
}: SwitchEditorSectionProps) {
  const linkableBlocks = blocks.filter(
    (candidate) =>
      candidate.id !== block.id &&
      candidate.type !== "hero_profile" &&
      candidate.type !== "npc_profile",
  );
  const choiceBlocks = blocks.filter((candidate): candidate is ChoiceBlock => candidate.type === "choice");
  const choiceBlockById = new Map(choiceBlocks.map((choiceBlock) => [choiceBlock.id, choiceBlock]));
  const hasValueCases = block.cases.some((item) => item.conditionType !== "choice");
  const defaultChoiceCondition = () => ({
    id: createId("switch_cond"),
    choiceBlockId: choiceBlocks[0]?.id ?? null,
    choiceOptionId: choiceBlocks[0]?.choices[0]?.id ?? null,
  });
  const withLegacyChoiceReference = (
    caseItem: SwitchBlock["cases"][number],
    conditions: SwitchBlock["cases"][number]["choiceConditions"],
  ) => ({
    ...caseItem,
    choiceConditions: conditions,
    choiceBlockId: conditions[0]?.choiceBlockId ?? null,
    choiceOptionId: conditions[0]?.choiceOptionId ?? null,
  });

  return (
    <div className="subsection">
      <div className="title-with-help">
        <h3>Bloc switch</h3>
        <HelpHint title="Routage conditionnel">
          Redirige selon des cas. Chaque cas peut comparer une valeur de variable ou un choix
          memorise (bloc choix + option).
        </HelpHint>
      </div>
      <label>
        Variable evaluee (cas numeriques)
        <select
          value={block.variableId ?? ""}
          onChange={(event) =>
            onUpdateSelectedBlock((candidate) => {
              if (candidate.type !== "switch") return candidate;
              return {
                ...candidate,
                variableId: event.target.value || null,
              };
            })
          }
          disabled={!canEdit}
        >
          <option value="">Aucune variable</option>
          {project.variables.map((variable) => (
            <option key={variable.id} value={variable.id}>
              {variable.name}
            </option>
          ))}
        </select>
      </label>
      {!hasValueCases && (
        <small className="help-text">
          Aucun cas numerique actif: cette variable n est pas utilisee.
        </small>
      )}

      <div className="section-title-row">
        <div className="title-with-help">
          <h3>Cas</h3>
          <HelpHint title="Cas switch">
            Les cas sont evalues de haut en bas. Le premier qui correspond est utilise.
          </HelpHint>
        </div>
        <button
          className="button-secondary"
          onClick={() =>
            onUpdateSelectedBlock((candidate) => {
              if (candidate.type !== "switch") return candidate;
              return {
                ...candidate,
                cases: [
                  ...candidate.cases,
                  {
                    id: createId("switch_case"),
                    conditionType: choiceBlocks.length > 0 ? "choice" : "value",
                    expectedValue: 0,
                    choiceConditions: choiceBlocks.length > 0 ? [defaultChoiceCondition()] : [],
                    choiceBlockId: choiceBlocks[0]?.id ?? null,
                    choiceOptionId: choiceBlocks[0]?.choices[0]?.id ?? null,
                    targetBlockId: null,
                  },
                ],
              };
            })
          }
          disabled={!canEdit}
        >
          + cas
        </button>
      </div>

      {block.cases.length === 0 && (
        <small className="empty-placeholder">Ajoute au moins un cas.</small>
      )}

      {block.cases.map((item, index) => (
        <div key={item.id} className="choice-card">
          <div className="section-title-row">
            <strong>Cas {index + 1}</strong>
            <button
              className="button-danger"
              onClick={() => {
                onSetConnection(block.id, `switch-case-${item.id}`, null);
                onUpdateSelectedBlock((candidate) => {
                  if (candidate.type !== "switch") return candidate;
                  return {
                    ...candidate,
                    cases: candidate.cases.filter((candidateCase) => candidateCase.id !== item.id),
                  };
                });
              }}
              disabled={!canEdit}
            >
              x
            </button>
          </div>
          <label>
            Condition
            <select
              value={item.conditionType}
              onChange={(event) =>
                onUpdateSelectedBlock((candidate) => {
                  if (candidate.type !== "switch") return candidate;
                  return {
                    ...candidate,
                    cases: candidate.cases.map((candidateCase) => {
                      if (candidateCase.id !== item.id) return candidateCase;
                      const nextConditionType =
                        event.target.value === "choice" ? "choice" : "value";
                      if (nextConditionType === "choice") {
                        const nextConditions =
                          candidateCase.choiceConditions.length > 0
                            ? candidateCase.choiceConditions
                            : [defaultChoiceCondition()];
                        return withLegacyChoiceReference(
                          {
                            ...candidateCase,
                            conditionType: "choice",
                          },
                          nextConditions,
                        );
                      }
                      return {
                        ...candidateCase,
                        conditionType: "value",
                        choiceConditions: [],
                        choiceBlockId: null,
                        choiceOptionId: null,
                      };
                    }),
                  };
                })
              }
              disabled={!canEdit}
            >
              <option value="choice">Choix memorise</option>
              <option value="value">Valeur variable</option>
            </select>
          </label>

          {item.conditionType === "choice" ? (
            <>
              <div className="section-title-row">
                <div className="title-with-help">
                  <span>Conditions (ET)</span>
                  <HelpHint title="Conditions multiples">
                    Toutes les conditions de ce cas doivent etre vraies pour activer la cible.
                  </HelpHint>
                </div>
                <button
                  className="button-secondary"
                  onClick={() =>
                    onUpdateSelectedBlock((candidate) => {
                      if (candidate.type !== "switch") return candidate;
                      return {
                        ...candidate,
                        cases: candidate.cases.map((candidateCase) => {
                          if (candidateCase.id !== item.id) return candidateCase;
                          const nextConditions = [
                            ...candidateCase.choiceConditions,
                            defaultChoiceCondition(),
                          ];
                          return withLegacyChoiceReference(candidateCase, nextConditions);
                        }),
                      };
                    })
                  }
                  disabled={!canEdit}
                >
                  + condition
                </button>
              </div>

              {item.choiceConditions.length === 0 && (
                <small className="empty-placeholder">
                  Ajoute au moins une condition.
                </small>
              )}

              {item.choiceConditions.map((condition, conditionIndex) => {
                const sourceChoices = condition.choiceBlockId
                  ? choiceBlockById.get(condition.choiceBlockId)?.choices ?? []
                  : [];

                return (
                  <div key={condition.id} className="effect-row">
                    <select
                      value={condition.choiceBlockId ?? ""}
                      onChange={(event) =>
                        onUpdateSelectedBlock((candidate) => {
                          if (candidate.type !== "switch") return candidate;
                          return {
                            ...candidate,
                            cases: candidate.cases.map((candidateCase) => {
                              if (candidateCase.id !== item.id) return candidateCase;
                              const nextConditions = candidateCase.choiceConditions.map((candidateCondition) => {
                                if (candidateCondition.id !== condition.id) return candidateCondition;
                                const nextChoiceBlockId = event.target.value || null;
                                const nextChoiceBlock = nextChoiceBlockId
                                  ? choiceBlockById.get(nextChoiceBlockId) ?? null
                                  : null;
                                return {
                                  ...candidateCondition,
                                  choiceBlockId: nextChoiceBlockId,
                                  choiceOptionId: nextChoiceBlock?.choices[0]?.id ?? null,
                                };
                              });
                              return withLegacyChoiceReference(candidateCase, nextConditions);
                            }),
                          };
                        })
                      }
                      disabled={!canEdit}
                      title={`Condition ${conditionIndex + 1} - bloc`}
                    >
                      <option value="">Aucun bloc choix</option>
                      {choiceBlocks.map((choiceBlock) => (
                        <option key={choiceBlock.id} value={choiceBlock.id}>
                          {choiceBlock.name || "Choix"} ({choiceBlock.id.slice(-4)})
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.choiceOptionId ?? ""}
                      onChange={(event) =>
                        onUpdateSelectedBlock((candidate) => {
                          if (candidate.type !== "switch") return candidate;
                          return {
                            ...candidate,
                            cases: candidate.cases.map((candidateCase) => {
                              if (candidateCase.id !== item.id) return candidateCase;
                              const nextConditions = candidateCase.choiceConditions.map((candidateCondition) =>
                                candidateCondition.id === condition.id
                                  ? { ...candidateCondition, choiceOptionId: event.target.value || null }
                                  : candidateCondition,
                              );
                              return withLegacyChoiceReference(candidateCase, nextConditions);
                            }),
                          };
                        })
                      }
                      disabled={!canEdit}
                      title={`Condition ${conditionIndex + 1} - option`}
                    >
                      <option value="">Aucune option</option>
                      {sourceChoices.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} - {option.text || "Sans texte"}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button-danger"
                      onClick={() =>
                        onUpdateSelectedBlock((candidate) => {
                          if (candidate.type !== "switch") return candidate;
                          return {
                            ...candidate,
                            cases: candidate.cases.map((candidateCase) => {
                              if (candidateCase.id !== item.id) return candidateCase;
                              const nextConditions = candidateCase.choiceConditions.filter(
                                (candidateCondition) => candidateCondition.id !== condition.id,
                              );
                              return withLegacyChoiceReference(candidateCase, nextConditions);
                            }),
                          };
                        })
                      }
                      disabled={!canEdit}
                      title="Supprimer cette condition"
                    >
                      x
                    </button>
                  </div>
                );
              })}
              {choiceBlocks.length === 0 && (
                <small className="empty-placeholder">
                  Aucun bloc choix dans l histoire. Ajoute un bloc choix pour utiliser ce mode.
                </small>
              )}
            </>
          ) : (
            <label>
              Valeur attendue
              <input
                type="number"
                value={item.expectedValue}
                onChange={(event) =>
                  onUpdateSelectedBlock((candidate) => {
                    if (candidate.type !== "switch") return candidate;
                    return {
                      ...candidate,
                      cases: candidate.cases.map((candidateCase) =>
                        candidateCase.id === item.id
                          ? { ...candidateCase, expectedValue: normalizeDelta(event.target.value) }
                          : candidateCase,
                      ),
                    };
                  })
                }
                disabled={!canEdit}
              />
            </label>
          )}
          <label>
            Cible bloc
            <select
              value={item.targetBlockId ?? ""}
              onChange={(event) =>
                onSetConnection(block.id, `switch-case-${item.id}`, event.target.value || null)
              }
              disabled={!canEdit}
            >
              <option value="">Aucune cible</option>
              {linkableBlocks.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({BLOCK_LABELS[candidate.type]})
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}

      <label>
        Sortie Sinon
        <select
          value={block.nextBlockId ?? ""}
          onChange={(event) =>
            onSetConnection(block.id, SWITCH_DEFAULT_HANDLE, event.target.value || null)
          }
          disabled={!canEdit}
        >
          <option value="">Fin histoire</option>
          {linkableBlocks.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({BLOCK_LABELS[candidate.type]})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
