import { CloudAccessLevel } from "@/components/author-studio-types";
import { HelpHint } from "@/components/HelpHint";

interface AuthorStudioStatusPanelProps {
  activeMemberLabel: string;
  lockHolderName: string;
  cloudLockHolderName: string;
  blocksCount: number;
  totalErrors: number;
  cloudUserLabel: string;
  cloudAccessLevel: CloudAccessLevel | null;
  cloudProjectUpdatedAt: string | null;
  supabaseProjectRef: string;
  hasUnsavedChanges: boolean;
  editBlockReason: string | null;
  cloudRevisionDrift: boolean;
  cloudLatestUpdatedAt: string | null;
  statusMessage: string;
}

export function AuthorStudioStatusPanel({
  activeMemberLabel,
  lockHolderName,
  cloudLockHolderName,
  blocksCount,
  totalErrors,
  cloudUserLabel,
  cloudAccessLevel,
  cloudProjectUpdatedAt,
  supabaseProjectRef,
  hasUnsavedChanges,
  editBlockReason,
  cloudRevisionDrift,
  cloudLatestUpdatedAt,
  statusMessage,
}: AuthorStudioStatusPanelProps) {
  return (
    <>
      <div className="status-strip">
        <span>
          <HelpHint title="Barre de statut" align="right">
            Resume en direct l&apos;etat du studio: utilisateur, verrous, nombre de blocs, erreurs et
            synchronisation cloud.
          </HelpHint>
        </span>
        <span>
          Utilisateur actif: <strong>{activeMemberLabel}</strong>
        </span>
        <span>
          Verrou edition: <strong>{lockHolderName}</strong>
        </span>
        <span>
          Verrou cloud: <strong>{cloudLockHolderName}</strong>
        </span>
        <span>
          Blocs: <strong>{blocksCount}</strong>
        </span>
        <span>
          Erreurs: <strong>{totalErrors}</strong>
        </span>
        <span>
          Cloud user: <strong>{cloudUserLabel}</strong>
        </span>
        <span>
          Cloud acces: <strong>{cloudAccessLevel ?? "local-only"}</strong>
        </span>
        <span>
          Cloud rev:{" "}
          <strong>
            {cloudProjectUpdatedAt ? new Date(cloudProjectUpdatedAt).toLocaleString("fr-FR") : "n/a"}
          </strong>
        </span>
        <span>
          Supabase ref: <strong>{supabaseProjectRef}</strong>
        </span>
        <span>
          Etat: <strong>{hasUnsavedChanges ? "modifie (non sauvegarde)" : "a jour"}</strong>
        </span>
      </div>

      {editBlockReason && <div className="warning-banner">{editBlockReason}</div>}
      {cloudRevisionDrift && (
        <div className="warning-banner">
          Une version cloud plus recente est disponible ({new Date(cloudLatestUpdatedAt ?? "").toLocaleString("fr-FR")}).
          Recharge le projet avant de sauvegarder pour eviter d&apos;ecraser le travail d&apos;un collaborateur.
        </div>
      )}

      {statusMessage && <div className="info-banner">{statusMessage}</div>}
    </>
  );
}
