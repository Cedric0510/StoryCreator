import { ValidationIssue } from "@/lib/story";

interface ValidationStatusButtonProps {
  validationLevel: "ok" | "warning" | "error";
  totalErrors: number;
  totalWarnings: number;
  validationSummary: string;
  onOpen: () => void;
}

export function ValidationStatusButton({
  validationLevel,
  totalErrors,
  totalWarnings,
  validationSummary,
  onOpen,
}: ValidationStatusButtonProps) {
  return (
    <button
      type="button"
      className={`nav-validation-button nav-validation-button-${validationLevel}`}
      onClick={onOpen}
      title={`Validation: ${validationSummary}`}
      aria-label={`Ouvrir la validation (${validationSummary})`}
    >
      {totalErrors > 0
        ? `Erreurs ${totalErrors}`
        : totalWarnings > 0
          ? `Warnings ${totalWarnings}`
          : "Validation OK"}
    </button>
  );
}

interface ValidationModalProps {
  open: boolean;
  validationSummary: string;
  visibleIssues: ValidationIssue[];
  onClose: () => void;
  onRunValidation: () => void;
}

export function ValidationModal({
  open,
  validationSummary,
  visibleIssues,
  onClose,
  onRunValidation,
}: ValidationModalProps) {
  if (!open) return null;

  return (
    <div className="account-modal-overlay" onClick={onClose}>
      <section
        className="account-modal-card validation-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Validation du projet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-modal-head">
          <h2>Validation</h2>
          <div className="row-inline">
            <button className="button-secondary" onClick={onRunValidation}>
              Recontroler
            </button>
            <button className="button-secondary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
        <p className="account-modal-subtitle">
          Etat actuel: <strong>{validationSummary}</strong>
        </p>
        {visibleIssues.length === 0 && <p className="ok-line">Aucun probleme detecte.</p>}
        {visibleIssues.length > 0 && (
          <ul className="issues-list validation-issues-list">
            {visibleIssues.map((issue, index) => (
              <li
                key={`${issue.blockId ?? "global"}-${index}`}
                className={`validation-issue validation-issue-${issue.level}`}
              >
                <span className={`chip ${issue.level === "error" ? "chip-error" : "chip-warning"}`}>
                  {issue.level}
                </span>
                <p>{issue.message}</p>
                {issue.blockId && <small>Bloc: {issue.blockId}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

