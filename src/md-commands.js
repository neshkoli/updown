/**
 * Markdown formatting commands for the editor textarea.
 * Each command operates on the current selection (or inserts at cursor).
 */

/**
 * Wrap selected text with a prefix and suffix, or insert placeholder.
 * @param {HTMLTextAreaElement} editor
 * @param {string} prefix
 * @param {string} suffix
 * @param {string} placeholder - text to insert if nothing is selected
 */
function wrapSelection(editor, prefix, suffix, placeholder) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;
  const selected = text.slice(start, end);
  const replacement = selected || placeholder;
  const newText = text.slice(0, start) + prefix + replacement + suffix + text.slice(end);

  editor.value = newText;
  // Select the inserted/wrapped text (not the markers)
  editor.selectionStart = start + prefix.length;
  editor.selectionEnd = start + prefix.length + replacement.length;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

/**
 * Insert text at the beginning of the current line.
 * @param {HTMLTextAreaElement} editor
 * @param {string} prefix - text to prepend to the line
 * @param {string} placeholder - text to insert after prefix if line is empty
 */
function prefixLine(editor, prefix, placeholder) {
  const start = editor.selectionStart;
  const text = editor.value;
  // Find start of current line
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', start);
  const actualEnd = lineEnd === -1 ? text.length : lineEnd;
  const lineContent = text.slice(lineStart, actualEnd);

  let newLine;
  if (lineContent.trim() === '') {
    newLine = prefix + placeholder;
  } else {
    newLine = prefix + lineContent;
  }

  const newText = text.slice(0, lineStart) + newLine + text.slice(actualEnd);
  editor.value = newText;
  editor.selectionStart = lineStart + prefix.length;
  editor.selectionEnd = lineStart + newLine.length;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

/**
 * Insert a block of text at the cursor (on its own line).
 * @param {HTMLTextAreaElement} editor
 * @param {string} block - the block text to insert
 */
function insertBlock(editor, block) {
  const start = editor.selectionStart;
  const text = editor.value;

  // Ensure we're on a new line
  let pre = '';
  if (start > 0 && text[start - 1] !== '\n') {
    pre = '\n';
  }
  // Ensure a newline after
  let post = '';
  if (start < text.length && text[start] !== '\n') {
    post = '\n';
  }

  const insertion = pre + block + post;
  const newText = text.slice(0, start) + insertion + text.slice(start);
  editor.value = newText;
  editor.selectionStart = start + insertion.length;
  editor.selectionEnd = start + insertion.length;
  editor.focus();
  editor.dispatchEvent(new Event('input'));
}

/**
 * Execute a markdown command on the editor.
 * @param {HTMLTextAreaElement} editor
 * @param {string} command - one of: bold, italic, heading, link, image,
 *   bulletList, numberedList, quote, codeBlock, hr, table
 */
export function execMdCommand(editor, command) {
  if (!editor) return;

  switch (command) {
    case 'bold':
      wrapSelection(editor, '**', '**', 'bold text');
      break;
    case 'italic':
      wrapSelection(editor, '_', '_', 'italic text');
      break;
    case 'heading1':
      prefixLine(editor, '# ', 'Heading');
      break;
    case 'heading2':
      prefixLine(editor, '## ', 'Heading');
      break;
    case 'heading3':
      prefixLine(editor, '### ', 'Heading');
      break;
    case 'link':
      wrapSelection(editor, '[', '](url)', 'link text');
      break;
    case 'image':
      wrapSelection(editor, '![', '](url)', 'alt text');
      break;
    case 'bulletList':
      prefixLine(editor, '- ', 'List item');
      break;
    case 'numberedList':
      prefixLine(editor, '1. ', 'List item');
      break;
    case 'quote':
      prefixLine(editor, '> ', 'Quote');
      break;
    case 'codeBlock':
      insertBlock(editor, '```\ncode\n```');
      break;
    case 'hr':
      insertBlock(editor, '---');
      break;
    case 'table':
      insertBlock(editor, '| Column 1 | Column 2 |\n| -------- | -------- |\n| Cell     | Cell     |');
      break;
    default:
      break;
  }
}
