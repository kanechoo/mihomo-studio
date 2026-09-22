import type { ReactNode } from 'react';

// The switch. Lifted out of BooleanField, which is schema-driven and cannot be
// reused outside a form — this is the same control with the label removed, so a
// toggle in a modal looks like every toggle in the form panes rather than like a
// second opinion about what a switch is.
//
// A real checkbox does the work, visually hidden: it brings keyboard focus,
// space to toggle, and the checked state that the track and knob are drawn from,
// none of which a styled <div> with an onClick would have.
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  // Given when the toggle has no <label> pointing at it — a screen reader
  // otherwise reaches a checkbox with nothing to announce.
  label?: ReactNode;
  'aria-label'?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  id,
  label,
  'aria-label': ariaLabel,
}: ToggleProps) {
  return (
    <label
      className={`relative inline-flex items-center gap-2 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div
        className="relative w-11 h-6 rounded-full peer peer-checked:after:translate-x-full
                   after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                   after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
        style={{
          backgroundColor: checked ? 'var(--accent)' : 'var(--border-color)',
        }}
      />
      {label}
    </label>
  );
}
