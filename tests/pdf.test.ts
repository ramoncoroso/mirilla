import { describe, expect, it } from 'vitest';
import { decodePdf, isPdf, MAX_PDF_BYTES, PdfTooLargeError } from '@/lib/pdf';

describe('PDF', () => {
  it('reconoce un PDF por su tipo o por su nombre', () => {
    expect(isPdf(new File([], 'factura.PDF'))).toBe(true);
    expect(isPdf(new Blob([], { type: 'application/pdf' }))).toBe(true);
    expect(isPdf(new File([], 'foto.png', { type: 'image/png' }))).toBe(false);
  });

  it('rechaza un PDF de más de 50 MB sin abrirlo', async () => {
    const big = new Blob([new Uint8Array(MAX_PDF_BYTES + 1)], { type: 'application/pdf' });
    await expect(decodePdf(big)).rejects.toBeInstanceOf(PdfTooLargeError);
  });
});
