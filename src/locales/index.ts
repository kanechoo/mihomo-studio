import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import zh from './zh.json';
import { useUIStore } from '../store/uiStore';

// The chosen language is persisted in the UI store, so it has to seed i18next
// too. Hardcoding one here would render Chinese after a reload while the
// switcher — reading the same store — showed English.
const initialLanguage = useUIStore.getState().language;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Keeps <html lang> honest for screen readers and hyphenation; index.html can
// only guess at markup time.
const syncDocumentLanguage = (language: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }
};

syncDocumentLanguage(initialLanguage);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
