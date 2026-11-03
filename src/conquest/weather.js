/** Capture one theatre weather observation; never update a running match. */
export async function captureWeather({
  fetcher = fetch,
  now = Date.now(),
  signal,
} = {}) {
  const fallback = {
    source: 'synthetic',
    windKph: 15,
    observedAt: null,
    capturedAt: new Date(now).toISOString(),
  };
  try {
    const response = await fetcher(
      '/api/weather-effects?latitude=51&longitude=0',
      { signal: signal ?? AbortSignal.timeout(8000) },
    );
    if (!response.ok) return fallback;
    const payload = await response.json();
    const weather = payload?.weather;
    const observed = Date.parse(weather?.observedAt);
    if (
      !['ready', 'cached'].includes(payload?.status) ||
      typeof weather?.windKph !== 'number' ||
      !Number.isFinite(weather.windKph) ||
      weather.windKph < 0 ||
      weather.windKph > 500 ||
      !Number.isFinite(observed) ||
      now - observed > 2 * 3600_000 ||
      observed - now > 15 * 60_000
    )
      return fallback;
    return {
      source: 'Open-Meteo',
      windKph: weather.windKph,
      observedAt: new Date(observed).toISOString(),
      capturedAt: new Date(now).toISOString(),
    };
  } catch {
    return fallback;
  }
}
