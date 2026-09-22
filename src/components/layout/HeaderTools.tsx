import { CloudBar } from '../cloud/CloudBar';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { ThemeSwitcher } from '../common/ThemeSwitcher';

// The header's right-hand cluster, shared by every page that has a header:
// account (sign in / who is signed in), then the two display switchers.
//
// It exists because the server editor needs exactly what AppLayout has here —
// and copying the four nodes into a second header would be how the two copies
// start drifting apart again. The cluster is presentation only: it reads no
// route, holds no state, and takes no props, so any header can drop it in.
export function HeaderTools() {
  return (
    <>
      {/* Sign-in and the account menu. Before the display switchers because
          they are about the account rather than about how it is shown. */}
      <CloudBar />
      <div
        className="w-px h-6"
        style={{ backgroundColor: 'var(--border-color)' }}
        aria-hidden="true"
      />
      <LanguageSwitcher />
      <ThemeSwitcher />
    </>
  );
}
