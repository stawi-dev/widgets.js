import { useId, type ReactNode } from "react";

interface FieldProps {
  label: string;
  required?: boolean;
  /** Validation message shown under the control. */
  error?: string;
  /** Receives the id and error-describedby wiring for the control. */
  children: (props: {
    id: string;
    required: boolean;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}

/** Label + control + inline validation message. */
export function Field({
  label,
  required = false,
  error,
  children,
}: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="aiw-field">
      <label className="aiw-field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="aiw-field-required" aria-hidden="true">
            {" *"}
          </span>
        )}
      </label>
      {children({
        id,
        required,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <span className="aiw-field-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
