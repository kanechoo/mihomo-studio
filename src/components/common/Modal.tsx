import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import * as anim from '../../animation/tokens';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  // Tailwind max-w-* class. Wider for the config list, narrower for a prompt.
  widthClass?: string;
}

// The shell every dialog in the cloud panel shares: backdrop, header with a
// close button, scrollable body, optional footer.
//
// Escape and a backdrop click both close. Neither is decoration — a dialog that
// can only be dismissed by finding a small × is the kind of thing people escape
// by reloading the page, and in this app a reload is cheap only because the
// editor persists its document.
export function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  widthClass = 'max-w-2xl',
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Deliberately no `if (!isOpen) return null` here. AnimatePresence can only
  // play an exit animation for a child it still owns, so the closed case has to
  // be expressed as "no child inside AnimatePresence" rather than as an early
  // return that unmounts this component's whole tree at once.
  //
  // Out to the body, the same way Select sends its menu. A dialog is not layout:
  // wherever it is mounted, a spacing utility on its parent (`space-y-4` gives
  // every non-first child margin-top) or an ancestor transform would offset and
  // shrink the `fixed inset-0` backdrop, leaving a strip of page uncovered at
  // the top of the window.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          variants={anim.backdrop}
          initial="hidden"
          animate="visible"
          exit="exit"
          // Only a click that both starts and ends on the backdrop closes.
          // Without the target check, releasing the mouse outside after
          // selecting text inside the dialog would dismiss it and lose what was
          // being typed.
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`w-full ${widthClass} max-h-full flex flex-col rounded-lg shadow-xl border`}
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
            variants={anim.dialog}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                {icon}
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
              <motion.button
                type="button"
                onClick={onClose}
                className="p-1 rounded"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Close"
                whileHover={{ opacity: 0.6, scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
              >
                <X size={18} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <div
                className="flex items-center justify-end gap-3 px-5 py-4 border-t shrink-0"
                style={{ borderColor: 'var(--border-color)' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
