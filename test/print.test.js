import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setDocumentKind } from '../src/document-type.js';
import { printFormattedDocument } from '../src/print.js';

describe('print', () => {
  /** @type {ReturnType<typeof vi.spyOn> | undefined} */
  let printSpy;

  beforeEach(() => {
    setDocumentKind('markdown');
    document.body.innerHTML = `
      <div id="preview" class="preview"><h1>Hello</h1><p>World</p></div>
      <iframe id="pdf-viewer"></iframe>
    `;
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    printSpy?.mockRestore();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.body.classList.remove('printing-markdown', 'printing-pdf');
    delete window.__TAURI__;
  });

  it('prints markdown via the main window', async () => {
    await printFormattedDocument(document);
    expect(printSpy).toHaveBeenCalledOnce();
    expect(document.body.classList.contains('printing-markdown')).toBe(true);
  });

  it('calls refreshPreview before printing', async () => {
    const refresh = vi.fn();
    await printFormattedDocument(document, { refreshPreview: refresh });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('uses Tauri print_webview when available', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    window.__TAURI__ = { core: { invoke } };

    await printFormattedDocument(document);

    expect(invoke).toHaveBeenCalledWith('print_webview');
    expect(printSpy).not.toHaveBeenCalled();
    expect(document.body.classList.contains('printing-markdown')).toBe(true);
  });

  it('prints PDF via iframe when not in Tauri', async () => {
    setDocumentKind('pdf');
    const pdfFrame = document.getElementById('pdf-viewer');
    const pdfPrint = vi.fn();
    Object.defineProperty(pdfFrame, 'contentWindow', {
      value: { focus: vi.fn(), print: pdfPrint },
      configurable: true,
    });

    await printFormattedDocument(document);
    expect(pdfPrint).toHaveBeenCalledOnce();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('prints PDF via main window in Tauri', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    window.__TAURI__ = { core: { invoke } };
    setDocumentKind('pdf');
    const pdfFrame = document.getElementById('pdf-viewer');
    const pdfPrint = vi.fn();
    Object.defineProperty(pdfFrame, 'contentWindow', {
      value: { focus: vi.fn(), print: pdfPrint },
      configurable: true,
    });

    await printFormattedDocument(document);
    expect(pdfPrint).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('print_webview');
    expect(document.body.classList.contains('printing-pdf')).toBe(true);
  });
});
