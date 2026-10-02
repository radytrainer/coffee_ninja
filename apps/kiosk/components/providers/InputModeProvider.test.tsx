import { describe, expect, it } from 'vitest';
import { isLocalKioskHost } from './InputModeProvider';

describe('kiosk input mode safety', () => {
  it('keeps gesture mode on the local kiosk machine but forces mouse mode on Cloudflare tunnels', () => {
    expect(isLocalKioskHost('localhost')).toBe(true);
    expect(isLocalKioskHost('127.0.0.1')).toBe(true);
    expect(isLocalKioskHost('[::1]')).toBe(true);
    expect(isLocalKioskHost('slides-mon-summaries-cycle.trycloudflare.com')).toBe(false);
  });
});
