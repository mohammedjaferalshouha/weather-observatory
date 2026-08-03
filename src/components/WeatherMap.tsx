import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiActivity,
  FiCheck,
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
  fetchWeatherMapReading
} from '../services/weatherMapService';
import {
  aerosolRaster,
  fieldSourceLabel,
  radarLegend,
  satelliteRaster,
  weatherRasterForField
} from '../services/weatherTileService';
import type { LegendBand, MapLegend } from '../services/weatherTileService';
import {
  Coordinates,
  ForecastSource,
  Language,
  TropicalCycloneFeature,
  WeatherMapField,
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
  { key: 'none', ar: 'بدون حقل طقس', en: 'No weather field', icon: <FiMap /> },
  { key: 'temperature', ar: 'الحرارة', en: 'Temperature', icon: <FiThermometer /> },
  { key: 'precipitation', ar: 'الهطول', en: 'Precipitation', icon: <FiDroplet /> },
  { key: 'clouds', ar: 'الغيوم', en: 'Clouds', icon: <FiCloud /> },
  { key: 'wind', ar: 'الرياح', en: 'Wind', icon: <FiWind /> },
  { key: 'humidity', ar: 'الرطوبة', en: 'Humidity', icon: <FiDroplet /> },
  { key: 'pressure', ar: 'الضغط', en: 'Pressure', icon: <FiActivity /> },
  { key: 'uv', ar: 'الأشعة', en: 'UV', icon: <FiSun /> },
  { key: 'dust', ar: 'الغبار', en: 'Dust', icon: <FiWind /> }
];

const LegendStrip = ({
  bands,
  label
}: {
  bands: LegendBand[];
  label?: string;
}) => (
  <div className="map-legend-series">
    {label && <strong className="map-legend-series-label">{label}</strong>}
    <div
      className="map-legend-band-strip"
      dir="ltr"
      style={{ gridTemplateColumns: `repeat(${bands.length}, minmax(4px, 1fr))` }}
    >
      {bands.map((band, index) => (
        <span
          key={`${band.label}-${index}`}
          aria-hidden="true"
          style={{ backgroundColor: band.color }}
        />
      ))}
    </div>
    <div className="map-legend-boundaries" dir="ltr">
      <span>{bands[0]?.label}</span>
      <span>{bands[Math.floor((bands.length - 1) / 2)]?.label}</span>
      <span>{bands[bands.length - 1]?.label}</span>
    </div>
  </div>
);

const LegendBandList = ({ bands }: { bands: LegendBand[] }) => (
  <div className="map-legend-band-list" dir="ltr">
    {bands.map((band, index) => (
      <span className="map-legend-band-item" key={`${band.label}-detail-${index}`}>
        <i aria-hidden="true" style={{ backgroundColor: band.color }} />
        <b>{band.label}</b>
      </span>
    ))}
  </div>
);

const MapLegendCard = ({
  language,
  legend,
  note,
  title
}: {
  language: Language;
  legend: MapLegend;
  note?: string;
  title: string;
}) => {
  const bands = legend.bands ?? [];
  const secondaryBands = legend.secondaryBands ?? [];
  const primaryLabel = language === 'ar' ? legend.primaryLabelAr : legend.primaryLabelEn;
  const secondaryLabel = language === 'ar' ? legend.secondaryLabelAr : legend.secondaryLabelEn;
  const unit = language === 'ar' ? legend.unitAr : legend.unitEn;
  const legendNote = language === 'ar' ? legend.noteAr : legend.noteEn;

  return (
    <section className="map-color-legend glass-card" aria-label={title}>
      <div className="map-color-legend-heading">
        <strong>{title}</strong>
        {unit && <span>{unit}</span>}
      </div>

      {legend.kind === 'bands' && bands.length > 0 && (
        <>
          <LegendStrip bands={bands} label={primaryLabel} />
          {secondaryBands.length > 0 && (
            <LegendStrip bands={secondaryBands} label={secondaryLabel} />
          )}
          <details className="map-legend-details">
            <summary>
              {language === 'ar' ? 'عرض جميع الفواصل الدقيقة' : 'Show all exact intervals'}
            </summary>
            {primaryLabel && <strong className="map-legend-detail-label">{primaryLabel}</strong>}
            <LegendBandList bands={bands} />
            {secondaryBands.length > 0 && (
              <>
                {secondaryLabel && <strong className="map-legend-detail-label">{secondaryLabel}</strong>}
                <LegendBandList bands={secondaryBands} />
              </>
            )}
          </details>
        </>
      )}

      {legend.kind === 'image' && legend.imageUrl && (
        <div className="map-official-legend-image" dir="ltr">
          <img src={legend.imageUrl} alt={title} />
        </div>
      )}

      {legend.kind === 'wind' && (
        <div className="map-symbol-legend" dir="ltr">
          <svg viewBox="0 0 120 42" aria-hidden="true">
            <path d="M18 34 L83 8 M83 8 L108 11 M76 11 L99 17 M68 15 L88 21" />
          </svg>
          <span>{language === 'ar' ? 'اتجاه وسرعة الرياح' : 'Wind direction and speed'}</span>
        </div>
      )}

      {legend.kind === 'pressure' && (
        <div className="map-symbol-legend map-pressure-legend" dir="ltr">
          <span className="map-isobar-sample" />
          <b>1015 hPa</b>
        </div>
      )}

      {(legendNote || note) && <small>{legendNote ?? note}</small>}
    </section>
  );
};

const futureHours = [0, 6, 12, 24, 48, 72];
const isCompactMapViewport = () =>
  typeof window !== 'undefined'
  && window.matchMedia('(max-width: 780px), (hover: none) and (pointer: coarse)').matches;

const webMercatorBounds: [number, number, number, number] = [-180, -85.051129, 180, 85.051129];

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

const createMapIcon = (kind: 'pin' | 'cyclone') => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return new ImageData(1, 1);
  context.clearRect(0, 0, 64, 64);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (kind === 'pin') {
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#063a56';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(32, 58);
    context.bezierCurveTo(26, 47, 15, 37, 15, 25);
    context.arc(32, 25, 17, Math.PI, 0);
    context.bezierCurveTo(49, 37, 38, 47, 32, 58);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = '#20d6c7';
    context.beginPath();
    context.arc(32, 25, 7, 0, Math.PI * 2);
    context.fill();
  } else {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 7;
    context.beginPath();
    context.arc(32, 32, 20, -2.7, 0.65);
    context.stroke();
    context.strokeStyle = '#ef4444';
    context.lineWidth = 7;
    context.beginPath();
    context.arc(32, 32, 11, 0.4, 3.75);
    context.stroke();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(32, 32, 4, 0, Math.PI * 2);
    context.fill();
  }
  return context.getImageData(0, 0, 64, 64);
};

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
  const readingAbortRef = useRef<AbortController | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const gestureMovedRef = useRef(false);
  const gestureResetTimerRef = useRef<number | null>(null);
  const [projection, setProjection] = useState<ProjectionMode>('flat');
  const [field, setField] = useState<WeatherMapField>('temperature');
  const [radarEnabled, setRadarEnabled] = useState(false);
  const [satelliteEnabled, setSatelliteEnabled] = useState(false);
  const [aerosolEnabled, setAerosolEnabled] = useState(false);
  const [cyclonesEnabled, setCyclonesEnabled] = useState(false);
  const [layersOpen, setLayersOpen] = useState(() => !isCompactMapViewport());
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forecastHourIndex, setForecastHourIndex] = useState(0);
  const [radarFrames, setRadarFrames] = useState<Array<{ host: string; path: string; time: number }>>([]);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<Coordinates | null>(null);
  const [selectedFieldReading, setSelectedFieldReading] = useState<{ text: string } | null>(null);
  const selectedCoordinates = pendingLocation ?? location;
  const forecastHour = futureHours[forecastHourIndex];
  const fieldRaster = useMemo(
    () => field === 'none' ? null : weatherRasterForField(field, forecastHour),
    [field, forecastHour]
  );
  const currentAerosolRaster = useMemo(
    () => aerosolRaster(forecastHour),
    [forecastHour]
  );

  useEffect(() => {
    languageRef.current = language;
    onLocationSelectRef.current = onLocationSelect;
  }, [language, onLocationSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    let map: MapLibreMap | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mapHasLoaded = false;
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
        resizeObserver = new ResizeObserver(() => {
          map?.resize();
        });
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
          mapHasLoaded = true;
          map.addImage('selected-pin-icon', createMapIcon('pin'), { pixelRatio: 2 });
          map.addImage('cyclone-map-icon', createMapIcon('cyclone'), { pixelRatio: 2 });
          map.addSource('selected-location', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [location.lon, location.lat] },
              properties: { reading: '' }
            }
          });
          map.addLayer({
            id: 'selected-location-symbol',
            type: 'symbol',
            source: 'selected-location',
            layout: {
              'icon-image': 'selected-pin-icon',
              'icon-size': 0.7,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
              'text-field': ['get', 'reading'],
              'text-offset': [0, -3.35],
              'text-size': 13,
              'text-allow-overlap': true
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#063a56',
              'text-halo-width': 3
            }
          });
          map.addSource('cyclones', {
            type: 'geojson',
            data: emptyFeatureCollection,
            attribution: 'GDACS'
          });
          map.addLayer({
            id: 'cyclones-layer',
            type: 'symbol',
            source: 'cyclones',
            layout: {
              visibility: 'none',
              'icon-image': 'cyclone-map-icon',
              'icon-size': 0.82,
              'icon-allow-overlap': true
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
              properties: { reading: '' }
            });
          });
          setMapReady(true);
          setLoading(false);
          map.resize();
        });
        map.on('error', () => {
          if (!mapHasLoaded) {
            setError(t.mapUnavailable);
            setLoading(false);
          }
        });
      } catch {
        setError(t.mapUnavailable);
        setLoading(false);
      }
    };

    initialize();
    return () => {
      active = false;
      readingAbortRef.current?.abort();
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
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const sourceId = 'weather-field-source';
    const layerId = 'weather-field-layer';
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    if (!fieldRaster) return;
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [fieldRaster.tileUrl],
      tileSize: fieldRaster.tileSize,
      maxzoom: fieldRaster.maxZoom,
      bounds: webMercatorBounds,
      attribution: fieldRaster.attribution
    });
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': satelliteEnabled
          ? Math.min(fieldRaster.opacity, 0.56)
          : fieldRaster.opacity,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear'
      }
    }, firstBaseLabelLayer(map));
  }, [fieldRaster, mapReady, satelliteEnabled]);

  useEffect(() => {
    readingAbortRef.current?.abort();
    setSelectedFieldReading(null);
    if (!pendingLocation || field === 'none') return;
    const controller = new AbortController();
    readingAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      fetchWeatherMapReading(
        pendingLocation,
        field,
        language,
        forecastHour,
        controller.signal
      )
        .then((point) => {
          if (!controller.signal.aborted && point) {
            setSelectedFieldReading({ text: point.label });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setSelectedFieldReading(null);
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    field,
    forecastHour,
    language,
    pendingLocation
  ]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const source = map?.getSource('selected-location') as GeoJSONSource | undefined;
    source?.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [selectedCoordinates.lon, selectedCoordinates.lat] },
      properties: { reading: selectedFieldReading?.text ?? '' }
    });
  }, [
    mapReady,
    selectedCoordinates.lat,
    selectedCoordinates.lon,
    selectedFieldReading?.text
  ]);

  useEffect(() => {
    if (!mapReady || pendingLocation) return;
    const map = mapRef.current;
    if (location.source === 'geolocation') {
      map?.flyTo({
        center: [location.lon, location.lat],
        zoom: Math.max(map.getZoom(), 7)
      });
    }
  }, [location.lat, location.lon, location.source, mapReady, pendingLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setProjection({ type: projection === 'globe' ? 'globe' : 'mercator' });
  }, [mapReady, projection]);

  useEffect(() => {
    if (!mapReady || !radarEnabled || radarFrames.length) return;
    const controller = new AbortController();
    fetchRadarFrames(controller.signal)
      .then((frames) => {
        setRadarFrames(frames);
        setRadarFrameIndex(Math.max(0, frames.length - 1));
        setError('');
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
      maxzoom: 7,
      bounds: webMercatorBounds,
      attribution: 'RainViewer'
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
      raster: ReturnType<typeof satelliteRaster>,
      belowField = false
    ) => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (!enabled) return;
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [raster.tileUrl],
        tileSize: raster.tileSize,
        maxzoom: raster.maxZoom,
        bounds: webMercatorBounds,
        attribution: raster.attribution
      });
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': raster.opacity,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear'
        }
      }, belowField && map.getLayer('weather-field-layer')
        ? 'weather-field-layer'
        : firstBaseLabelLayer(map));
    };

    configureRaster(
      satelliteEnabled,
      'satellite-source',
      'satellite-layer',
      satelliteRaster(),
      true
    );
    configureRaster(
      aerosolEnabled,
      'aerosol-source',
      'aerosol-layer',
      currentAerosolRaster
    );
  }, [aerosolEnabled, currentAerosolRaster, fieldRaster, mapReady, satelliteEnabled]);

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
        setError('');
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
    if (!playing) return;
    if (radarEnabled && radarFrames.length >= 2) {
      playTimerRef.current = window.setInterval(() => {
        setRadarFrameIndex((index) => (index + 1) % radarFrames.length);
      }, 650);
    } else {
      playTimerRef.current = window.setInterval(() => {
        setForecastHourIndex((index) => (index + 1) % futureHours.length);
      }, 2200);
    }
    return () => {
      if (playTimerRef.current) window.clearInterval(playTimerRef.current);
    };
  }, [playing, radarEnabled, radarFrames.length]);

  const mapSourceLabel = radarEnabled
    ? (language === 'ar' ? 'رادار الأمطار · رين فيور' : 'Rain radar · RainViewer')
    : aerosolEnabled
      ? fieldSourceLabel(currentAerosolRaster, language)
      : fieldRaster
        ? fieldSourceLabel(fieldRaster, language)
        : satelliteEnabled
          ? fieldSourceLabel(satelliteRaster(), language)
          : language === 'ar'
            ? 'خريطة الأساس'
            : 'Base map';
  const activeFieldOption = fieldOptions.find((option) => option.key === field);
  const activeMapLegend = radarEnabled
    ? radarLegend
    : aerosolEnabled
      ? currentAerosolRaster.legend
      : fieldRaster?.legend;
  const activeLegendTitle = radarEnabled
    ? (language === 'ar' ? 'رادار الأمطار' : 'Rain radar')
    : aerosolEnabled
      ? (language === 'ar' ? 'الغبار والهباء الجوي' : 'Dust and aerosol')
      : activeFieldOption
        ? (language === 'ar' ? activeFieldOption.ar : activeFieldOption.en)
        : '';
  const activeLegendNote = radarEnabled || aerosolEnabled
    ? undefined
    : language === 'ar'
      ? fieldRaster?.noteAr
      : fieldRaster?.noteEn;

  const radarTime = radarFrames[radarFrameIndex]
    ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date(radarFrames[radarFrameIndex].time * 1000))
    : '';
  const forecastTimeLabel = futureHours[forecastHourIndex] === 0
    ? (language === 'ar' ? 'الآن' : 'Now')
    : `+${futureHours[forecastHourIndex]}h`;

  const changeProjection = (mode: ProjectionMode) => {
    setProjection(mode);
    setPendingLocation(null);
    if (isCompactMapViewport()) setLayersOpen(false);
    mapRef.current?.flyTo({
      center: [location.lon, location.lat],
      zoom: mode === 'globe' ? 1.35 : 5,
      pitch: 0,
      bearing: 0,
      duration: 900
    });
  };

  const toggleRadar = (enabled: boolean) => {
    setError('');
    setRadarEnabled(enabled);
    if (enabled) {
      setAerosolEnabled(false);
      setPlaying(false);
    }
  };

  const toggleAerosol = (enabled: boolean) => {
    setError('');
    setAerosolEnabled(enabled);
    if (enabled) {
      setRadarEnabled(false);
      setPlaying(false);
    }
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
              ? 'خريطة الأساس: بيانات خرائط مفتوحة · حقول الطقس: الأرصاد الألمانية وكوبرنيكوس · الرادار: رين فيور · صور الأقمار: وكالة الفضاء الأمريكية · الأعاصير: نظام الإنذار العالمي'
              : 'Base map: open map data · Weather fields: DWD and CAMS · Radar: RainViewer · Satellite: NASA GIBS · Cyclones: GDACS'}
          </p>
        </div>
      )}

      {layersOpen && (
        <aside className="map-layers-panel glass-card">
          <div className="map-layer-section">
            <strong>{language === 'ar' ? 'مصدر توقعات الموقع المحدد' : 'Selected-location forecast source'}</strong>
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
                  className={[
                    field === option.key ? 'active' : '',
                    option.key === 'none' ? 'field-none-option' : ''
                  ].filter(Boolean).join(' ')}
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
            <label><input type="checkbox" checked={radarEnabled} onChange={(event) => toggleRadar(event.target.checked)} /> {t.radar}</label>
            <label><input type="checkbox" checked={satelliteEnabled} onChange={(event) => setSatelliteEnabled(event.target.checked)} /> {t.satellite}</label>
            <label><input type="checkbox" checked={aerosolEnabled} onChange={(event) => toggleAerosol(event.target.checked)} /> {t.dustLayer}</label>
            <label>
              <input
                type="checkbox"
                checked={cyclonesEnabled}
                onChange={(event) => {
                  setError('');
                  setCyclonesEnabled(event.target.checked);
                }}
              />
              {t.cyclones}
            </label>
            <small className="map-layer-note">
              {language === 'ar'
                ? 'يمكن الجمع بين الأقمار الصناعية والأعاصير وأي حقل طقس. وللحفاظ على السلاسة والوضوح يعمل الرادار أو الهباء الجوي، واحدًا فقط في الوقت نفسه.'
                : 'Satellite, cyclones and any weather field can be combined. For clarity and performance, radar and aerosol are mutually exclusive.'}
            </small>
          </div>
        </aside>
      )}

      <div className="weather-map" ref={containerRef} />

      {activeMapLegend && activeLegendTitle && !pendingLocation && (
        <MapLegendCard
          language={language}
          legend={activeMapLegend}
          note={activeLegendNote}
          title={activeLegendTitle}
        />
      )}

      {pendingLocation && (
        <div className="map-selection-card glass-card" role="status">
          <div className="map-selection-place">
            <strong>{language === 'ar' ? 'موقع محدد على الخريطة' : 'Selected map location'}</strong>
            <span>
              {pendingLocation.lat.toFixed(5)}، {pendingLocation.lon.toFixed(5)}
            </span>
          </div>
          {selectedFieldReading && activeFieldOption && (
            <div className="map-selection-reading">
              <span>{language === 'ar' ? activeFieldOption.ar : activeFieldOption.en}</span>
              <strong>{selectedFieldReading.text}</strong>
              <small>
                {language === 'ar' ? 'قراءة الموقع المحدد' : 'Selected-location reading'}
                {' · '}
                {forecastTimeLabel}
              </small>
            </div>
          )}
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

      {loading && (
        <div className="map-loading">
          <span className="mini-loader" />
          <strong>{t.mapLoading}</strong>
        </div>
      )}

      {!pendingLocation && (
        <div className="map-status glass-card">
          <div><span>{language === 'ar' ? 'المصدر' : 'Source'}</span><strong>{mapSourceLabel}</strong></div>
          <div>
            <span>{language === 'ar' ? 'الزمن' : 'Time'}</span>
            <strong>
              {radarEnabled && radarTime
                ? radarTime
                : forecastTimeLabel}
            </strong>
          </div>
          <div><span>{language === 'ar' ? 'الموقع المختار' : 'Selected location'}</span><strong>{location.name}</strong></div>
        </div>
      )}

      {(field !== 'none' || radarEnabled || aerosolEnabled) && (
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
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? (language === 'ar' ? 'إيقاف الحركة' : 'Pause') : (language === 'ar' ? 'تشغيل الحركة' : 'Play')}
            >
              {playing ? <FiPause /> : <FiPlay />}
            </button>
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
            <small>{language === 'ar' ? 'توقع زمني من مصدر طبقة الخريطة' : 'Timeline from the map-layer source'}</small>
          </>
        )}
      </div>
      )}

      <div className="map-instruction"><FiMapPin /> {t.selectOnMap}</div>
      {error && <div className="map-error">{error}</div>}
    </div>
  );
}
