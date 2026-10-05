import { createI18n } from "vue-i18n";
import en from "./locales/en";
export const defaultLocale = "en";
export const messages = { en };
export type MessageSchema = typeof en;
/** UI language is independent of the existing `locale` money-format parameter. */
export function resolveLocale(requested?: string | null): string {
  const normalized = (requested || defaultLocale).trim().replaceAll("_", "-").toLowerCase();
  const available = Object.keys(messages);
  return available.find((locale) => locale.toLowerCase() === normalized)
    ?? available.find((locale) => locale.toLowerCase() === normalized.split("-")[0])
    ?? defaultLocale;
}
/** A factory keeps application instances and component tests isolated. */
export function createCheckoutI18n(requested?: string | null) {
  return createI18n({
    legacy: false,
    globalInjection: false,
    locale: resolveLocale(requested),
    fallbackLocale: defaultLocale,
    messages: structuredClone(messages),
  });
}
declare module "vue-i18n" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}
