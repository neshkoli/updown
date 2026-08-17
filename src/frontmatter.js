/**
 * YAML frontmatter extraction from markdown source.
 */

/** Escape HTML special characters for safe insertion. */
export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parse a single YAML scalar value.
 * @param {string} value
 * @returns {string|boolean|number}
 */
function parseYamlScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

/**
 * Parse simple YAML blocks (flat keys + one level of nesting).
 * Used by slide parser in the browser without bundling node_modules.
 * @param {string} yamlText
 * @returns {Record<string, unknown>}
 */
export function parseSimpleYaml(yamlText) {
  if (!yamlText) return {};

  const lines = yamlText.split('\n');
  const result = /** @type {Record<string, unknown>} */ ({});
  let nestedKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const nestedMatch = line.match(/^  ([\w-]+):\s*(.*)$/);
    if (nestedMatch && nestedKey) {
      const [, key, rawVal] = nestedMatch;
      const parent = result[nestedKey];
      const nested = typeof parent === 'object' && parent !== null && !Array.isArray(parent)
        ? parent
        : {};
      nested[key] = parseYamlScalar(rawVal.trim());
      result[nestedKey] = nested;
      continue;
    }

    nestedKey = null;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();

    if (!rawVal) {
      nestedKey = key;
      result[key] = {};
      continue;
    }

    result[key] = parseYamlScalar(rawVal);
  }

  return result;
}

/**
 * Extract YAML frontmatter from markdown source.
 * Returns { metadata: [{key, value}] | null, body: string }.
 * Frontmatter must start on the first line with "---" and end with "---".
 * @param {string} source
 * @returns {{ metadata: Array<{key: string, value: string|boolean}> | null, body: string }}
 */
export function extractFrontmatter(source) {
  if (!source) return { metadata: null, body: source || '' };

  const lines = source.split('\n');
  if (lines.length < 3 || lines[0].trim() !== '---') {
    return { metadata: null, body: source };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex < 2) return { metadata: null, body: source };

  const yamlLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join('\n');

  const metadata = [];
  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (value === 'true') value = true;
      if (value === 'false') value = false;

      if (key) {
        metadata.push({ key, value });
      }
    } else if (trimmed.startsWith('- ') && metadata.length > 0) {
      const item = trimmed.slice(2);
      const last = metadata[metadata.length - 1];
      last.value = last.value ? last.value + ', ' + item : item;
    }
  }

  return { metadata: metadata.length > 0 ? metadata : null, body };
}
