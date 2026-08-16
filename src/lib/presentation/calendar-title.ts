const PEDESENTNICA = /педесетници/giu;

export function presentCalendarTitle(title: string): string {
  const locale = "sr-Cyrl";
  const lowercase = title.toLocaleLowerCase(locale);
  if (title !== title.toLocaleUpperCase(locale) || title === lowercase) return title;

  return lowercase
    .replace(/^(\s*)(\p{L})/u, (_match, spacing, letter) => `${spacing}${letter.toLocaleUpperCase(locale)}`)
    .replace(PEDESENTNICA, "Педесетници");
}
