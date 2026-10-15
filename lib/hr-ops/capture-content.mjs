import { decodeEntities } from '../../providers/_html-entities.mjs';
import { htmlToVisibleText } from '../../providers/_html-to-text.mjs';
import { url, assert } from './model.mjs';

export function captureContent(raw, source, format = 'auto') {
  assert(['auto','text','json'].includes(format), 'capture format must be auto, text or json');
  let json = format === 'json';
  if (format === 'auto' && /^[\s\uFEFF]*[\[{]/.test(raw)) {
    try { JSON.parse(raw.replace(/^\uFEFF/, '')); json = true; } catch { /* text remains text */ }
  }
  if (json) {
    JSON.parse(raw.replace(/^\uFEFF/, ''));
    return {content: raw.replace(/^\uFEFF/, ''), content_format:'json', links:[], links_truncated:false};
  }
  const links = [], seen = new Set();
  const html = raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  let truncated = false;
  for (const match of html.matchAll(/<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const attr = match[1].match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!attr) continue;
    const href = decodeEntities(attr[1] ?? attr[2] ?? attr[3]).trim();
    if (!href || href.startsWith('#')) continue;
    try {
      const target = new URL(href, source); target.hash = '';
      const resolved = url(target.href);
      if (seen.has(resolved)) continue;
      if (links.length === 200) { truncated = true; break; }
      const labelWindow=html.slice(match.index+match[0].length,match.index+match[0].length+4096);
      const end=labelWindow.search(/<\/a\s*>/i);
      seen.add(resolved); links.push({url:resolved, text:end<0?'':htmlToVisibleText(labelWindow.slice(0,end), 300)});
    } catch { /* non-public, credentialed and non-HTTP links are not research targets */ }
  }
  return {content:htmlToVisibleText(raw, 2_000_000),content_format:'text',links,links_truncated:truncated};
}

export function captureFailure(error, source) {
  if (error.status >= 300 && error.status < 400) {
    let destination = 'unavailable or unsafe';
    try {
      if (typeof error.location === 'string' && error.location.trim())
        destination = url(new URL(error.location.trim(), source).href);
    } catch { /* do not expose credentialed URLs */ }
    return new Error(`Redirect ${error.status} not followed. Destination: ${destination}. Verify it and reserve a separate request.`);
  }
  const code = error.cause?.code ?? error.code;
  if (['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code))
    return new Error(`Capture failed (${code}); attempt counted. Verify source availability before retrying.`);
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT')
    return new Error('Capture timed out; attempt counted.');
  return error;
}
