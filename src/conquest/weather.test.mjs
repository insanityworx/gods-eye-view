import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWeather } from './weather.js';
const now = Date.parse('2026-11-03T09:00:00Z');
const valid = {
  status: 'ready',
  weather: { windKph: 34, observedAt: '2026-11-03T08:45:00Z' },
};
const fetcher =
  (payload, ok = true) =>
  async () => ({ ok, json: async () => payload });
test('captures validated current conditions through the existing provider route', async () => {
  const result = await captureWeather({
    now,
    fetcher: async (url) => {
      assert.equal(url, '/api/weather-effects?latitude=51&longitude=0');
      return { ok: true, json: async () => valid };
    },
  });
  assert.equal(result.source, 'Open-Meteo');
  assert.equal(result.windKph, 34);
  assert.equal(result.observedAt, '2026-11-03T08:45:00.000Z');
});
test('stale, malformed, missing, future, failed and aborted inputs explicitly fall back', async () => {
  for (const payload of [
    null,
    {},
    { ...valid, status: 'stale' },
    { ...valid, weather: { ...valid.weather, windKph: null } },
    { ...valid, weather: { ...valid.weather, windKph: -1 } },
    {
      ...valid,
      weather: { ...valid.weather, observedAt: '2026-11-02T08:00:00Z' },
    },
    {
      ...valid,
      weather: { ...valid.weather, observedAt: '2026-11-04T09:00:00Z' },
    },
  ]) {
    const result = await captureWeather({ now, fetcher: fetcher(payload) });
    assert.equal(result.source, 'synthetic');
    assert.equal(result.observedAt, null);
  }
  assert.equal(
    (await captureWeather({ now, fetcher: fetcher(valid, false) })).source,
    'synthetic',
  );
  assert.equal(
    (
      await captureWeather({
        now,
        fetcher: async () => {
          throw new Error('aborted');
        },
      })
    ).source,
    'synthetic',
  );
});
