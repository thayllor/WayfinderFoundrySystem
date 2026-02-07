/**
 * Utilities for manipulating selection and applying inline styles in the editor.
 */
export function saveSelection() {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) return sel.getRangeAt(0).cloneRange();
  } catch (e) {}
  return null;
}

export function restoreSelection(range) {
  try {
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {}
}

export function applyForeColor(color) {
  try {
    document.execCommand('foreColor', false, color);
    return;
  } catch (e) {}
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.style.color = color;
  try { range.surroundContents(span); }
  catch (err) { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); }
  // Force wrapper to inherit app font and remove conflicting inline styles on descendants
  try {
    try { span.style.setProperty('font-family', 'inherit', 'important'); } catch (e) { span.style.fontFamily = 'inherit'; }
    const descendants = span.querySelectorAll('*');
    for (let d of Array.from(descendants)) {
      try {
        // If it's a <font> tag, replace with a <span> to avoid legacy attributes interfering
        if (d.tagName === 'FONT') {
          const replacement = document.createElement('span');
          // Move children
          while (d.firstChild) replacement.appendChild(d.firstChild);
          d.parentNode.replaceChild(replacement, d);
          d = replacement;
        }
        // Remove problematic attributes that affect font rendering
        try { d.removeAttribute('face'); } catch (e) {}
        try { d.removeAttribute('size'); } catch (e) {}
        // Remove inline font-related styles
        try {
          d.style.removeProperty('font-size');
          d.style.removeProperty('line-height');
          d.style.removeProperty('font-family');
          d.style.removeProperty('font');
        } catch (e) {}
        // If the element still has a style attribute but it's empty, remove it
        try {
          const s = d.getAttribute('style');
          if (s !== null && s.trim() === '') d.removeAttribute('style');
        } catch (e) {}
      } catch (e) {}
    }
  } catch (e) {}
}

export function applyBackgroundColor(color) {
  try {
    document.execCommand('hiliteColor', false, color);
    return;
  } catch (e) {}
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.style.backgroundColor = color;
  try { range.surroundContents(span); }
  catch (err) { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); }
}

export function applyFontSizeToSelection(sizePx) {
  if (!sizePx) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  // Set font-size with high priority to override copied or stylesheet rules
  try {
    span.style.setProperty('font-size', `${sizePx}px`, 'important');
    // Normalize line-height so increased size displays correctly
    span.style.setProperty('line-height', 'normal', 'important');
  } catch (e) {
    span.style.fontSize = `${sizePx}px`;
    span.style.lineHeight = 'normal';
  }
  try { range.surroundContents(span); }
  catch (err) { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); }
}

export function createColorPicker(onInput) {
  const input = document.createElement('input');
  input.type = 'color';
  input.style.position = 'absolute';
  input.style.opacity = '0';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.pointerEvents = 'none';
  input.addEventListener('input', (e) => { try { onInput && onInput(e.target.value); } catch (er) {} });
  input.addEventListener('blur', () => { setTimeout(() => input.remove(), 100); });
  document.body.appendChild(input);
  input.click();
  return input;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Handle paste by inserting plain text (strip styles).
 * Preserves line breaks by inserting <p> blocks.
 */
export function pastePlain(ev) {
  try {
    ev.preventDefault();
    const clipboard = ev.clipboardData || window.clipboardData;
    let text = '';
    if (clipboard) text = clipboard.getData('text/plain') || '';
    if (!text) {
      // Fallback: try to extract text from HTML
      const html = clipboard ? clipboard.getData('text/html') : '';
      if (html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        text = tmp.innerText || tmp.textContent || '';
      }
    }
    if (!text) return;

    // Normalize Windows CRLF to LF and split paragraphs
    const paragraphs = text.replace(/\r\n/g, '\n').split(/\n+/);
    const html = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');

    try {
      document.execCommand('insertHTML', false, html);
    } catch (e) {
      try {
        document.execCommand('insertText', false, text);
      } catch (e2) {
        // Fallback: insert using Range API
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const frag = document.createDocumentFragment();
        for (const p of paragraphs) {
          const pNode = document.createElement('p');
          pNode.textContent = p;
          frag.appendChild(pNode);
        }
        range.insertNode(frag);
      }
    }
  } catch (e) {
    // swallow
  }
}
