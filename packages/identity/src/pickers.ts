/**
 * Host-facing building blocks: the directory lookups the widget does
 * internally, plus the two pickers built on them.
 */
export { MemberPicker } from "./components/pickers/MemberPicker.js";
export type { MemberPickerProps } from "./components/pickers/MemberPicker.js";
export { TeamPicker } from "./components/pickers/TeamPicker.js";
export type { TeamPickerProps } from "./components/pickers/TeamPicker.js";
export { useIdentityDirectory } from "./hooks/use-identity-directory.js";
export type {
  DirectoryMember,
  IdentityDirectory,
  UseIdentityDirectoryOptions,
} from "./hooks/use-identity-directory.js";
