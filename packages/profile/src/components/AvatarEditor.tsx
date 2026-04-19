import { useCallback, useContext, useRef } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useGravatarUrl } from "../hooks/use-gravatar.js";
import { getInitials } from "../utils/get-initials.js";
import { validateAvatar } from "../utils/validate-avatar.js";
import { HooksContext } from "../context/hooks-context.js";

export interface AvatarEditorProps {
  maxAvatarBytes?: number;
  onError?: (err: unknown) => void;
}

export function AvatarEditor({
  maxAvatarBytes = 2 * 1024 * 1024,
  onError,
}: AvatarEditorProps = {}) {
  const { state, uploadAvatar } = useProfile();
  const hooks = useContext(HooksContext);
  const inputRef = useRef<HTMLInputElement>(null);

  const profile = state.profile;
  const gravatarUrl = useGravatarUrl(profile?.email, 112);

  const handleClick = useCallback(() => inputRef.current?.click(), []);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await validateAvatar(file, { maxBytes: maxAvatarBytes });
        await uploadAvatar(file);
      } catch (err) {
        // Prefer explicit prop if given, else fall through to hooks context.
        (onError ?? hooks.onError)?.(err);
      }
    },
    [uploadAvatar, maxAvatarBytes, onError, hooks],
  );

  if (!profile) return null;

  const avatarSrc = profile.picture || gravatarUrl;

  return (
    <>
      <div
        className="aiw-avatar-large"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Change avatar"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt={profile.name} />
        ) : (
          <span className="aiw-avatar-initials">
            {getInitials(profile.name)}
          </span>
        )}
        <div className="aiw-avatar-overlay">Edit</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="aiw-hidden-input"
        onChange={handleChange}
        tabIndex={-1}
      />
    </>
  );
}
