/* Separate catalog/preference keys prevent scans from overwriting user choices. */
globalThis.PF = (() => {
  const api = globalThis.browser || globalThis.chrome;
  const cleanLabel = value => {
    if (typeof value !== 'string') return '';
    return value
      .replace(/\s*\d+\s*\/\s*\d+\s*$/, '') // strip trailing 3/3, 19/52, etc.
      .replace(/\s*[•·]\s*\d+\s*$/, '') // strip trailing • 3 or · 3
      .replace(/\s*\(\s*\d+\s*(?:\/\s*\d+)?\s*\)\s*$/, '') // strip trailing (3) or (3/3)
      .trim()
      .replace(/\s+/g, ' ');
  };
  const normalize = value => cleanLabel(value).toLowerCase();
  const key = (host, group, field = null) => 'pf1:' + JSON.stringify([
    host, normalize(group), field === null ? null : normalize(field)
  ]);
  const supported = url => {
    try { const u = new URL(url); return u.protocol === 'https:' &&
      (u.hostname === 'pipedrive.com' || u.hostname.endsWith('.pipedrive.com')); }
    catch { return false; }
  };
  return { api, cleanLabel, normalize, key, supported };
})();
