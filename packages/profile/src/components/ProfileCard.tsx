import { useProfile } from "../hooks/use-profile.js";
import { AvatarEditor } from "./AvatarEditor.js";
import { LanguageSelector } from "./LanguageSelector.js";
import { CountrySelector } from "./CountrySelector.js";
import { ContactMethods } from "./ContactMethods.js";
import { AdminPanelButton } from "./AdminPanelButton.js";
import { LogoutButton } from "./LogoutButton.js";
import { LoadingSpinner } from "./LoadingSpinner.js";

interface ProfileCardProps {
  adminPanelUrl?: string;
  onLogout?: () => void;
}

export function ProfileCard({ adminPanelUrl, onLogout }: ProfileCardProps) {
  const { state } = useProfile();

  if (state.loading) {
    return <LoadingSpinner />;
  }

  if (state.error) {
    return <div className="aiw-error">{state.error}</div>;
  }

  const profile = state.profile;
  if (!profile) return null;

  return (
    <>
      <div className="aiw-profile-header">
        <AvatarEditor />
        <div className="aiw-profile-info">
          <div className="aiw-profile-name">{profile.name}</div>
          <div className="aiw-profile-email">{profile.email}</div>
        </div>
      </div>

      <div className="aiw-section">
        <LanguageSelector />
        <CountrySelector />
      </div>

      <ContactMethods />

      {adminPanelUrl && <AdminPanelButton adminPanelUrl={adminPanelUrl} />}

      <LogoutButton onLogout={onLogout} />
    </>
  );
}
