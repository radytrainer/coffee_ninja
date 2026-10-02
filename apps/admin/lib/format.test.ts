import { describe, expect, it } from 'vitest';
import { ApiError, assetUrl } from './api';
import { money, shortDate, toCsv } from './format';
import { errorMessage } from './hooks';

describe('money', () => {
  it('formats in the shop currency', () => {
    expect(money(4.4)).toBe('$4.40');
    expect(money(12000, 'KHR')).toMatch(/KHR|៛/);
  });
});

describe('shortDate', () => {
  it('shows day and month, and passes through invalid input', () => {
    expect(shortDate('2026-09-24')).toBe('24 Sept');
    expect(shortDate('not-a-date')).toBe('not-a-date');
  });
});

describe('toCsv', () => {
  it('writes a header row and escapes commas, quotes and newlines', () => {
    const csv = toCsv([
      { product: 'Latte', quantity: 3, note: null },
      { product: 'Cake, "chocolate"', quantity: 1, note: 'line1\nline2' },
    ]);
    expect(csv).toBe('product,quantity,note\nLatte,3,\n"Cake, ""chocolate""",1,"line1\nline2"');
  });

  it('is empty for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('assetUrl', () => {
  it('prefixes API paths and keeps absolute URLs', () => {
    expect(assetUrl('/static/products/latte.svg')).toMatch(
      /^http:\/\/.+\/static\/products\/latte\.svg$/,
    );
    expect(assetUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
    expect(assetUrl(null)).toBeNull();
  });
});

describe('errorMessage', () => {
  it('shows the readable validation message, not the field path', () => {
    const err = new ApiError('taxRate: Tax rate must be at most 50%', 'VALIDATION_ERROR', 400, [
      { path: 'taxRate', message: 'Tax rate must be at most 50%' },
    ]);
    expect(errorMessage(err)).toBe('Tax rate must be at most 50%');
  });

  it('falls back to the error message, or a generic one', () => {
    expect(errorMessage(new ApiError('Session expired', 'UNAUTHORIZED', 401))).toBe(
      'Session expired',
    );
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong');
  });
});
