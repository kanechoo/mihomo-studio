import type { ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconMenu } from './IconMenu';
import { useUIStore, type ThemePreference } from '../../store/uiStore';

const TRIGGER_ICONS: Record<ThemePreference, ReactNode> = {
  light: <Sun size={20} />,
  dark: <Moon size={20} />,
  system: <Monitor size={20} />,
};

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  return (
    <IconMenu<ThemePreference>
      // The trigger shows the preference rather than the resolved theme: with
      // `system` picked, a monitor is the honest answer even though the page
      // is currently one colour or the other.
      icon={TRIGGER_ICONS[theme]}
      // The trigger icon is one of three, so picking a different theme should
      // visibly exchange it for another rather than substitute it between
      // frames.
      iconKey={theme}
      label={t('theme.toggle')}
      value={theme}
      onSelect={setTheme}
      options={[
        { value: 'light', label: t('theme.light'), icon: <Sun size={16} /> },
        { value: 'dark', label: t('theme.dark'), icon: <Moon size={16} /> },
        { value: 'system', label: t('theme.system'), icon: <Monitor size={16} /> },
      ]}
    />
  );
}
