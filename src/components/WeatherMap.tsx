import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity,
  FiCheck,
  FiClock,
  FiCloud,
  FiCrosshair,
  FiDroplet,
  FiGlobe,
  FiInfo,
  FiLayers,
  FiMap,
  FiMapPin,
  FiPause,
  FiPlay,
  FiSun,
  FiThermometer,
  FiWind,
  FiX
} from 'react-icons/fi';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import CountryFlag from './CountryFlag';
import { translations, weatherModels } from '../constants';
import {
  fetchActiveCyclones,
  fetchRadarFrames,
  fetchWeatherMapPoints,
  MapBounds
} from '../services/weatherMapService';
import {
  Coordinates,
  ForecastSource,
  Language,
  TropicalCycloneFeature,
  WeatherMapField,
  WeatherMapPoint,
  WeatherModelKey
} from '../types';

interface Props {
  language: Language;
  location: Coordinates;
  forecastSource: ForecastSource;
  customBlendModels: WeatherModelKey[];
  onForecastSourceChange: (source: ForecastSource) => void;
  onLocationSelect: (location: Coordinates) => void;
  onUseCurrentLocation: () => void;
  locating: boolean;
}

type ProjectionMode = 'flat' | 'globe';

const emptyFeatureCollection = {
  type: 'FeatureCollection' as const,
  features: []
};

const fieldOptions: Array<{
  key: WeatherMapField;
  ar: string;
  en: string;
  icon: React.ReactNode;
}> = [
  { key: 'temperature', ar: 'الحرارة', en: 'Temperature', icon: <FiThermometer /> },
  { key: 'precipitation', ar: 'الهطول', en: 'Precipitation', icon: <FiDroplet /> },
  { key: 'clouds', ar: 'الغيوم', en: 'Clouds', icon: <FiCloud /> },
  { key: 'wind', ar: 'الرياح', en: 'Wind', icon: <FiWind /> },
  { key: 'humidity', ar: 'الرطوبة', en: 'Humidity', icon: <FiDroplet /> },
  { key: 'pressure', ar: 'الضغط', en: 'Pressure', icon: <FiActivity /> },
  { key: 'uv', ar: 'الأشعة', en: 'UV', icon: <FiSun /> },
  { key: 'dust', ar: 'الغبار', en: 'Dust', icon: <FiWind /> }
];

const futureHours = [0, 6, 12, 24, 48, 72];
const isCompactMapViewport = () =>
  typeof window !== 'undefined'
  && window.matchMedia('(max-width: 780px), (hover: none) and (pointer: coarse)').matches;

const toPointsGeoJson = (points: WeatherMapPoint[]) => ({
  type: 'FeatureCollection' as const,
  features: points.map((point, index) => ({
    type: 'Feature' as const,
    id: index,
    geometry: {
      type: 'Point' as const,
      coordinates: [point.lon, point.lat]
    },
    properties: {
      value: point.value,
      label: point.label,
      color: point.color
    }
  }))
});

const modelResolutionKm: Record<WeatherModelKey, number> = {
  ecmwf: 9,
  gfs: 25,
  icon: 13,
  gem: 15,
  jma: 20
};

const webMercatorBounds: [number, number, number, number] = [-180, -85.051129, 180, 85.051129];

const resolutionForSource = (
  source: ForecastSource,
  customModels: WeatherModelKey[]
) => {
  if (source === 'blend') return Math.max(...Object.values(modelResolutionKm));
  if (source === 'custom') {
    const models = customModels.length ? customModels : weatherModels.map((model) => model.key);
    return Math.max(...models.map((model) => modelResolutionKm[model]));
  }
  return modelResolutionKm[source];
};

const toCoverageGeoJson = (center: { lat: number; lon: number }, radiusKm: number) => {
  const coordinates: number[][] = [];
  const latitudeRadians = center.lat * Math.PI / 180;
  const latitudeScale = 1 / 110.574;
  const longitudeScale = 1 / Math.max(20, 111.32 * Math.cos(latitudeRadians));
  for (let index = 0; index <= 64; index += 1) {
    const angle = index / 64 * Math.PI * 2;
    coordinates.push([
      center.lon + Math.cos(angle) * radiusKm * longitudeScale,
      center.lat + Math.sin(angle) * radiusKm * latitudeScale
    ]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coordinates]
    }
  };
};

const firstBaseLabelLayer = (map: MapLibreMap) =>
  map.getStyle().layers?.find((layer) => layer.type === 'symbol' && !layer.id.startsWith('weather-'))?.id;

const toCyclonesGeoJson = (cyclones: TropicalCycloneFeature[]) => ({
  type: 'FeatureCollection' as const,
  features: cyclones.map((cyclone) => ({
    type: 'Feature' as const,
    id: cyclone.id,
    geometry: {
      type: 'Point' as const,
      coordinates: [cyclone.lon, cyclone.lat]
    },
    properties: {
      name: cyclone.name,
      severity: cyclone.severity ?? ''
    }
  }))
});

export default function WeatherMap({
  language,
  location,
  forecastSource,
  customBlendModels,
  onForecastSourceChange,
  onLocationSelect,
  onUseCurrentLocation,
  locating
}: Props) {
  const t = translations[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const languageRef = useRef(language);
  const onLocationSelectRef = useRef(onLocationSelect);
  const updateWeatherPointsRef = useRef<() => void>(() => undefined);
  const updateAerosolPointsRef = useRef<() => void>(() => undefined);
  const lastWeatherPointsRef = useRef<WeatherMapPoint[]>([]);
  const pointAbortRef = useRef<AbortController | null>(null);
  const aerosolAbortRef = useRef<AbortController | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureMovedRef = useRef(false);
  const gestureResetTimerRef = useRef<number | null>(null);
  const hasWeatherPointsRef = useRef(false);
  const [projection, setProjection] = useState<ProjectionMode>('flat');
  const [field, setField] = useState<WeatherMapField>('temperature');
  const [radarEnabled, setRadarEnabled] = useState(false);
  const [satelliteEnabled, setSatelliteEnabled] = useState(false);
  const [aerosolEnabled, setAerosolEnabled] = useState(false);
  const [cyclonesEnabled, setCyclonesEnabled] = useState(false);
  const [layersOpen, setLayersOpen] = useState(() => !isCompactMapViewport());
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [error, setError] = useState('');
  const [forecastHourIndex, setForecastHourIndex] = useState(0);
  const [radarFrames, setRadarFrames] = useState<Array<{ host: string; path: string; time: number }>>([]);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<Coordinates | null>(null);
  const activeMapLocation = pendingLocation ?? location;
  const samplingRadiusKm = useMemo(
    () => resolutionForSource(forecastSource, customBlendModels),
    [customBlendModels, forecastSource]
  );

  const selectedModel = useMemo(
    () => weatherModels.find((model) => model.key === forecastSource),
    [forecastSource]
  );

  const currentBounds = useCallback((): MapBounds | null => {
    const map = mapRef.current;
    if (!map) return null;
    const bounds = map.getBounds();
    return {
      west: bounds.getWest(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      north: bounds.getNorth()
    };
  }, []);

  const updateWeatherPoints = useCallback(async () => {
    const map = mapRef.current;
    const bounds = currentBounds();
    if (!map || !bounds || field === 'none') return;
    pointAbortRef.current?.abort();
    const controller = new AbortController();
    pointAbortRef.current = controller;
    const showInitialProgress = !hasWeatherPointsRef.current;
    if (showInitialProgress) setFieldLoading(true);
    try {
      const points = await fetchWeatherMapPoints(
        bounds,
        map.getZoom(),
        field,
        forecastSource,
        customBlendModels,
        language,
        futureHours[forecastHourIndex],
        controller.signal,
        projection === 'globe'
          ? { lat: map.getCenter().lat, lon: map.getCenter().lng }
          : undefined,
        { lat: activeMapLocation.lat, lon: activeMapLocation.lon }
      );
      const source = map.getSource('weather-points') as GeoJSONSource | undefined;
      lastWeatherPointsRef.current = points;
      source?.setData(toPointsGeoJson(points));
      hasWeatherPointsRef.current = true;
      setError('');
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        setError(language === 'ar' ? 'تعذر تحديث طبقة الطقس المختارة' : 'Could not update the selected weather layer');
      }
    } finally {
      if (!controller.signal.aborted && showInitialProgress) setFieldLoading(false);
    }
  }, [
    currentBounds,
    customBlendModels,
    activeMapLocation.lat,
    activeMapLocation.lon,
    field,
    forecastHourIndex,
    forecastSource,
    language
    , projection
  ]);

  const updateAerosolPoints = useCallback(async () => {
    const map = mapRef.current;
    const bounds = currentBounds();
    const source = map?.getSource('aerosol-points') as GeoJSONSource | undefined;
    if (!map || !mapReady || !source || !bounds || !aerosolEnabled || projection === 'globe') {
      source?.setData(emptyFeatureCollection);
      aerosolAbortRef.current?.abort();
      return;
    }
    aerosolAbortRef.current?.abort();
    const controller = new AbortController();
    aerosolAbortRef.current = controller;
    try {
      const points = await fetchWeatherMapPoints(
        bounds,
        map.getZoom(),
        'dust',
        forecastSource,
        customBlendModels,
        language,
        0,
        controller.signal,
        undefined,
        { lat: activeMapLocation.lat, lon: activeMapLocation.lon }
      );
      if (!controller.signal.aborted) source.setData(toPointsGeoJson(points));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') source.setData(emptyFeatureCollection);
    }
  }, [activeMapLocation.lat, activeMapLocation.lon, aerosolEnabled, currentBounds, customBlendModels, forecastSource, language, mapReady, projection]);

  const schedulePointUpdate = useCallback(() => {
    if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = window.setTimeout(() => {
      updateWeatherPointsRef.current();
      updateAerosolPointsRef.current();
    }, isCompactMapViewport() ? 750 : 420);
  }, []);

  useEffect(() => {
    languageRef.current = language;
    onLocationSelectRef.current = onLocationSelect;
    updateWeatherPointsRef.current = updateWeatherPoints;
    updateAerosolPointsRef.current = updateAerosolPoints;
  }, [language, onLocationSelect, updateAerosolPoints, updateWeatherPoints]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    let map: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const mapContainer = containerRef.current;
    const onPointerDown = (event: PointerEvent) => {
      gestureStartRef.current = { x: event.clientX, y: event.clientY };
      gestureMovedRef.current = false;
      if (gestureResetTimerRef.current) window.clearTimeout(gestureResetTimerRef.current);
    };
    const onPointerMove = (event: PointerEvent) => {
      const start = gestureStartRef.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
        gestureMovedRef.current = true;
      }
    };
    const onPointerEnd = () => {
      gestureStartRef.current = null;
      if (gestureResetTimerRef.current) window.clearTimeout(gestureResetTimerRef.current);
      gestureResetTimerRef.current = window.setTimeout(() => {
        gestureMovedRef.current = false;
      }, 450);
    };

    mapContainer.addEventListener('pointerdown', onPointerDown, { passive: true });
    mapContainer.addEventListener('pointermove', onPointerMove, { passive: true });
    mapContainer.addEventListener('pointerup', onPointerEnd, { passive: true });
    mapContainer.addEventListener('pointercancel', onPointerEnd, { passive: true });

    const initialize = async () => {
      try {
        const maplibregl = await import('maplibre-gl');
        if (!active || !containerRef.current) return;
        if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
          maplibregl.setRTLTextPlugin(
            'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js',
            true
          ).catch(() => undefined);
        }
        map = new maplibregl.Map({
          container: containerRef.current,
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [location.lon, location.lat],
          zoom: 5,
          attributionControl: false,
          fadeDuration: isCompactMapViewport() ? 0 : 300,
          canvasContextAttributes: { antialias: !isCompactMapViewport() }
        });
        mapRef.current = map;
        resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(containerRef.current);
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: 'OpenFreeMap · OpenStreetMap'
          }),
          'bottom-right'
        );

        map.on('load', () => {
          if (!map) return;
          map.addSource('weather-points', {
            type: 'geojson',
            data: emptyFeatureCollection
          });
          map.addSource('aerosol-points', {
            type: 'geojson',
            data: emptyFeatureCollection
          });
          map.addSource('sampling-area', {
            type: 'geojson',
            data: toCoverageGeoJson(location, resolutionForSource(forecastSource, customBlendModels))
          });
          map.addLayer({
            id: 'sampling-area-fill',
            type: 'fill',
            source: 'sampling-area',
            paint: {
              'fill-color': '#65ddff',
              'fill-opacity': 0.1
            }
          });
          map.addLayer({
            id: 'sampling-area-outline',
            type: 'line',
            source: 'sampling-area',
            paint: {
              'line-color': 'rgba(101,221,255,.9)',
              'line-width': 2,
              'line-dasharray': [2, 2]
            }
          });
          map.addLayer({
            id: 'weather-points-halo',
            type: 'circle',
            source: 'weather-points',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 12, 8, 18],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.2,
              'circle-blur': 0.9
            }
          });
          map.addLayer({
            id: 'weather-points-core',
            type: 'circle',
            source: 'weather-points',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 8, 8, 13],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.72,
              'circle-stroke-color': 'rgba(255,255,255,.82)',
              'circle-stroke-width': 1
            }
          });
          map.addLayer({
            id: 'weather-points-label',
            type: 'symbol',
            source: 'weather-points',
            layout: {
              'text-field': ['get', 'label'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 1, 0, 4, 0, 5, 9, 8, 12],
              'text-font': ['Noto Sans Regular'],
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-padding': 6
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(3,13,26,.9)',
              'text-halo-width': 2
            }
          });
          map.addLayer({
            id: 'aerosol-points-halo',
            type: 'circle',
            source: 'aerosol-points',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 10, 12, 24],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.2,
              'circle-blur': 0.85
            }
          });
          map.addLayer({
            id: 'aerosol-points-core',
            type: 'circle',
            source: 'aerosol-points',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 6, 12, 14],
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.5,
              'circle-blur': 0.25
            }
          });
          map.addSource('selected-location', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [location.lon, location.lat] },
              properties: {}
            }
          });
          map.addLayer({
            id: 'selected-location-ring',
            type: 'circle',
            source: 'selected-location',
            paint: {
              'circle-radius': 10,
              'circle-color': 'rgba(101,221,255,.18)',
              'circle-stroke-width': 3,
              'circle-stroke-color': 'rgba(255,255,255,.95)'
            }
          });
          map.addSource('cyclones', { type: 'geojson', data: emptyFeatureCollection });
          map.addLayer({
            id: 'cyclones-layer',
            type: 'circle',
            source: 'cyclones',
            layout: { visibility: 'none' },
            paint: {
              'circle-radius': 13,
              'circle-color': '#ef4444',
              'circle-stroke-width': 4,
              'circle-stroke-color': 'rgba(255,255,255,.86)',
              'circle-blur': 0.08
            }
          });
          map.addLayer({
            id: 'cyclones-label',
            type: 'symbol',
            source: 'cyclones',
            layout: {
              visibility: 'none',
              'text-field': ['get', 'name'],
              'text-offset': [0, 1.8],
              'text-size': 12
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#801d2c',
              'text-halo-width': 2
            }
          });

          map.on('moveend', schedulePointUpdate);
          map.on('click', (event) => {
            if (gestureMovedRef.current) return;
            const nextLocation: Coordinates = {
              lat: event.lngLat.lat,
              lon: event.lngLat.lng,
              name: languageRef.current === 'ar' ? 'موقع من الخريطة' : 'Map location',
              source: 'coordinates'
            };
            setPendingLocation(nextLocation);
            setLayersOpen(false);
            setCreditsOpen(false);
            const source = map?.getSource('selected-location') as GeoJSONSource | undefined;
            source?.setData({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [nextLocation.lon, nextLocation.lat] },
              properties: {}
            });
          });
          setMapReady(true);
          setLoading(false);
          map.resize();
        });
        map.on('error', () => {
          setError(t.mapUnavailable);
          setLoading(false);
        });
      } catch {
        setError(t.mapUnavailable);
        setLoading(false);
      }
    };

    initialize();
    return () => {
      active = false;
      pointAbortRef.current?.abort();
      if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
      if (gestureResetTimerRef.current) window.clearTimeout(gestureResetTimerRef.current);
      mapContainer.removeEventListener('pointerdown', onPointerDown);
      mapContainer.removeEventListener('pointermove', onPointerMove);
      mapContainer.removeEventListener('pointerup', onPointerEnd);
      mapContainer.removeEventListener('pointercancel', onPointerEnd);
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
    // The map instance is created once. Reactive data is updated in focused effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady || pendingLocation) return;
    const map = mapRef.current;
    const source = map?.getSource('selected-location') as GeoJSONSource | undefined;
    source?.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [location.lon, location.lat] },
      properties: {}
    });
    if (location.source === 'geolocation') {
      map?.flyTo({
        center: [location.lon, location.lat],
        zoom: Math.max(map.getZoom(), 7)
      });
    }
  }, [location.lat, location.lon, location.source, mapReady, pendingLocation]);

  useEffect(() => {
    if (mapReady) updateWeatherPoints();
  }, [mapReady, updateWeatherPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setProjection({ type: projection === 'globe' ? 'globe' : 'mercator' });
    const source = map.getSource('weather-points') as GeoJSONSource | undefined;
    if (source && lastWeatherPointsRef.current.length) {
      source.setData(toPointsGeoJson(lastWeatherPointsRef.current));
    }
  }, [mapReady, projection]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const areaSource = map?.getSource('sampling-area') as GeoJSONSource | undefined;
    areaSource?.setData(toCoverageGeoJson(activeMapLocation, samplingRadiusKm));
  }, [
    activeMapLocation.lat,
    activeMapLocation.lon,
    mapReady,
    samplingRadiusKm
  ]);

  useEffect(() => {
    if (!mapReady || !radarEnabled || radarFrames.length) return;
    const controller = new AbortController();
    fetchRadarFrames(controller.signal)
      .then((frames) => {
        setRadarFrames(frames);
        setRadarFrameIndex(Math.max(0, frames.length - 1));
      })
      .catch(() => setError(language === 'ar' ? 'تعذر تحميل الرادار الآن' : 'Radar is unavailable'));
    return () => controller.abort();
  }, [language, mapReady, radarEnabled, radarFrames.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !radarFrames.length) return;
    const frame = radarFrames[radarFrameIndex];
    const sourceId = 'radar-source';
    const layerId = 'radar-layer';
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    if (!radarEnabled) return;
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [`${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`],
      tileSize: 256,
      maxzoom: 7
    });
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': 0.72,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear'
      }
    }, firstBaseLabelLayer(map));
  }, [mapReady, radarEnabled, radarFrameIndex, radarFrames]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const configureRaster = (
      enabled: boolean,
      sourceId: string,
      layerId: string,
      url: string,
      maxzoom: number,
      opacity: number,
      attribution?: string
    ) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (!enabled) return;
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        maxzoom,
        bounds: webMercatorBounds,
        attribution
      });
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': opacity,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear'
        }
      }, firstBaseLabelLayer(map));
    };

    configureRaster(
      satelliteEnabled,
      'satellite-source',
      'satellite-layer',
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      19,
      0.66,
      'Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    );
  }, [mapReady, satelliteEnabled]);

  useEffect(() => {
    void updateAerosolPoints();
    return () => aerosolAbortRef.current?.abort();
  }, [updateAerosolPoints]);

  useEffect(() => {
    if (!mapReady || !cyclonesEnabled) return;
    const controller = new AbortController();
    fetchActiveCyclones(controller.signal)
      .then((cyclones) => {
        const map = mapRef.current;
        const source = map?.getSource('cyclones') as GeoJSONSource | undefined;
        source?.setData(toCyclonesGeoJson(cyclones));
        map?.setLayoutProperty('cyclones-layer', 'visibility', 'visible');
        map?.setLayoutProperty('cyclones-label', 'visibility', 'visible');
      })
      .catch(() => setError(language === 'ar' ? 'تعذر تحديث الأعاصير الآن' : 'Cyclone data is unavailable'));
    return () => controller.abort();
  }, [cyclonesEnabled, language, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || cyclonesEnabled) return;
    map.setLayoutProperty('cyclones-layer', 'visibility', 'none');
    map.setLayoutProperty('cyclones-label', 'visibility', 'none');
  }, [cyclonesEnabled, mapReady]);

  useEffect(() => {
    if (!playing || !radarEnabled || radarFrames.length < 2) return;
    playTimerRef.current = window.setInterval(() => {
      setRadarFrameIndex((index) => (index + 1) % radarFrames.length);
    }, 650);
    return () => {
      if (playTimerRef.current) window.clearInterval(playTimerRef.current);
    };
  }, [playing, radarEnabled, radarFrames.length]);

  const mapSourceLabel = selectedModel
    ? `${selectedModel.label} · ${language === 'ar' ? selectedModel.nameAr : selectedModel.nameEn}`
    : forecastSource === 'custom'
      ? t.customBlend
      : t.blend;

  const radarTime = radarFrames[radarFrameIndex]
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date(radarFrames[radarFrameIndex].time * 1000))
    : '';

  const changeProjection = (mode: ProjectionMode) => {
    setProjection(mode);
    setPendingLocation(null);
    if (mode === 'globe') {
      setRadarEnabled(false);
      setSatelliteEnabled(false);
      setAerosolEnabled(false);
      setPlaying(false);
    }
    if (isCompactMapViewport()) setLayersOpen(false);
    mapRef.current?.flyTo({
      center: [location.lon, location.lat],
      zoom: mode === 'globe' ? 1.35 : 5,
      pitch: 0,
      bearing: 0,
      duration: 900
    });
  };

  const confirmPendingLocation = () => {
    if (!pendingLocation) return;
    onLocationSelectRef.current(pendingLocation);
    setPendingLocation(null);
  };

  const cancelPendingLocation = () => {
    setPendingLocation(null);
  };

  return (
    <div className="weather-map-shell">
      <div className="map-toolbar glass-card">
        <div className="projection-switch">
          <button
            type="button"
            className={projection === 'flat' ? 'active' : ''}
            onClick={() => changeProjection('flat')}
          >
            <FiMap /> {t.flatMap}
          </button>
          <button
            type="button"
            className={projection === 'globe' ? 'active' : ''}
            onClick={() => changeProjection('globe')}
          >
            <FiGlobe /> {t.globe}
          </button>
        </div>
        <button type="button" className="layers-toggle" aria-label={t.layers} onClick={() => setLayersOpen((value) => !value)}>
          <FiLayers /> <span className="compact-label">{t.layers}</span>
        </button>
        <button
          type="button"
          className="map-live-button"
          aria-label={locating ? t.locating : t.liveLocation}
          aria-busy={locating}
          disabled={locating}
          onClick={onUseCurrentLocation}
        >
          {locating ? <span className="mini-loader" /> : <FiCrosshair />}
          <span className="compact-label">{locating ? t.locating : t.liveLocation}</span>
        </button>
        <button
          type="button"
          className="map-center-button"
          aria-label={location.name}
          onClick={() => {
            setPendingLocation(null);
            mapRef.current?.flyTo({ center: [location.lon, location.lat], zoom: 7 });
          }}
        >
          <FiMapPin /> <span className="compact-label">{location.name}</span>
        </button>
        <button
          type="button"
          className="map-credits-toggle"
          aria-label={creditsOpen ? t.hideMapCredits : t.mapCredits}
          aria-expanded={creditsOpen}
          onClick={() => setCreditsOpen((value) => !value)}
        >
          <FiInfo /> <span className="compact-label">{t.mapCredits}</span>
        </button>
      </div>

      {creditsOpen && (
        <div className="map-credits-popover glass-card">
          <strong>{t.mapCredits}</strong>
          <p>
            {language === 'ar'
              ? 'خريطة الأساس: بيانات خرائط مفتوحة · الرادار: رصد خارجي · الأقمار الصناعية: وكالة الفضاء الأمريكية · الأعاصير: نظام الإنذار العالمي'
              : 'Base map: open map data · Radar: external observations · Satellite: NASA · Cyclones: GDACS'}
          </p>
        </div>
      )}

      {layersOpen && (
        <aside className="map-layers-panel glass-card">
          <div className="map-layer-section">
            <strong>{language === 'ar' ? 'مصدر النموذج' : 'Forecast model'}</strong>
            <div className="map-model-options">
              <button
                type="button"
                className={forecastSource === 'blend' ? 'active' : ''}
                onClick={() => onForecastSourceChange('blend')}
              >
                <FiGlobe /> {t.blend}
              </button>
              {weatherModels.map((model) => (
                <button
                  type="button"
                  className={forecastSource === model.key ? 'active' : ''}
                  key={`map-model-${model.key}`}
                  onClick={() => onForecastSourceChange(model.key)}
                >
                  <CountryFlag countryCode={model.countryCode} label={language === 'ar' ? model.nameAr : model.nameEn} />
                  {model.label}
                </button>
              ))}
              <button
                type="button"
                className={forecastSource === 'custom' ? 'active' : ''}
                onClick={() => onForecastSourceChange('custom')}
              >
                <FiLayers /> {t.customBlend}
              </button>
            </div>
          </div>

          <div className="map-layer-section">
            <strong>{language === 'ar' ? 'حقل الطقس' : 'Weather field'}</strong>
            <div className="field-options">
              {fieldOptions.map((option) => (
                <button
                  type="button"
                  key={option.key}
                  className={field === option.key ? 'active' : ''}
                  onClick={() => setField(option.key)}
                >
                  {option.icon}
                  {language === 'ar' ? option.ar : option.en}
                </button>
              ))}
            </div>
          </div>

          <div className="map-layer-section">
            <strong>{language === 'ar' ? 'الرصد والأقمار الصناعية' : 'Observations and satellite'}</strong>
            <label><input type="checkbox" disabled={projection === 'globe'} checked={radarEnabled} onChange={(event) => setRadarEnabled(event.target.checked)} /> {t.radar}</label>
            <label><input type="checkbox" disabled={projection === 'globe'} checked={satelliteEnabled} onChange={(event) => setSatelliteEnabled(event.target.checked)} /> {t.satellite}</label>
            <label><input type="checkbox" disabled={projection === 'globe'} checked={aerosolEnabled} onChange={(event) => setAerosolEnabled(event.target.checked)} /> {t.dustLayer}</label>
            <label><input type="checkbox" checked={cyclonesEnabled} onChange={(event) => setCyclonesEnabled(event.target.checked)} /> {t.cyclones}</label>
            {projection === 'globe' && (
              <small className="map-layer-note">
                {language === 'ar'
                  ? 'طبقات الصور والرادار متاحة في الخريطة المسطحة فقط لضمان عرض صحيح بلا تشوهات قطبية.'
                  : 'Raster and radar layers are available on the flat map only to prevent polar projection artifacts.'}
              </small>
            )}
          </div>
        </aside>
      )}

      <div className="weather-map" ref={containerRef} />

      {pendingLocation && (
        <div className="map-selection-card glass-card" role="status">
          <div>
            <strong>{language === 'ar' ? 'موقع محدد على الخريطة' : 'Selected map location'}</strong>
            <span>
              {pendingLocation.lat.toFixed(5)}، {pendingLocation.lon.toFixed(5)}
            </span>
          </div>
          <div className="map-selection-actions">
            <button type="button" className="confirm" onClick={confirmPendingLocation}>
              <FiCheck /> {language === 'ar' ? 'عرض التوقعات' : 'View forecast'}
            </button>
            <button type="button" onClick={cancelPendingLocation}>
              <FiX /> {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {(loading || fieldLoading) && (
        <div className="map-loading">
          <span className="mini-loader" />
          <strong>{loading ? t.mapLoading : language === 'ar' ? 'نحدّث الطبقة' : 'Updating layer'}</strong>
        </div>
      )}

      {!pendingLocation && (
        <div className="map-status glass-card">
          <div><span>{language === 'ar' ? 'المصدر' : 'Source'}</span><strong>{mapSourceLabel}</strong></div>
          <div><span>{language === 'ar' ? 'الزمن' : 'Time'}</span><strong>{futureHours[forecastHourIndex] === 0 ? (language === 'ar' ? 'الآن' : 'Now') : `+${futureHours[forecastHourIndex]}h`}</strong></div>
          <div><span>{language === 'ar' ? 'الموقع المختار' : 'Selected location'}</span><strong>{location.name}</strong></div>
        </div>
      )}

      <div className="map-timeline glass-card">
        {radarEnabled && radarFrames.length > 0 ? (
          <>
            <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <FiPause /> : <FiPlay />}
            </button>
            <input
              type="range"
              min="0"
              max={Math.max(0, radarFrames.length - 1)}
              value={radarFrameIndex}
              onChange={(event) => setRadarFrameIndex(Number(event.target.value))}
            />
            <strong>{radarTime}</strong>
            <small>{language === 'ar' ? 'رصد سابق للرادار' : 'Observed radar history'}</small>
          </>
        ) : (
          <>
            <FiClock aria-hidden="true" />
            <div className="forecast-time-options">
              {futureHours.map((hour, index) => (
                <button
                  type="button"
                  key={hour}
                  className={forecastHourIndex === index ? 'active' : ''}
                  onClick={() => setForecastHourIndex(index)}
                >
                  {hour === 0 ? (language === 'ar' ? 'الآن' : 'Now') : `+${hour}`}
                </button>
              ))}
            </div>
            <small>{language === 'ar' ? 'توقع مستقبلي من النموذج المختار' : 'Forecast from the selected model'}</small>
          </>
        )}
      </div>

      <div className="map-instruction"><FiMapPin /> {t.selectOnMap}</div>
      {error && <div className="map-error">{error}</div>}
    </div>
  );
}
