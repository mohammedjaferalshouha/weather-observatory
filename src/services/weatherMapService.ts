import {
  Language,
  TropicalCycloneFeature,
  WeatherMapField,
  WeatherMapPoint
} from '../types';

const DWD_WMS_URL = 'https://maps.dwd.de/geoserver/dwd/ows';
const ECMWF_WMS_URL = 'https://eccharts.ecmwf.int/wms/';
const READING_CACHE_TTL = 8 * 60 * 1000;
const readingCache = new Map<string, { expiresAt: number; point: WeatherMapPoint }>();

const dwdReadingLayers: Record<
  Exclude<WeatherMapField, 'none' | 'uv' | 'dust'>,
  { elevation?: number; layer: string; style: string }
> = {
  temperature: {
    layer: 'Aicon_reg025_fd_sl_T',
    style: 'aicon_reg025_fd_sl_t2m_wmc_isoarea'
  },
  precipitation: {
    layer: 'Aicon_reg025_fd_sl_TOTPREC06H',
    style: 'aicon_reg025_fd_sl_TOTPREC06H_wmc_isoarea'
  },
  wind: {
    layer: 'Aicon_reg025_fd_sl_UV10M',
    style: 'aicon_reg025_fd_sl_uv10m'
  },
  pressure: {
    layer: 'Aicon_reg025_fd_sl_PMSL',
    style: 'aicon_reg025_fd_sl_pmsl_isoline_label'
  },
  humidity: {
    elevation: 1000,
    layer: 'Icon_reg025_fd_pl_RELHUM',
    style: 'icon_reg025_fd_pl_relhum_wmc_isoarea_scheme'
  },
  clouds: {
    elevation: 700,
    layer: 'Icon_reg025_fd_pl_RELHUM',
    style: 'icon_reg025_fd_pl_relhum_wmc_isoarea_scheme'
  }
};

const forecastTime = (hours: number) => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(Math.floor(date.getUTCHours() / 3) * 3);
  return date.toISOString().replace('.000Z', 'Z');
};

const featureInfoBase = (
  url: string,
  layer: string,
  style: string,
  coordinates: { lat: number; lon: number },
  forecastHour: number
) => {
  const request = new URL(url);
  const bbox = [
    coordinates.lon - 1,
    coordinates.lat - 1,
    coordinates.lon + 1,
    coordinates.lat + 1
  ].join(',');
  request.searchParams.set('service', 'WMS');
  request.searchParams.set('version', '1.1.1');
  request.searchParams.set('request', 'GetFeatureInfo');
  request.searchParams.set('layers', layer);
  request.searchParams.set('query_layers', layer);
  request.searchParams.set('styles', style);
  request.searchParams.set('srs', 'EPSG:4326');
  request.searchParams.set('bbox', bbox);
  request.searchParams.set('width', '101');
  request.searchParams.set('height', '101');
  request.searchParams.set('x', '50');
  request.searchParams.set('y', '50');
  request.searchParams.set('info_format', 'application/json');
  request.searchParams.set('time', forecastTime(forecastHour));
  return request;
};

const labelFor = (
  field: WeatherMapField,
  value: number,
  language: Language,
  direction?: number
) => {
  if (field === 'temperature') return `${Math.round(value)}°`;
  if (field === 'precipitation') {
    return `${value.toFixed(value < 1 ? 1 : 0)} ${language === 'ar' ? 'ملم/6س' : 'mm/6h'}`;
  }
  if (field === 'clouds' || field === 'humidity') return `${Math.round(value)}٪`;
  if (field === 'wind') {
    const directions = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const arrow = direction === undefined ? '' : `${directions[Math.round(direction / 45) % 8]} `;
    return `${arrow}${Math.round(value)} ${language === 'ar' ? 'كم/س' : 'km/h'}`;
  }
  if (field === 'pressure') {
    return `${Math.round(value)} ${language === 'ar' ? 'هكتوباسكال' : 'hPa'}`;
  }
  if (field === 'uv') return value.toFixed(1);
  if (field === 'dust') {
    return `${value.toFixed(2)} ${language === 'ar' ? 'عمق بصري' : 'AOD'}`;
  }
  return String(Math.round(value));
};

const fetchJson = async (url: URL, signal: AbortSignal | undefined) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`MAP_READING_FAILED_${response.status}`);
  return response.json();
};

/**
 * Fetches one value only for the location selected by the user.
 * It never participates in drawing the weather map, so a failed reading cannot
 * hide, crop or retry the global raster layer.
 */
export async function fetchWeatherMapReading(
  coordinates: { lat: number; lon: number },
  field: WeatherMapField,
  language: Language,
  forecastHour = 0,
  signal?: AbortSignal
): Promise<WeatherMapPoint | null> {
  if (field === 'none') return null;
  const cacheKey = [
    coordinates.lat.toFixed(3),
    coordinates.lon.toFixed(3),
    field,
    language,
    forecastHour
  ].join('|');
  const cached = readingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.point;

  let value: number;
  let direction: number | undefined;

  if (field === 'uv' || field === 'dust') {
    const layer = field === 'uv' ? 'composition_uvindex' : 'composition_duaod550';
    const style = field === 'uv' ? 'sh_all_uvindex' : 'sh_Oranges_aod';
    const url = featureInfoBase(
      ECMWF_WMS_URL,
      layer,
      style,
      coordinates,
      forecastHour
    );
    url.searchParams.set('token', 'public');
    const payload = await fetchJson(url, signal);
    const data = payload.Probes?.[0]?.Value?.Data;
    if (typeof data !== 'number' || !Number.isFinite(data)) {
      throw new Error('MAP_READING_EMPTY');
    }
    value = data;
  } else {
    const layer = dwdReadingLayers[field];
    const url = featureInfoBase(
      DWD_WMS_URL,
      `dwd:${layer.layer}`,
      layer.style,
      coordinates,
      forecastHour
    );
    if (layer.elevation !== undefined) {
      url.searchParams.set('elevation', String(layer.elevation));
    }
    const payload = await fetchJson(url, signal);
    const properties = (payload.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    if (field === 'wind') {
      const u = Number(properties.u);
      const v = Number(properties.v);
      if (!Number.isFinite(u) || !Number.isFinite(v)) {
        throw new Error('MAP_READING_EMPTY');
      }
      value = Math.hypot(u, v) * 3.6;
      direction = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    } else {
      const numericProperty = Object.entries(properties).find(
        ([key, candidate]) => key !== 'ELEVATION'
          && typeof candidate === 'number'
          && Number.isFinite(candidate)
      );
      if (!numericProperty) {
        if (field === 'precipitation') value = 0;
        else throw new Error('MAP_READING_EMPTY');
      } else {
        value = numericProperty[1] as number;
      }
    }
  }

  const point: WeatherMapPoint = {
    lat: coordinates.lat,
    lon: coordinates.lon,
    value,
    direction,
    label: labelFor(field, value, language, direction),
    color: ''
  };
  readingCache.set(cacheKey, {
    expiresAt: Date.now() + READING_CACHE_TTL,
    point
  });
  if (readingCache.size > 48) {
    readingCache.delete(readingCache.keys().next().value as string);
  }
  return point;
}

export async function fetchActiveCyclones(
  signal?: AbortSignal
): Promise<TropicalCycloneFeature[]> {
  const response = await fetch('/.netlify/functions/getCyclones', { signal });
  if (!response.ok) throw new Error('CYCLONES_FAILED');
  const payload = await response.json();
  const features = Array.isArray(payload.features) ? payload.features : [];
  return features
    .filter((feature: Record<string, unknown>) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const current = properties.iscurrent;
      return current === undefined || String(current).toLowerCase() === 'true';
    })
    .map((feature: Record<string, unknown>) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const geometry = (feature.geometry ?? {}) as Record<string, unknown>;
      const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [0, 0];
      const severityData = (properties.severitydata ?? {}) as Record<string, unknown>;
      return {
        id: `${properties.eventid ?? ''}-${properties.episodeid ?? ''}`,
        name: String(properties.eventname ?? properties.name ?? 'Tropical cyclone'),
        lon: Number(coordinates[0]) || 0,
        lat: Number(coordinates[1]) || 0,
        severity: severityData.severitytext
          ? String(severityData.severitytext)
          : String(properties.alertlevel ?? ''),
        fromDate: properties.fromdate ? String(properties.fromdate) : undefined
      };
    });
}

export async function fetchRadarFrames(
  signal?: AbortSignal
): Promise<Array<{ host: string; path: string; time: number }>> {
  const response = await fetch(
    'https://api.rainviewer.com/public/weather-maps.json',
    { signal }
  );
  if (!response.ok) throw new Error('RADAR_FAILED');
  const payload = await response.json();
  const frames = payload.radar?.past ?? [];
  if (!frames.length) throw new Error('RADAR_EMPTY');
  return frames.map((frame: Record<string, unknown>) => ({
    host: String(payload.host),
    path: String(frame.path),
    time: Number(frame.time)
  }));
}
