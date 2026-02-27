import { ReactNode } from "react";

interface HelpHintProps {
  title: string;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function HelpHint({
  title,
  children,
  align = "left",
  className,
}: HelpHintProps) {
  return (
    <details className={`help-hint ${className ?? ""}`.trim()}>
      <summary aria-label={`Aide: ${title}`} title={`Aide: ${title}`}>
        ?
      </summary>
      <div
        className={`help-hint-popover ${
          align === "right" ? "help-hint-popover-right" : ""
        }`.trim()}
      >
        <strong>{title}</strong>
        <div className="help-hint-content">{children}</div>
      </div>
    </details>
  );
}
