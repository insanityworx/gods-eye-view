import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveAllowedHosts } from '../../build/allowedHosts.js';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { localMcpPlugin } from '../mcp/plugin.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { googleTokenUnavailablePlugin } from './google-token-unavailable.js';
import { standaloneVoiceTools } from './voiceTools.js';
import { unwatchedRuntimeDirsPlugin } from './unwatched-cache.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export function standaloneConfig(
  { command, mode },
  { nominatimStorageDir } = {},
) {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const tools = standaloneVoiceTools();
  const config = createBrowserViteConfig({
    plugins: [
      ...localProviderPlugins({
        realtime: { tools },
        gemini: { tools },
        nominatimStorageDir,
      }),
      localMcpPlugin(),
      googleTokenUnavailablePlugin(),
      apiNotFoundPlugin(),
      unwatchedRuntimeDirsPlugin(),
    ],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    photonUrl: process.env.PHOTON_URL,
    mapillaryToken: process.env.MAPILLARY_CLIENT_TOKEN,
    host: process.env.HOST,
    port: process.env.PORT,
    allowedHosts: resolveAllowedHosts(process.env.GEV_ALLOWED_HOSTS),
    command,
  });
  config.build.rollupOptions = {
    input: {
      main: fileURLToPath(new URL('../../index.html', import.meta.url)),
      conquest: fileURLToPath(new URL('../../conquest.html', import.meta.url)),
    },
  };
  return config;
}

export default defineConfig(standaloneConfig);
