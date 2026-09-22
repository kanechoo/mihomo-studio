import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// What the user picked. `system` is a preference, not a colour.
export type ThemePreference = 'light' | 'dark' | 'system';
// What is actually on screen. `system` has already been answered here.
export type ResolvedTheme = 'light' | 'dark';

export type Language = 'en' | 'zh';

export const UI_STORAGE_KEY = 'mihomo-ui-storage';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

// The `dark` class on <html> is what the CSS custom properties key off, so it
// is written from the resolved theme every time rather than being nudged in
// one direction. The previous version only ever *added* the class, and only
// when localStorage already held a value — so a first visit rendered light
// while the store said dark, and the first click "switched" to the theme
// already on screen and appeared to do nothing.
function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

interface UIStore {
  theme: ThemePreference;
  // Derived from `theme` plus the OS setting. Anything that renders a colour
  // reads this; only the theme picker itself reads `theme`.
  resolvedTheme: ResolvedTheme;
  language: Language;
  activeTab: string;
  collapsedCards: Set<string>;
  exportFormat: 'mihomo' | 'singbox';
  // Whether Import Subscription fetches through the Go server rather than from
  // the browser. Off by default: the browser path needs no account and works
  // with any provider that sends CORS headers, which most do. Remembered because
  // someone who needs the server path needs it every time.
  subscriptionFetchViaServer: boolean;

  // Theme actions
  setTheme: (theme: ThemePreference) => void;

  // Language actions
  setLanguage: (language: Language) => void;

  // Tab actions
  setActiveTab: (tab: string) => void;

  // Card collapse actions
  toggleCardCollapse: (cardId: string) => void;
  isCardCollapsed: (cardId: string) => boolean;

  // Export format actions
  setExportFormat: (format: 'mihomo' | 'singbox') => void;

  // Subscription fetch actions
  setSubscriptionFetchViaServer: (viaServer: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'light',
      language: 'zh',
      activeTab: 'general',
      collapsedCards: new Set<string>(),
      exportFormat: 'mihomo',
      subscriptionFetchViaServer: false,

      setTheme: (theme) => {
        const resolvedTheme = resolveTheme(theme);
        set({ theme, resolvedTheme });
        applyTheme(resolvedTheme);
      },

      setLanguage: (language) => set({ language }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      toggleCardCollapse: (cardId) =>
        set((state) => {
          const newCollapsed = new Set(state.collapsedCards);
          if (newCollapsed.has(cardId)) {
            newCollapsed.delete(cardId);
          } else {
            newCollapsed.add(cardId);
          }
          return { collapsedCards: newCollapsed };
        }),

      isCardCollapsed: (cardId) => get().collapsedCards.has(cardId),

      setExportFormat: (format) => set({ exportFormat: format }),

      setSubscriptionFetchViaServer: (viaServer) =>
        set({ subscriptionFetchViaServer: viaServer }),
    }),
    {
      name: UI_STORAGE_KEY,
      version: 1,
      // Custom serialization for Set. `resolvedTheme` is deliberately absent:
      // it depends on the OS setting at load time, not on what was saved.
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        activeTab: state.activeTab,
        collapsedCards: Array.from(state.collapsedCards),
        exportFormat: state.exportFormat,
        subscriptionFetchViaServer: state.subscriptionFetchViaServer,
      }),
      // Custom deserialization for Set
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        collapsedCards: new Set(persistedState.collapsedCards || []),
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  // persist rehydrates synchronously from localStorage, so by this line the
  // stored preference is already in state. Re-running it through setTheme is
  // what puts the class on <html> — including on a first visit, where there
  // is nothing stored and the default applies.
  useUIStore.getState().setTheme(useUIStore.getState().theme);

  // `system` has to keep tracking the OS while the tab is open: a scheduled
  // night shift or a manual OS switch both fire this.
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    const { theme, setTheme } = useUIStore.getState();
    if (theme === 'system') setTheme('system');
  });
}
