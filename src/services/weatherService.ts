import {
  Coordinates,
  CurrentWeather,
  DailyForecast,
  GeocodingResult,
  HourlyForecast,
  Language,
  ModelTemperature,
  WeatherData
} from '../types';
import { weatherModels } from '../constants';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_GEOCODING_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const MODEL_NAMES = weatherModels.map((model) => model.apiName);

const numeric = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const modelValues = (container: Record<string, unknown>, key: string, index: number): ModelTemperature => ({
  ecmwf: typeof (container[`${key}_ecmwf_ifs`] as number[] | undefined)?.[index] === 'number'
    ? (container[`${key}_ecmwf_ifs`] as number[])[index]
    : null,
  gfs: typeof (container[`${key}_gfs_seamless`] as number[] | undefined)?.[index] === 'number'
    ? (container[`${key}_gfs_seamless`] as number[])[index]
    : null,
  icon: typeof (container[`${key}_icon_seamless`] as number[] | undefined)?.[index] === 'number'
    ? (container[`${key}_icon_seamless`] as number[])[index]
    : null,
  gem: typeof (container[`${key}_gem_global`] as number[] | undefined)?.[index] === 'number'
    ? (container[`${key}_gem_global`] as number[])[index]
    : null,
  jma: typeof (container[`${key}_jma_gsm`] as number[] | undefined)?.[index] === 'number'
    ? (container[`${key}_jma_gsm`] as number[])[index]
    : null
});

const averageModels = (models: ModelTemperature, fallback = 0): number => {
  const values = weatherModels.map((model) => models[model.key]).filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
};

const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

export const normalizeDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)));

const stripArabicMarks = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .trim();

const arabicQueryVariants = (query: string) => {
  const clean = stripArabicMarks(query);
  const variants = new Set([clean]);
  if (/^[اإأآ]/.test(clean)) {
    const rest = clean.slice(1);
    ['ا', 'إ', 'أ', 'آ'].forEach((letter) => variants.add(`${letter}${rest}`));
  }
  if (clean.endsWith('ه')) variants.add(`${clean.slice(0, -1)}ة`);
  return [...variants];
};

const mapGeocodingResult = (result: Record<string, unknown>): GeocodingResult => ({
  id: numeric(result.id),
  name: String(result.name ?? ''),
  country: String(result.country ?? ''),
  countryCode: String(result.country_code ?? ''),
  admin1: result.admin1 ? String(result.admin1) : undefined,
  latitude: numeric(result.latitude),
  longitude: numeric(result.longitude),
  timezone: result.timezone ? String(result.timezone) : undefined
});

export function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const value = normalizeDigits(input).replace(/،/g, ',').trim();
  const mapUrlMatch = value.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const queryMatch = value.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s+)(-?\d+(?:\.\d+)?)/i);
  const plainMatch = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  const match = mapUrlMatch ?? queryMatch ?? plainMatch;
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  return { lat, lon };
}

export async function reverseGeocode(coords: Pick<Coordinates, 'lat' | 'lon'>, language: Language): Promise<Coordinates> {
  const url = new URL(REVERSE_GEOCODING_URL);
  url.searchParams.set('latitude', String(coords.lat));
  url.searchParams.set('longitude', String(coords.lon));
  url.searchParams.set('localityLanguage', language);
  const response = await fetch(url);
  if (!response.ok) throw new Error('REVERSE_GEOCODING_FAILED');
  const data = await response.json();
  const name = String(data.locality || data.city || data.principalSubdivision || '').trim();
  return {
    lat: coords.lat,
    lon: coords.lon,
    name: name || (language === 'ar' ? 'موقع محدد بالإحداثيات' : 'Location by coordinates'),
    admin1: data.principalSubdivision ? String(data.principalSubdivision) : undefined,
    country: data.countryName ? String(data.countryName) : undefined,
    countryCode: data.countryCode ? String(data.countryCode) : undefined
  };
}

export async function searchCities(query: string, language: Language): Promise<GeocodingResult[]> {
  if (query.trim().length < 2) return [];
  const variants = language === 'ar' ? arabicQueryVariants(query) : [query.trim()];
  const responses = await Promise.all(
    variants.map(async (variant) => {
      const url = new URL(GEOCODING_URL);
      url.searchParams.set('name', variant);
      url.searchParams.set('count', '8');
      url.searchParams.set('language', language);
      url.searchParams.set('format', 'json');
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.results ?? []).map(mapGeocodingResult);
    })
  );
  const seen = new Set<string>();
  return responses.flat().filter((result) => {
    const key = `${result.latitude.toFixed(4)}:${result.longitude.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function buildPrimaryUrl(coords: Coordinates): URL {
  const url = new URL(WEATHER_URL);
  url.searchParams.set('latitude', String(coords.lat));
  url.searchParams.set('longitude', String(coords.lon));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m'
    ].join(',')
  );
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'rain',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'uv_index'
    ].join(',')
  );
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'sunrise',
      'sunset',
      'daylight_duration',
      'sunshine_duration',
      'precipitation_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
      'uv_index_max'
    ].join(',')
  );
  return url;
}

function buildModelsUrl(coords: Coordinates): URL {
  const url = new URL(WEATHER_URL);
  url.searchParams.set('latitude', String(coords.lat));
  url.searchParams.set('longitude', String(coords.lon));
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '16');
  url.searchParams.set('models', MODEL_NAMES.join(','));
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,relative_humidity_2m'
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'
  );
  return url;
}

export async function fetchWeatherData(coords: Coordinates): Promise<WeatherData> {
  const [primaryResponse, modelsResponse] = await Promise.all([
    fetch(buildPrimaryUrl(coords)),
    fetch(buildModelsUrl(coords))
  ]);

  if (!primaryResponse.ok || !modelsResponse.ok) throw new Error('WEATHER_FAILED');

  const [primary, models] = await Promise.all([primaryResponse.json(), modelsResponse.json()]);
  const currentHourPrefix = String(primary.current.time).slice(0, 13);
  const currentIndex = Math.max(
    0,
    models.hourly.time.findIndex((time: string) => time.startsWith(currentHourPrefix))
  );
  const currentModels = modelValues(models.hourly, 'temperature_2m', currentIndex);

  const current: CurrentWeather = {
    time: primary.current.time,
    temperature_2m: numeric(primary.current.temperature_2m),
    apparent_temperature: numeric(primary.current.apparent_temperature),
    weathercode: numeric(primary.current.weather_code),
    is_day: Boolean(primary.current.is_day),
    windspeed_10m: numeric(primary.current.wind_speed_10m),
    winddirection_10m: numeric(primary.current.wind_direction_10m),
    windgusts_10m: numeric(primary.current.wind_gusts_10m),
    relativehumidity_2m: numeric(primary.current.relative_humidity_2m),
    precipitation: numeric(primary.current.precipitation),
    rain: numeric(primary.current.rain),
    showers: numeric(primary.current.showers),
    snowfall: numeric(primary.current.snowfall),
    cloudcover: numeric(primary.current.cloud_cover),
    pressure_msl: numeric(primary.current.pressure_msl)
  };

  const allHourly: HourlyForecast[] = primary.hourly.time.map((time: string, index: number) => {
    const modelIndex = models.hourly.time.indexOf(time);
    const hourlyModels =
      modelIndex >= 0 ? modelValues(models.hourly, 'temperature_2m', modelIndex) : {
        ecmwf: null,
        gfs: null,
        icon: null,
        gem: null,
        jma: null
      };

    return {
      time,
      temperature_2m: numeric(primary.hourly.temperature_2m[index]),
      apparent_temperature: numeric(primary.hourly.apparent_temperature[index]),
      weathercode: numeric(primary.hourly.weather_code[index]),
      windspeed_10m: numeric(primary.hourly.wind_speed_10m[index]),
      winddirection_10m: numeric(primary.hourly.wind_direction_10m[index]),
      windgusts_10m: numeric(primary.hourly.wind_gusts_10m[index]),
      relativehumidity_2m: numeric(primary.hourly.relative_humidity_2m[index]),
      precipitation_probability: numeric(primary.hourly.precipitation_probability[index]),
      precipitation: numeric(primary.hourly.precipitation[index]),
      rain: numeric(primary.hourly.rain[index]),
      cloudcover: numeric(primary.hourly.cloud_cover[index]),
      visibility: numeric(primary.hourly.visibility[index]),
      pressure_msl: numeric(primary.hourly.pressure_msl[index]),
      uv_index: numeric(primary.hourly.uv_index[index]),
      modelTemps: hourlyModels,
      modelPrecipitationProbabilities: modelIndex >= 0
        ? modelValues(models.hourly, 'precipitation_probability', modelIndex)
        : { ecmwf: null, gfs: null, icon: null, gem: null, jma: null },
      modelPrecipitation: modelIndex >= 0
        ? modelValues(models.hourly, 'precipitation', modelIndex)
        : { ecmwf: null, gfs: null, icon: null, gem: null, jma: null },
      modelWeatherCodes: modelIndex >= 0
        ? modelValues(models.hourly, 'weather_code', modelIndex)
        : { ecmwf: null, gfs: null, icon: null, gem: null, jma: null },
      modelWindSpeeds: modelIndex >= 0
        ? modelValues(models.hourly, 'wind_speed_10m', modelIndex)
        : { ecmwf: null, gfs: null, icon: null, gem: null, jma: null },
      modelHumidity: modelIndex >= 0
        ? modelValues(models.hourly, 'relative_humidity_2m', modelIndex)
        : { ecmwf: null, gfs: null, icon: null, gem: null, jma: null }
    };
  });

  const daily: DailyForecast[] = primary.daily.time.map((date: string, index: number) => {
    const modelIndex = models.daily.time.indexOf(date);
    const maxModels =
      modelIndex >= 0 ? modelValues(models.daily, 'temperature_2m_max', modelIndex) : currentModels;
    const minModels =
      modelIndex >= 0 ? modelValues(models.daily, 'temperature_2m_min', modelIndex) : currentModels;
    const precipitationModels =
      modelIndex >= 0 ? modelValues(models.daily, 'precipitation_sum', modelIndex) : {
        ecmwf: null,
        gfs: null,
        icon: null,
        gem: null,
        jma: null
      };
    const weatherCodeModels =
      modelIndex >= 0 ? modelValues(models.daily, 'weather_code', modelIndex) : {
        ecmwf: null,
        gfs: null,
        icon: null,
        gem: null,
        jma: null
      };

    return {
      date,
      weathercode: numeric(primary.daily.weather_code[index]),
      temperature_2m_max: averageModels(maxModels, numeric(primary.daily.temperature_2m_max[index])),
      temperature_2m_min: averageModels(minModels, numeric(primary.daily.temperature_2m_min[index])),
      apparent_temperature_max: numeric(primary.daily.apparent_temperature_max[index]),
      apparent_temperature_min: numeric(primary.daily.apparent_temperature_min[index]),
      precipitation_sum: averageModels(
        precipitationModels,
        numeric(primary.daily.precipitation_sum[index])
      ),
      precipitation_probability_max: numeric(primary.daily.precipitation_probability_max[index]),
      precipitation_hours: numeric(primary.daily.precipitation_hours[index]),
      windspeed_10m_max: numeric(primary.daily.wind_speed_10m_max[index]),
      windgusts_10m_max: numeric(primary.daily.wind_gusts_10m_max[index]),
      winddirection_10m_dominant: numeric(primary.daily.wind_direction_10m_dominant[index]),
      uv_index_max: numeric(primary.daily.uv_index_max[index]),
      sunrise: primary.daily.sunrise[index],
      sunset: primary.daily.sunset[index],
      daylight_duration: numeric(primary.daily.daylight_duration[index]),
      sunshine_duration: numeric(primary.daily.sunshine_duration[index]),
      modelMaxTemps: maxModels,
      modelMinTemps: minModels,
      modelPrecipitation: precipitationModels,
      modelWeatherCodes: weatherCodeModels,
      hourly: allHourly.filter((hour) => hour.time.startsWith(date))
    };
  });

  return {
    current,
    modelTemps: currentModels,
    daily,
    timezone: primary.timezone,
    timezoneAbbreviation: primary.timezone_abbreviation,
    utcOffsetSeconds: primary.utc_offset_seconds,
    locationName: coords.name ?? 'الموقع الحالي',
    allHourly,
    fetchedAt: new Date().toISOString()
  };
}
