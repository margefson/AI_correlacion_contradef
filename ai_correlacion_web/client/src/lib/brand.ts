/** Nome comercial e identificação no browser (aba, título, sidebar). */
export const APP_NAME = "Contradef Insight";
export const APP_NAME_SHORT = "Insight";
export const APP_TITLE_SUFFIX = "· Redução e análise de logs";
/** Título completo sugerido para <title> (aba). */
export function appDocumentTitle(pageLabel?: string) {
  if (pageLabel?.trim()) {
    return `${pageLabel.trim()} | ${APP_NAME}`;
  }
  return `${APP_NAME} ${APP_TITLE_SUFFIX}`;
}
