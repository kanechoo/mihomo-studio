import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { CancelButton, PrimaryButton } from './DialogButtons';

// The replacement for `window.confirm`. The native one is painted by the
// browser chrome rather than by the page, so it turns up in the system font
// with system buttons and no notion that the app has a theme — the same reason
// a native `<select>` had to go. It also names the site ("localhost:5173 says")
// above the question, which is a strange thing to read in an app you opened
// deliberately.
//
// Everything destructive in the editor asks through this, so the question
// always looks the same, sits in the same place, and is dismissed the same way.
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  // Defaults to a generic Confirm. The delete sites pass their own verb so the
  // button says what it is about to do, rather than making you re-read the
  // sentence above it to find out what you are agreeing to.
  confirmLabel?: string;
  cancelLabel?: string;
  // Paints the confirm button red. Everything that uses this today is
  // destructive; the flag exists so that stays a decision rather than an
  // assumption baked into the component.
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Whatever had focus when the dialog opened — normally the trash button that
  // asked the question.
  const opener = useRef<HTMLElement | null>(null);

  // Focus lands on Cancel, never on the destructive button. A confirmation that
  // opens with Delete focused turns a stray Enter into a deletion — and Enter
  // is exactly what is under the finger of someone who just confirmed the last
  // dialog. Escape and a backdrop click already cancel; this makes the keyboard
  // agree with them.
  //
  // On the way out focus goes back where it came from, so cancelling leaves you
  // on the button you pressed rather than on the document body, from which the
  // next Tab would start again at the top of the page. After a confirmed delete
  // that button has usually gone with its row, hence the check.
  useEffect(() => {
    if (!isOpen) return;
    opener.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      const previous = opener.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      widthClass="max-w-md"
      footer={
        <>
          <CancelButton ref={cancelRef} onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </CancelButton>
          <PrimaryButton onClick={onConfirm} destructive={destructive}>
            {confirmLabel ?? t('common.confirm')}
          </PrimaryButton>
        </>
      }
    >
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
    </Modal>
  );
}
