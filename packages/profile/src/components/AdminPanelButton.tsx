import { useRoles } from "../hooks/use-roles.js";
import { useT } from "../hooks/use-t.js";
import { ExternalLinkIcon } from "./Icons.js";

const ADMIN_ROLES = ["owner", "admin"];

interface AdminPanelButtonProps {
  adminPanelUrl: string;
}

export function AdminPanelButton({ adminPanelUrl }: AdminPanelButtonProps) {
  const roles = useRoles();
  const t = useT();

  const hasAccess = roles.some((r) => ADMIN_ROLES.includes(r));
  if (!hasAccess) return null;

  return (
    <div className="aiw-section">
      <a
        href={adminPanelUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="aiw-btn-admin"
      >
        <ExternalLinkIcon />
        {t("admin.open")}
      </a>
    </div>
  );
}
