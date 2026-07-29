export type Language = 'ar' | 'en';
export type TemperatureUnit = 'c' | 'f';
export type WindUnit = 'kmh' | 'mph';
export type TimeFormat = '12' | '24';
export type WeatherModelKey = 'ecmwf' | 'gfs' | 'icon' | 'gem' | 'jma';
export type ForecastSource = 'blend' | 'custom' | WeatherModelKey;
export type ComparisonRange = 'common' | 'full';
export type ModelWorkspaceMode = 'compare' | 'blend';
export type WeatherTheme =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'dust'
  | 'night';

export interface Coordinates {
  lat: number;
  lon: number;
  name?: string;
  country?: string;
  countryCode?: string;
  admin1?: string;
  source?: 'search' | 'coordinates' | 'geolocation';
}

export interface GeocodingResult {
  id?: number;
  name: string;
  country: string;
  countryCode: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface ModelTemperature {
  ecmwf: number | null;
  gfs: number | null;
  icon: number | null;
  gem: number | null;
  jma: number | null;
}

export interface CurrentWeather {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  weathercode: number;
  is_day: boolean;
  windspeed_10m: number;
  winddirection_10m: number;
  windgusts_10m: number;
  relativehumidity_2m: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  cloudcover: number;
  pressure_msl: number;
}

export interface HourlyForecast {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  weathercode: number;
  windspeed_10m: number;
  winddirection_10m: number;
  windgusts_10m: number;
  relativehumidity_2m: number;
  precipitation_probability: number;
  precipitation: number;
  rain: number;
  cloudcover: number;
  visibility: number;
  pressure_msl: number;
  uv_index: number;
  modelTemps: ModelTemperature;
  modelPrecipitationProbabilities: ModelTemperature;
  modelPrecipitation: ModelTemperature;
  modelWeatherCodes: ModelTemperature;
  modelWindSpeeds: ModelTemperature;
  modelHumidity: ModelTemperature;
}

export interface DailyForecast {
  date: string;
  weathercode: number;
  temperature_2m_max: number;
  temperature_2m_min: number;
  apparent_temperature_max: number;
  apparent_temperature_min: number;
  precipitation_sum: number;
  precipitation_probability_max: number;
  precipitation_hours: number;
  windspeed_10m_max: number;
  windgusts_10m_max: number;
  winddirection_10m_dominant: number;
  uv_index_max: number;
  sunrise: string;
  sunset: string;
  daylight_duration: number;
  sunshine_duration: number;
  modelMaxTemps: ModelTemperature;
  modelMinTemps: ModelTemperature;
  modelPrecipitation: ModelTemperature;
  modelWeatherCodes: ModelTemperature;
  hourly: HourlyForecast[];
}

export interface WeatherData {
  current: CurrentWeather;
  modelTemps: ModelTemperature;
  daily: DailyForecast[];
  timezone: string;
  timezoneAbbreviation?: string;
  utcOffsetSeconds?: number;
  locationName: string;
  allHourly: HourlyForecast[];
  fetchedAt: string;
}

export interface ExternalCurrent {
  time: string;
  temperature_2m: number;
  weathercode: number;
  windspeed_10m: number;
  relativehumidity_2m: number;
  precipitation: number;
  rain: number;
  feelslike: number;
  condition: string;
}

export interface ExternalWeatherData {
  current: ExternalCurrent;
  daily: Array<{
    date: string;
    weathercode: number;
    temperature_2m_max: number;
    temperature_2m_min: number;
    precipitation_sum: number;
    hourly?: Array<Partial<HourlyForecast>>;
  }>;
}

export interface CombinedWeatherData {
  openMeteo: WeatherData | null;
  visualCrossing: ExternalWeatherData | null;
  weatherApiCom: ExternalWeatherData | null;
}

export interface UserSettings {
  language: Language;
  temperature: TemperatureUnit;
  wind: WindUnit;
  time: TimeFormat;
  reducedMotion: boolean;
}

export type WeatherMapField =
  | 'none'
  | 'temperature'
  | 'precipitation'
  | 'clouds'
  | 'wind'
  | 'humidity'
  | 'pressure'
  | 'uv'
  | 'dust';

export interface WeatherMapPoint {
  lat: number;
  lon: number;
  value: number;
  secondary?: number;
  direction?: number;
  label: string;
  color: string;
}

export interface TropicalCycloneFeature {
  id: string;
  name: string;
  lat: number;
  lon: number;
  severity?: string;
  fromDate?: string;
}
