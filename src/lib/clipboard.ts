const BLOCK_TAGS = new Set([
  'article',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'ol',
  'p',
  'section',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tfoot',
  'tr',
  'ul',
]);

function normalizeClipboardText(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripOuterBlankLines(value: string) {
  return value.replace(/^[\r\n]+|[\r\n]+$/g, '');
}

function renderClipboardHtmlNode(node: Node, listDepth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u00a0/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
    return '';
  }

  if (tagName === 'br') {
    return '\n';
  }

  const childDepth = tagName === 'ol' || tagName === 'ul' ? listDepth + 1 : listDepth;

  if (tagName === 'li') {
    const parent = element.parentElement;
    const isOrdered = parent?.tagName.toLowerCase() === 'ol';
    const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === 'li') : [];
    const itemNumber = siblings.findIndex((child) => child === element) + 1;
    const prefix = isOrdered ? `${itemNumber}. ` : '• ';
    const indent = '  '.repeat(Math.max(listDepth - 1, 0));
    const content = renderClipboardHtmlChildren(element, childDepth);
    const cleaned = stripOuterBlankLines(content)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n');

    return `${indent}${prefix}${cleaned}\n`;
  }

  const content = renderClipboardHtmlChildren(element, childDepth);
  if (BLOCK_TAGS.has(tagName)) {
    const cleaned = stripOuterBlankLines(content)
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n');

    return cleaned ? `${cleaned}\n` : '\n';
  }

  return content;
}

function renderClipboardHtmlChildren(parent: ParentNode, listDepth = 0) {
  return Array.from(parent.childNodes)
    .map((child) => renderClipboardHtmlNode(child, listDepth))
    .join('');
}

function htmlToStructuredText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rendered = renderClipboardHtmlChildren(doc.body);
  return normalizeClipboardText(rendered);
}

export function extractClipboardText(clipboardData: DataTransfer) {
  const html = clipboardData.getData('text/html');
  if (html.trim()) {
    return htmlToStructuredText(html);
  }

  return normalizeClipboardText(clipboardData.getData('text/plain'));
}
