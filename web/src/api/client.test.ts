import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, whatsappLink } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('api client offline behaviour', () => {
  it('returns null when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await api.structureIncident('x', 'hi')).toBeNull();
    expect(await api.summary({}, 'hi', 'operator')).toBeNull();
    expect(await api.syncIncidents([])).toBeNull();
    expect(await api.health()).toBe(false);
  });

  it('returns null on a server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 503 })));
    expect(await api.tts('hello', 'hi')).toBeNull();
    expect(await api.lessonFromIncident({} as never, 'hi')).toBeNull();
  });

  it('posts JSON to /api and returns the body', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ type: 'proximity', severity: 'high', description: 'd' }));
    vi.stubGlobal('fetch', fetch);
    expect(await api.structureIncident('aadmi peeche', 'hi')).toEqual({ type: 'proximity', severity: 'high', description: 'd' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/llm/incident');
    expect(JSON.parse(init.body)).toEqual({ text: 'aadmi peeche', lang: 'hi' });
  });
});

describe('whatsappLink', () => {
  it('strips non-digits from the phone and encodes the text', () => {
    expect(whatsappLink('+91 98450-12345', 'Idle ₹315 & 1 alert')).toBe(
      `https://wa.me/919845012345?text=${encodeURIComponent('Idle ₹315 & 1 alert')}`,
    );
  });
});
