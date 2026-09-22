import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconMenu } from './IconMenu';
import { useUIStore, type Language } from '../../store/uiStore';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);

  const handleSelect = (next: Language) => {
    setLanguage(next);
    i18n.changeLanguage(next);
  };

  return (
    <IconMenu<Language>
      icon={<Languages size={20} />}
      label={t('language.label')}
      value={language}
      onSelect={handleSelect}
      // Each language is named in itself, not in the active locale — someone
      // who lands on the wrong one still has to be able to read their way out.
      options={[
        { value: 'zh', label: t('language.zh') },
        { value: 'en', label: t('language.en') },
      ]}
    />
  );
}
