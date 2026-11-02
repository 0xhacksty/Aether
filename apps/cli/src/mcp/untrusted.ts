export function wrapUntrustedPageText(text: string): string {
  return `<page untrusted>\n${text}\n</page untrusted>`;
}
