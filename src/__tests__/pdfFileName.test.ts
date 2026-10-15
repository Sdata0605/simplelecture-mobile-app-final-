/**
 * Tests for sanitizePdfBaseName (mobile/src/utils/pdfFileName.ts).
 *
 * The result is a base file name WITHOUT the .pdf extension — Android SAF
 * appends the extension from the MIME type.
 */
import { sanitizePdfBaseName } from '../utils/pdfFileName';

describe('sanitizePdfBaseName', () => {
  it('appends "Notes" to a clean topic title', () => {
    expect(sanitizePdfBaseName('Chemical Reactions and Equations')).toBe(
      'Chemical Reactions and Equations Notes',
    );
  });

  it('does not double the Notes suffix', () => {
    expect(sanitizePdfBaseName('Study Notes')).toBe('Study Notes');
    expect(sanitizePdfBaseName('Chapter notes')).toBe('Chapter notes');
  });

  it('strips characters invalid in file names', () => {
    expect(sanitizePdfBaseName('Acids/Bases: "Salts"?')).toBe('Acids Bases Salts Notes');
  });

  it('collapses repeated whitespace', () => {
    expect(sanitizePdfBaseName('  Light   Reflection \n Refraction ')).toBe(
      'Light Reflection Refraction Notes',
    );
  });

  it('strips leading/trailing dots', () => {
    expect(sanitizePdfBaseName('..Electricity..')).toBe('Electricity Notes');
  });

  it('falls back to "Study Notes" for empty or symbol-only input', () => {
    expect(sanitizePdfBaseName('')).toBe('Study Notes');
    expect(sanitizePdfBaseName(null)).toBe('Study Notes');
    expect(sanitizePdfBaseName(undefined)).toBe('Study Notes');
    expect(sanitizePdfBaseName('///???***')).toBe('Study Notes');
  });

  it('caps very long titles', () => {
    const long = 'A'.repeat(300);
    const result = sanitizePdfBaseName(long);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.startsWith('AAA')).toBe(true);
  });

  it('never produces an embedded .pdf extension', () => {
    expect(sanitizePdfBaseName('My Topic.pdf')).toBe('My Topic pdf Notes');
  });
});
