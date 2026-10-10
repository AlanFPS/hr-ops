// Link destinations are references, not numerical assertions. Markdown labels
// remain prose. Strip only parseable HTTP(S) URLs, not arbitrary digit strings.
export function claimProse(text) {
  return text.replace(/https?:\/\/[^\s<>"\]\)]+/gi, token => {
    try {
      const parsed = new URL(token);
      return parsed.hostname ? ' ' : token;
    } catch { return token; }
  });
}
export function proseNumbers(text) {
  return claimProse(text).match(/\b\d+(?:[.,]\d+)*\b/g) ?? [];
}
