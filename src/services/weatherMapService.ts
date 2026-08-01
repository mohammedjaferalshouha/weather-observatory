import { weatherModels } from '../constants';
import {
  ForecastSource,
  Language,
  TropicalCycloneFeature,
  WeatherMapField,
  WeatherMapPoint,
  WeatherModelKey
} from '../types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CYCLONES_URL = 'https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH?eventlist=TC';

export interface MapBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

const variableForField: Record<Exclude<WeatherMapField, 'none' | 'dust'>, string> = {
  temperature: 'temperature_2m',
  precipitation: 'precipitation',
  clouds: 'cloud_cover',
  wind: 'wind_speed_10m',
  humidity: 'relative_humidity_2m',
  pressure: 'pressure_msl',
  uv: 'uv_index'
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const colorFor = (field: WeatherMapField, value: number) => {
  if (field === 'temperature') {
    if (value <= 0) return '#7dd3fc';
    if (value <= 15) return '#34d399';
    if (value <= 25) return '#facc15';
    if (value <= 35) return '#fb923c';
    return '#ef4444';
  }
  if (field === 'precipitation') {
    if (value < 0.1) return '#6b8294';
    if (value < 1) return '#38bdf8';
    if (value < 5) return '#2563eb';
    if (value < 15) return '#8b5cf6';
    return '#ef4444';
  }
  if (field === 'clouds') return `rgba(226, 241, 251, ${0.28 + clamp(value / 100, 0, 1) * 0.68})`;
  if (field === 'wind') {
    if (value < 15) return '#5eead4';
    if (value < 30) return '#facc15';
    if (value < 50) return '#fb923c';
    return '#ef4444';
  }
  if (field === 'humidity') {
    if (value < 30) return '#fbbf24';
    if (value < 60) return '#38bdf8';
    return '#2563eb';
  }
  if (field === 'pressure') {
    if (value < 995) return '#8b5cf6';
    if (value < 1010) return '#38bdf8';
    if (value < 1025) return '#34d399';
    return '#facc15';
  }
  if (field === 'uv') {
    if (value < 3) return '#22c55e';
    if (value < 6) return '#eab308';
    if (value < 8) return '#f97316';
    if (value < 11) return '#ef4444';
    return '#a855f7';
  }
  if (field === 'dust') {
    if (value < 10) return '#cbd5e1';
    if (value < 40) return '#eab308';
    if (value < 100) return '#f97316';
    return '#dc2626';
  }
  return '#64d8ff';
};

const labelFor = (field: WeatherMapField, value: number, language: Language, direction?: number) => {
  if (field === 'temperature') return `${Math.round(value)}°`;
  if (field === 'precipitation') return `${value.toFixed(value < 1 ? 1 : 0)} ${language === 'ar' ? 'ملم' : 'mm'}`;
  if (field === 'clouds' || field === 'humidity') return `${Math.round(value)}٪`;
  if (field === 'wind') {
    const arrow = direction === undefined ? '' : `${['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(direction / 45) % 8]} `;
    return `${arrow}${Math.round(value)} ${language === 'ar' ? 'كم/س' : 'km/h'}`;
  }
  if (field === 'pressure') return `${Math.round(value)}`;
  if (field === 'uv') return value.toFixed(1);
  if (field === 'dust') return `${Math.round(value)} ${language === 'ar' ? 'مكغ/م³' : 'µg/m³'}`;
  return String(Math.round(value));
};

const normalizeLongitude = (value: number) => {
  let longitude = value;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return longitude;
};

const averageDirection = (directions: number[]) => {
  if (!directions.length) return undefined;
  const vectors = directions.reduce(
    (sum, direction) => {
      const radians = (direction * Math.PI) / 180;
      return { x: sum.x + Math.cos(radians), y: sum.y + Math.sin(radians) };
    },
    { x: 0, y: 0 }
  );
  return (Math.atan2(vectors.y, vectors.x) * 180 / Math.PI + 360) % 360;
};

function gridForBounds(bounds: MapBounds, zoom: number, dense = false) {
  // Keep the field smooth without creating an unbounded request at high zoom.
  const columns = dense ? (zoom < 2 ? 16 : zoom < 5 ? 14 : 12) : (zoom < 2 ? 10 : zoom < 5 ? 9 : 8);
  const rows = dense ? (zoom < 2 ? 10 : zoom < 5 ? 9 : 8) : (zoom < 2 ? 7 : zoom < 5 ? 6 : 5);
  const south = clamp(bounds.south, -75, 75);
  const north = clamp(bounds.north, -75, 75);
  let west = bounds.west;
  let east = bounds.east;
  if (east <= west) east += 360;
  if (east - west > 350) {
    west = -180;
    east = 180;
  }

  const points: Array<{ lat: number; lon: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lat = south + ((north - south) * (row + 0.5)) / rows;
      const lon = west + ((east - west) * (column + 0.5)) / columns;
      points.push({ lat, lon: normalizeLongitude(lon) });
    }
  }
  return points;
}

function gridForGlobe(center: { lat: number; lon: number }) {
  const latitudeOffsets = [-55, -30, -5, 20, 45, 65];
  const longitudeOffsets = [-75, -50, -25, 0, 25, 50, 75];
  return latitudeOffsets.flatMap((latitudeOffset) =>
    longitudeOffsets.map((longitudeOffset) => ({
      lat: clamp(center.lat + latitudeOffset, -70, 70),
      lon: normalizeLongitude(center.lon + longitudeOffset)
    }))
  );
}

const modelsForSource = (source: ForecastSource, customModels: WeatherModelKey[]) => {
  if (source === 'blend') return weatherModels.map((model) => model.key);
  if (source === 'custom') return customModels.length ? customModels : weatherModels.map((model) => model.key);
  return [source];
};

const numericValues = (
  hourly: Record<string, unknown>,
  variable: string,
  modelKeys: WeatherModelKey[],
  index: number
) => {
  const values: number[] = [];
  for (const key of modelKeys) {
    const model = weatherModels.find((candidate) => candidate.key === key);
    if (!model) continue;
    const suffixed = (hourly[`${variable}_${model.apiName}`] as unknown[] | undefined)?.[index];
    const plain = (hourly[variable] as unknown[] | undefined)?.[index];
    const value = typeof suffixed === 'number' ? suffixed : typeof plain === 'number' && modelKeys.length === 1 ? plain : null;
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  return values;
};

export async function fetchWeatherMapPoints(
  bounds: MapBounds,
  zoom: number,
  field: WeatherMapField,
  source: ForecastSource,
  customModels: WeatherModelKey[],
  language: Language,
  forecastHour = 0,
  signal?: AbortSignal,
  globeCenter?: { lat: number; lon: number },
  selectedLocation?: { lat: number; lon: number }
): Promise<WeatherMapPoint[]> {
  if (field === 'none') return [];
  const sampledGrid = globeCenter ? gridForGlobe(globeCenter) : gridForBounds(bounds, zoom, field === 'dust');
  const selectedPoint = selectedLocation
    ? {
        lat: clamp(selectedLocation.lat, -90, 90),
        lon: normalizeLongitude(selectedLocation.lon)
      }
    : undefined;
  const grid = field === 'temperature' && selectedPoint
    ? [selectedPoint]
    : selectedPoint
    ? [
        ...sampledGrid,
        selectedPoint
      ]
    : sampledGrid;
  const latitudes = grid.map((point) => point.lat.toFixed(4)).join(',');
  const longitudes = grid.map((point) => point.lon.toFixed(4)).join(',');

  if (field === 'dust') {
    const url = new URL(AIR_QUALITY_URL);
    url.searchParams.set('latitude', latitudes);
    url.searchParams.set('longitude', longitudes);
    url.searchParams.set('current', 'dust,pm10');
    url.searchParams.set('timezone', 'auto');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('AIR_MAP_FAILED');
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [payload];
    return rows.map((row: Record<string, unknown>, index: number) => {
      const current = (row.current ?? {}) as Record<string, unknown>;
      const value = typeof current.dust === 'number'
        ? current.dust
        : typeof current.pm10 === 'number'
          ? current.pm10
          : 0;
      return {
        ...grid[index],
        value,
        label: labelFor(field, value, language),
        color: colorFor(field, value)
      };
    });
  }

  const variable = variableForField[field];
  const modelKeys = modelsForSource(source, customModels);
  const modelNames = modelKeys
    .map((key) => weatherModels.find((model) => model.key === key)?.apiName)
    .filter((value): value is string => Boolean(value));
  const variables = field === 'wind' ? `${variable},wind_direction_10m` : variable;

  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', latitudes);
  url.searchParams.set('longitude', longitudes);
  url.searchParams.set('hourly', variables);
  url.searchParams.set('forecast_hours', String(Math.max(1, forecastHour + 1)));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('models', modelNames.join(','));

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('WEATHER_MAP_FAILED');
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [payload];

  return rows.map((row: Record<string, unknown>, index: number) => {
    const hourly = (row.hourly ?? {}) as Record<string, unknown>;
    const values = numericValues(hourly, variable, modelKeys, forecastHour);
    const value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
    const directions = field === 'wind'
      ? numericValues(hourly, 'wind_direction_10m', modelKeys, forecastHour)
      : [];
    const direction = averageDirection(directions);
    return {
      ...grid[index],
      value,
      direction,
      label: labelFor(field, value, language, direction),
      color: colorFor(field, value)
    };
  });
}

export async function fetchActiveCyclones(signal?: AbortSignal): Promise<TropicalCycloneFeature[]> {
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
        severity: severityData.severitytext ? String(severityData.severitytext) : String(properties.alertlevel ?? ''),
        fromDate: properties.fromdate ? String(properties.fromdate) : undefined
      };
    });
}

export async function fetchRadarFrames(signal?: AbortSignal): Promise<Array<{ host: string; path: string; time: number }>> {
  const response = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal });
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
