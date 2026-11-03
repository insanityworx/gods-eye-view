import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  initWorldOverlay,
  setOverlayEntries,
  destroyWorldOverlay,
} from '../overlays/worldOverlay.js';

const COLORS = { player: '#63edbf', enemy: '#ff796f', neutral: '#7095ab' };

/** Minimal keyless globe: fictional sectors, no live civilian or military tracks. */
export function createCampaignMap(container, onSelect) {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    selectionIndicator: false,
    timeline: false,
    animation: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    requestRenderMode: true,
  });
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#102c3d');
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#050d15');
  viewer.scene.globe.enableLighting = false;
  viewer.imageryLayers.add(
    Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
      ),
    ),
  );
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 51, 6500000),
  });
  // Bundled Natural Earth coastline is unnecessary: the campaign grid is fictional.
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(({ position }) => {
    const picked = viewer.scene.pick(position);
    const id = picked?.id?.properties?.sectorId?.getValue();
    if (Number.isInteger(id)) onSelect(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  initWorldOverlay(viewer);
  container.appendChild(document.getElementById('world-overlay-root'));
  const entities = new Map();
  return {
    render(state, selected) {
      for (const sector of state.sectors) {
        const color = Cesium.Color.fromCssColorString(COLORS[sector.owner]);
        let entity = entities.get(sector.id);
        if (!entity) {
          entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(
              sector.lon,
              sector.lat,
              30000,
            ),
            properties: { sectorId: sector.id },
            rectangle: {
              coordinates: Cesium.Rectangle.fromDegrees(
                sector.lon - 5.5,
                sector.lat - 3.5,
                sector.lon + 5.5,
                sector.lat + 3.5,
              ),
              height: 15000,
              material: color.withAlpha(0.15),
              outline: true,
              outlineColor: color,
            },
            point: {
              pixelSize: 9,
              color,
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
          entities.set(sector.id, entity);
        }
        entity.rectangle.material = color.withAlpha(
          sector.id === selected ? 0.4 : 0.13,
        );
        entity.rectangle.outlineColor = color;
        entity.point.color = color;
      }
      setOverlayEntries(
        'conquest',
        state.sectors.map((sector) => ({
          id: String(sector.id),
          position: Cesium.Cartesian3.fromDegrees(
            sector.lon,
            sector.lat,
            30000,
          ),
          title: `${sector.name.toUpperCase()} · ${sector.units}`,
          accent: COLORS[sector.owner],
          selected: sector.id === selected,
          variant: 'label',
          pinned: true,
        })),
        { cohortLimit: 9, maxVisible: 9 },
      );
      viewer.scene.requestRender();
    },
    destroy() {
      destroyWorldOverlay();
      handler.destroy();
      viewer.destroy();
    },
  };
}
