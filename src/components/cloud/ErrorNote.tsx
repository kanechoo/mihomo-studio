import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';
import type { ErrorText } from '../../store/errorText';

// How many config problems the note spells out before summarising the rest.
const MAX_PROBLEMS = 6;

// Renders what a store hands back from errorTextFor: a translated line, and
// where there is one, the server's own sentence underneath it.
//
// The detail is kept visually separate rather than concatenated because it is
// English regardless of the interface language, and running the two together
// would read as a single half-translated sentence.
export function ErrorNote({ error }: { error: ErrorText | null }) {
  const { t } = useTranslation();

  return (
    // Height rather than opacity alone. An error note appears above content the
    // user is already looking at and shoves all of it down; fading in while the
    // page jumps underneath is how you lose your place in a form. Growing the
    // box moves that content at the same speed the note arrives.
    //
    // initial={false} so a note that is present on first render — an editor
    // opened on a config that failed to load — is simply there, rather than
    // animating in as if it had just happened.
    <AnimatePresence initial={false}>
      {error && (
        <motion.div
          key="error"
          className="overflow-hidden"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
        >
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}
            role="alert"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p>{t(error.key)}</p>
              {error.detail && (
                <p className="mt-1 break-words opacity-80 font-mono text-xs">{error.detail}</p>
              )}
              {/* Capped, because one deleted proxy group can be named by
                  thirty rules and a list that long is not read, it is
                  dismissed. The count keeps the message honest about that. */}
              {error.problems && error.problems.length > 0 && (
                <ul className="mt-1 space-y-0.5 list-disc list-outside pl-4">
                  {error.problems.slice(0, MAX_PROBLEMS).map((problem, index) => (
                    <li key={index} className="break-words">
                      {t(problem.key, problem.params)}
                    </li>
                  ))}
                  {error.problems.length > MAX_PROBLEMS && (
                    <li className="list-none -ml-4 opacity-80">
                      {t('validation.more', { count: error.problems.length - MAX_PROBLEMS })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
