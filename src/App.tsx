import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiChevronDown,
  FiClipboard,
  FiActivity,
  FiCloud,
  FiCompass,
  FiDownload,
  FiDroplet,
  FiEye,
  FiGlobe,
  FiHeart,
  FiLayers,
  FiMap,
  FiMapPin,
  FiMenu,
  FiRefreshCw,
  FiSettings,
  FiShare2,
  FiSun,
  FiSunrise,
  FiSunset,
  FiThermometer,
  FiWind,
  FiX
} from 'react-icons/fi';
import { WiCloudy, WiRaindrop, WiStrongWind } from 'react-icons/wi';
import HourlyChart from './components/HourlyChart';
import ModelChart from './components/ModelChart';
import SearchBar from './components/SearchBar';
import CountryFlag from './components/CountryFlag';
import WeatherIcon from './components/WeatherIcon';
import WeatherModal from './components/WeatherModal';
import WeatherScene from './components/WeatherScene';
import { getWeatherDescription, getWeatherTheme, translations, weatherModels } from './constants';
import { fetchVisualCrossingData } from './services/visualCrossingService';
import { fetchWeatherApiComData } from './services/weatherApiComService';
import { fetchWeatherData, reverseGeocode } from './services/weatherService';
import { buildForecastOutlook, resolveForecastDay } from './utils/forecastOutlook';
import {
  CombinedWeatherData,
  ComparisonRange,
  Coordinates,
  DailyForecast,
  ForecastSource,
  HourlyForecast,
  TemperatureUnit,
  UserSettings,
  WeatherData,
  WeatherModelKey,
  WindUnit
} from './types';

const WeatherMap = lazy(() => import('./components/WeatherMap'));

const DEFAULT_LOCATION: Coordinates = {
  lat: 31.9539,
  lon: 35.9106,
  name: 'عمّان',
  country: 'الأردن',
  countryCode: 'JO'
};

const DEFAULT_SETTINGS: UserSettings = {
  language: 'ar',
  temperature: 'c',
  wind: 'kmh',
  time: '12',
  reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
};

const cleanStoredLocation = (value: Coordinates): Coordinates => ({
  ...value,
  name: value.name?.split(/[،,]/)[0].trim()
});

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

const toTemperature = (value: number, unit: TemperatureUnit) =>
  unit === 'f' ? (value * 9) / 5 + 32 : value;

const toWind = (value: number, unit: WindUnit) =>
  unit === 'mph' ? value * 0.621371 : value;

const uniqueLocations = (locations: Coordinates[]) => {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.lat.toFixed(3)}:${location.lon.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const averageValues = (values: Array<number | null>) => {
  const available = values.filter((value): value is number => value !== null);
  return available.length
    ? available.reduce((sum, value) => sum + value, 0) / available.length
    : null;
};

const averageModelField = (
  values: HourlyForecast['modelTemps'] | undefined,
  keys: WeatherModelKey[]
) => values
  ? averageValues(keys.map((key) => values[key]))
  : null;

const mostCommonModelValue = (
  values: HourlyForecast['modelTemps'] | undefined,
  keys: WeatherModelKey[]
) => {
  if (!values) return null;
  const counts = new Map<number, number>();
  keys.forEach((key) => {
    const value = values[key];
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const applyHourlySource = (hour: HourlyForecast, requestedKeys: WeatherModelKey[]): HourlyForecast => {
  const participantKeys = requestedKeys.filter((key) => typeof hour.modelTemps?.[key] === 'number');
  if (!participantKeys.length) return hour;
  return {
    ...hour,
    temperature_2m: averageModelField(hour.modelTemps, participantKeys) ?? hour.temperature_2m,
    precipitation_probability:
      averageModelField(hour.modelPrecipitationProbabilities, participantKeys)
      ?? hour.precipitation_probability,
    precipitation:
      averageModelField(hour.modelPrecipitation, participantKeys)
      ?? hour.precipitation,
    weathercode:
      mostCommonModelValue(hour.modelWeatherCodes, participantKeys)
      ?? hour.weathercode,
    windspeed_10m:
      averageModelField(hour.modelWindSpeeds, participantKeys)
      ?? hour.windspeed_10m,
    relativehumidity_2m:
      averageModelField(hour.modelHumidity, participantKeys)
      ?? hour.relativehumidity_2m
  };
};

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function App() {
  const [weather, setWeather] = useState<CombinedWeatherData>({
    openMeteo: null,
    visualCrossing: null,
    weatherApiCom: null
  });
  const [location, setLocation] = useState<Coordinates>(() =>
    cleanStoredLocation(readStorage('weather:last-location', DEFAULT_LOCATION))
  );
  const [settings, setSettings] = useState<UserSettings>(() =>
    readStorage('weather:settings', DEFAULT_SETTINGS)
  );
  const [favorites, setFavorites] = useState<Coordinates[]>(() =>
    readStorage<Coordinates[]>('weather:favorites', []).map(cleanStoredLocation)
  );
  const [recent, setRecent] = useState<Coordinates[]>(() =>
    readStorage<Coordinates[]>('weather:recent', []).map(cleanStoredLocation)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DailyForecast | null>(null);
  const [selectedHour, setSelectedHour] = useState<HourlyForecast | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [locating, setLocating] = useState(false);
  const [forecastSource, setForecastSource] = useState<ForecastSource>('blend');
  const [outlookDays, setOutlookDays] = useState<1 | 3 | 7>(7);
  const [comparisonModels, setComparisonModels] = useState<WeatherModelKey[]>(() =>
    readStorage('weather:comparison-models', weatherModels.map((model) => model.key))
  );
  const [customBlendModels, setCustomBlendModels] = useState<WeatherModelKey[]>(() =>
    readStorage('weather:custom-blend-models', ['ecmwf', 'gfs', 'icon'])
  );
  const [comparisonRange, setComparisonRange] = useState<ComparisonRange>(() =>
    readStorage('weather:comparison-range', 'common')
  );
  const [mapActivated, setMapActivated] = useState(false);

  const language = settings.language;
  const t = translations[language];
  const locale = language === 'ar' ? 'ar-JO' : 'en-US';
  const languageRef = useRef(language);
  languageRef.current = language;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, []);

  const loadLocation = useCallback(async (
    nextLocation: Coordinates,
    options: { preserveView?: boolean } = {}
  ) => {
    const preserveView = options.preserveView === true;
    if (!preserveView) setLoading(true);
    setError(null);
    setCached(false);
    if (!preserveView) setShowAllDays(false);

    try {
      let resolvedLocation = cleanStoredLocation(nextLocation);
      try {
        let lookupLanguage = languageRef.current;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const resolved = await reverseGeocode(nextLocation, lookupLanguage);
          resolvedLocation = { ...resolved, source: nextLocation.source };
          if (lookupLanguage === languageRef.current) break;
          lookupLanguage = languageRef.current;
        }
      } catch {
        // Keep the name supplied by search if reverse geocoding is unavailable.
      }
      const [primary, visual, weatherApi] = await Promise.allSettled([
        fetchWeatherData(resolvedLocation),
        fetchVisualCrossingData(resolvedLocation),
        fetchWeatherApiComData(resolvedLocation)
      ]);

      if (primary.status !== 'fulfilled') throw new Error('PRIMARY_SOURCE_FAILED');

      const combined: CombinedWeatherData = {
        openMeteo: primary.value,
        visualCrossing: visual.status === 'fulfilled' ? visual.value : null,
        weatherApiCom: weatherApi.status === 'fulfilled' ? weatherApi.value : null
      };

      setWeather(combined);
      setLocation(resolvedLocation);
      setRecent((current) => uniqueLocations([resolvedLocation, ...current]).slice(0, 8));
      localStorage.setItem('weather:last-location', JSON.stringify(resolvedLocation));
      localStorage.setItem('weather:last-data', JSON.stringify({ location: resolvedLocation, data: primary.value }));
    } catch {
      if (preserveView) {
        setError(languageRef.current === 'ar'
          ? 'تعذر تحديث الطقس لموقعك، وبقيت البيانات الحالية ظاهرة'
          : 'Could not update weather for your location. Current data remains visible.');
        return;
      }
      const fallback = readStorage<{ location: Coordinates; data: WeatherData } | null>(
        'weather:last-data',
        null
      );
      if (fallback) {
        setLocation(fallback.location);
        setWeather({ openMeteo: fallback.data, visualCrossing: null, weatherApiCom: null });
        setCached(true);
      } else {
        setError(t.error);
      }
    } finally {
      if (!preserveView) setLoading(false);
      setLocating(false);
    }
  }, [language, t.error]);

  useEffect(() => {
    loadLocation(location);
    // The initial location is intentionally loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('weather:settings', JSON.stringify(settings));
  }, [language, settings]);

  useEffect(() => {
    let active = true;
    reverseGeocode(location, language)
      .then((resolved) => {
        if (!active) return;
        const localized = { ...resolved, source: location.source };
        setLocation(localized);
        localStorage.setItem('weather:last-location', JSON.stringify(localized));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // Coordinates identify the place; this effect only localizes its label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    localStorage.setItem('weather:favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('weather:recent', JSON.stringify(recent));
  }, [recent]);

  useEffect(() => {
    localStorage.setItem('weather:comparison-models', JSON.stringify(comparisonModels));
    localStorage.setItem('weather:custom-blend-models', JSON.stringify(customBlendModels));
    localStorage.setItem('weather:comparison-range', JSON.stringify(comparisonRange));
  }, [comparisonModels, comparisonRange, customBlendModels]);

  useEffect(() => {
    if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
    let timer = 0;
    const onScroll = () => {
      document.body.classList.add('is-scrolling');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.body.classList.remove('is-scrolling'), 140);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      document.body.classList.remove('is-scrolling');
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', listener);
    if ('serviceWorker' in navigator) {
      if (import.meta.env.PROD) {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
      } else {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(
            registrations
              .filter((registration) => registration.scope.startsWith(window.location.origin))
              .map((registration) => registration.unregister())
          ))
          .catch(() => undefined);
        if ('caches' in window) {
          caches.keys()
            .then((keys) => Promise.all(
              keys.filter((key) => key.startsWith('weather-observatory-')).map((key) => caches.delete(key))
            ))
            .catch(() => undefined);
        }
      }
    }
    return () => window.removeEventListener('beforeinstallprompt', listener);
  }, []);

  const primary = weather.openMeteo;
  const current = primary?.current;
  const theme = current ? getWeatherTheme(current.weathercode, current.is_day) : 'clear';
  const hourlySourceKeys = useMemo<WeatherModelKey[]>(() => {
    const selected = weatherModels.find((model) => model.key === forecastSource);
    if (selected) return [selected.key];
    return forecastSource === 'custom'
      ? customBlendModels
      : weatherModels.map((model) => model.key);
  }, [customBlendModels, forecastSource]);
  const sourcedHourly = useMemo(
    () => primary?.allHourly.map((hour) => applyHourlySource(hour, hourlySourceKeys)) ?? [],
    [hourlySourceKeys, primary]
  );
  const hourlySourceModels = weatherModels.filter((model) => hourlySourceKeys.includes(model.key));
  const currentHour = useMemo(() => {
    if (!primary) return null;
    const index = primary.allHourly.findIndex((hour) => hour.time === primary.current.time);
    return primary.allHourly[Math.max(0, index)];
  }, [primary]);
  const today = primary?.daily[0];
  const resolvedForecastDays = useMemo(
    () => primary?.daily.map((day) =>
      resolveForecastDay(
        day,
        primary.allHourly,
        hourlySourceKeys,
        weatherModels.map((model) => model.key)
      )
    ) ?? [],
    [hourlySourceKeys, primary]
  );
  const todayForecast = resolvedForecastDays[0];
  const todayForecastModels = weatherModels.filter((model) =>
    todayForecast?.participantKeys.includes(model.key)
  );

  const tempUnitLabel = settings.temperature === 'c' ? '°م' : '°ف';
  const windUnitLabel = settings.wind === 'kmh'
    ? language === 'ar' ? 'كم/س' : 'km/h'
    : language === 'ar' ? 'ميل/س' : 'mph';

  const formatTemp = (value: number, digits = 0) =>
    `${toTemperature(value, settings.temperature).toFixed(digits)}°`;
  const formatWind = (value: number) =>
    `${Math.round(toWind(value, settings.wind))} ${windUnitLabel}`;
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: settings.time === '12',
      timeZone: primary?.timezone
    }).format(new Date(value));

  const localTime = primary
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        hour12: settings.time === '12',
        timeZone: primary.timezone
      }).format(new Date())
    : '';

  const summary = useMemo(() => {
    if (!current || !todayForecast) return '';
    const description = getWeatherDescription(current.weathercode, language);
    if (language === 'ar') {
      if (todayForecast.precipitationProbability >= 60) {
        return `${description} في الرصد الحالي، ومع المصدر المختار يصل احتمال المطر اليوم إلى ${Math.round(todayForecast.precipitationProbability)}٪.`;
      }
      if (current.windgusts_10m >= 45) {
        return `${description} في الرصد الحالي، مع هبات نشطة تبلغ ${formatWind(current.windgusts_10m)}، والعظمى المتوقعة ${formatTemp(todayForecast.maximum)}.`;
      }
      return `${description} في الرصد الحالي، والعظمى المتوقعة اليوم من المصدر المختار ${formatTemp(todayForecast.maximum)}.`;
    }
    if (todayForecast.precipitationProbability >= 60) {
      return `${description} in the current observation, with today's selected-source rain chance reaching ${Math.round(todayForecast.precipitationProbability)}%.`;
    }
    return `${description} in the current observation, with a selected-source high of ${formatTemp(todayForecast.maximum)}.`;
  }, [current, todayForecast, language, settings.temperature, settings.wind]);

  const forecastOutlook = useMemo(
    () => buildForecastOutlook({
      days: resolvedForecastDays.slice(0, outlookDays),
      language,
      formatTemperature: (value) => formatTemp(value),
      formatWind
    }),
    [
      language,
      outlookDays,
      resolvedForecastDays,
      settings.temperature,
      settings.wind
    ]
  );
  const todayOutlook = useMemo(
    () => buildForecastOutlook({
      days: resolvedForecastDays.slice(0, 1),
      language,
      formatTemperature: (value) => formatTemp(value),
      formatWind
    }),
    [
      language,
      resolvedForecastDays,
      settings.temperature,
      settings.wind
    ]
  );
  const alert = todayOutlook.alert;

  const isFavorite = favorites.some(
    (item) => Math.abs(item.lat - location.lat) < 0.001 && Math.abs(item.lon - location.lon) < 0.001
  );

  const toggleFavorite = () => {
    if (isFavorite) {
      setFavorites((items) =>
        items.filter(
          (item) => Math.abs(item.lat - location.lat) >= 0.001 || Math.abs(item.lon - location.lon) >= 0.001
        )
      );
    } else {
      setFavorites((items) => uniqueLocations([location, ...items]));
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError(language === 'ar' ? 'المتصفح لا يدعم تحديد الموقع' : 'Location is not supported');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        loadLocation(
          {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            name: t.locating,
            source: 'geolocation'
          },
          { preserveView: true }
        ),
      () => {
        setLocating(false);
        setError(language === 'ar' ? 'لم نتمكن من الوصول إلى موقعك' : 'We could not access your location');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(`${location.name} — ${summary}`);
    showToast(t.copied);
  };

  const shareWeather = async () => {
    if (!current || !primary) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) return;

    const gradient = context.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, '#07111f');
    gradient.addColorStop(0.55, theme === 'rain' ? '#183a5a' : '#145d83');
    gradient.addColorStop(1, theme === 'night' ? '#38245f' : '#13a0b6');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 630);
    context.fillStyle = 'rgba(255,255,255,.12)';
    context.beginPath();
    context.arc(950, 110, 230, 0, Math.PI * 2);
    context.fill();
    context.textAlign = language === 'ar' ? 'right' : 'left';
    context.direction = language === 'ar' ? 'rtl' : 'ltr';
    const x = language === 'ar' ? 1080 : 120;
    context.fillStyle = '#ffffff';
    context.font = '700 44px Arial';
    context.fillText(t.brand, x, 100);
    context.font = '700 58px Arial';
    context.fillText(`${location.name ?? ''}، ${location.country ?? ''}`, x, 205);
    context.font = '300 170px Arial';
    context.fillText(formatTemp(current.temperature_2m), x, 390);
    context.font = '500 34px Arial';
    context.fillStyle = 'rgba(255,255,255,.9)';
    context.fillText(summary, x, 480, 930);
    context.font = '400 25px Arial';
    context.fillStyle = 'rgba(255,255,255,.68)';
    context.fillText(t.tagline, x, 560);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'weather-card.png', { type: 'image/png' });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: t.brand, text: summary, files: [file] });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'weather-card.png';
        link.click();
        URL.revokeObjectURL(link.href);
      }
      showToast(t.downloaded);
    } catch {
      // The user cancelled the system share dialog.
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const displayedDays = primary?.daily.slice(0, showAllDays ? 16 : 10) ?? [];
  const activeForecastModel = weatherModels.find((model) => model.key === forecastSource) ?? null;

  return (
    <div className={`app theme-${theme}`}>
      <WeatherScene theme={theme} reducedMotion={settings.reducedMotion} />
      <div className="app-overlay" />

      <header className="topbar">
        <a className="brand" href="#overview" aria-label={t.brand}>
          <span className="brand-mark"><FiCloud /><FiSun /></span>
          <span><strong>{t.brand}</strong><small>{t.dataSources}</small></span>
        </a>

        <nav className={mobileMenuOpen ? 'nav-open' : ''}>
          <a href="#overview" onClick={() => setMobileMenuOpen(false)}>{t.overview}</a>
          <a href="#hourly" onClick={() => setMobileMenuOpen(false)}>{t.hourly}</a>
          <a href="#daily" onClick={() => setMobileMenuOpen(false)}>{t.daily}</a>
          <a href="#models" onClick={() => setMobileMenuOpen(false)}>{t.models}</a>
          <a href="#map" onClick={() => setMobileMenuOpen(false)}>{t.weatherMap}</a>
        </nav>

        <div className="top-actions">
          <button
            className="language-toggle"
            type="button"
            onClick={() => setSettings((value) => ({ ...value, language: value.language === 'ar' ? 'en' : 'ar' }))}
          >
            <FiGlobe />
            <span>{language === 'ar' ? 'EN' : 'ع'}</span>
          </button>
          <button className="round-button" type="button" onClick={() => setSettingsOpen(true)} aria-label={t.settings}>
            <FiSettings />
          </button>
          <button className="menu-button" type="button" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Menu">
            {mobileMenuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
      </header>

      <main>
        <section className="search-area">
          <SearchBar
            language={language}
            disabled={loading}
            favorites={favorites}
            recent={recent}
            selectedLocation={location}
            onSelect={loadLocation}
            onUseLocation={useMyLocation}
            onClearRecent={() => setRecent([])}
          />
          {locating && <div className="locating-pill"><FiMapPin /> {t.locating}</div>}
        </section>

        {loading && (
          <section className="loading-state" aria-live="polite">
            <div className="weather-loader"><i /><i /><i /></div>
            <h2>{t.loading}</h2>
            <p>{location.name}، {location.country}</p>
          </section>
        )}

        {error && !loading && (
          <section className="error-state">
            <WiCloudy />
            <h2>{error}</h2>
            <button type="button" onClick={() => loadLocation(location)}><FiRefreshCw /> {t.retry}</button>
          </section>
        )}

        {!loading && current && primary && today && todayForecast && (
          <>
            {cached && <div className="cached-banner">{t.useCached}</div>}

            <section className="hero-section" id="overview">
              <div className="location-row">
                <div>
                  <p>
                    <FiMapPin />
                    <CountryFlag countryCode={location.countryCode} label={location.country} />
                    {location.country ?? primary.timezone}
                  </p>
                  <h1>{location.name}</h1>
                  <span>{t.localTime} · {localTime}</span>
                  {(location.source === 'coordinates' || location.source === 'geolocation') && (
                    <small className="location-coordinates">
                      {location.lat.toFixed(5)}، {location.lon.toFixed(5)}
                    </small>
                  )}
                </div>
                <button type="button" className={isFavorite ? 'favorite active' : 'favorite'} onClick={toggleFavorite}>
                  <FiHeart />
                  <span>{isFavorite ? t.removeFavorite : t.favorite}</span>
                </button>
              </div>

              <div className="hero-grid">
                <article className="current-card glass-card">
                  <div className="current-main">
                    <WeatherIcon code={current.weathercode} isDay={current.is_day} />
                    <div>
                      <div className="current-temperature">{formatTemp(current.temperature_2m)}</div>
                      <h2>{getWeatherDescription(current.weathercode, language)}</h2>
                    </div>
                  </div>

                  <div className="high-low">
                    <span>{t.high} <strong>{formatTemp(todayForecast.maximum)}</strong></span>
                    <span>{t.low} <strong>{formatTemp(todayForecast.minimum)}</strong></span>
                    <span>{t.feels} <strong>{formatTemp(current.apparent_temperature)}</strong></span>
                  </div>

                  <p className="weather-summary">{summary}</p>
                  {alert ? <div className="weather-alert">{alert}</div> : <div className="calm-status">{t.noAlerts}</div>}

                  <div className="hero-source-strip">
                    <div>
                      <small>{t.observationSource}</small>
                      <strong>Open-Meteo</strong>
                    </div>
                    <div>
                      <small>{t.todayForecastSource}</small>
                      <strong>
                        {activeForecastModel
                          ? activeForecastModel.label
                          : forecastSource === 'custom'
                            ? t.customBlend
                            : t.blend}
                      </strong>
                      <span className="participant-flags">
                        {todayForecastModels.map((model) => (
                          <CountryFlag
                            key={`hero-source-${model.key}`}
                            countryCode={model.countryCode}
                            label={language === 'ar' ? model.nameAr : model.nameEn}
                          />
                        ))}
                      </span>
                    </div>
                  </div>

                  <div className="hero-buttons">
                    <button type="button" onClick={shareWeather}><FiShare2 /> {t.share}</button>
                    <button type="button" onClick={copySummary}><FiClipboard /> {t.copy}</button>
                  </div>
                </article>

                <div className="quick-metrics">
                  <article className="metric-card glass-card">
                    <span><FiDroplet /></span>
                    <div><small>{t.rain}</small><strong>{Math.round(todayForecast.precipitationProbability)}٪</strong></div>
                    <em>{todayForecast.precipitation.toFixed(1)} {language === 'ar' ? 'ملم' : 'mm'}</em>
                  </article>
                  <article className="metric-card glass-card">
                    <span><FiWind /></span>
                    <div><small>{t.wind}</small><strong>{formatWind(current.windspeed_10m)}</strong></div>
                    <em>{t.gusts} {formatWind(current.windgusts_10m)}</em>
                  </article>
                  <article className="metric-card glass-card">
                    <span><WiRaindrop /></span>
                    <div><small>{t.humidity}</small><strong>{Math.round(current.relativehumidity_2m)}٪</strong></div>
                    <em>{t.clouds} {Math.round(current.cloudcover)}٪</em>
                  </article>
                  <article className="metric-card glass-card">
                    <span><FiSun /></span>
                    <div><small>{t.uv}</small><strong>{today.uv_index_max.toFixed(1)}</strong></div>
                    <em>{language === 'ar' ? 'أعلى قيمة اليوم' : 'Daily maximum'}</em>
                  </article>
                </div>
              </div>

              <article className="forecast-outlook glass-card" aria-live="polite">
                <header>
                  <div>
                    <span>{t.smartOutlook}</span>
                    <h2>{forecastOutlook.headline}</h2>
                  </div>
                  <div className="outlook-range" aria-label={t.smartOutlook}>
                    {([
                      { value: 1 as const, label: t.oneDay },
                      { value: 3 as const, label: t.threeDays },
                      { value: 7 as const, label: t.sevenDays }
                    ]).map((option) => (
                      <button
                        type="button"
                        key={`outlook-${option.value}`}
                        className={outlookDays === option.value ? 'active' : ''}
                        onClick={() => setOutlookDays(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </header>

                <div className="outlook-body">
                  <ul>
                    {forecastOutlook.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                  <aside>
                    <div className={`outlook-confidence ${forecastOutlook.confidence}`}>
                      <small>{t.confidence}</small>
                      <strong>
                        {forecastOutlook.confidence === 'single'
                          ? t.confidenceSingle
                          : forecastOutlook.confidence === 'high'
                            ? t.confidenceHigh
                            : forecastOutlook.confidence === 'medium'
                              ? t.confidenceMedium
                              : t.confidenceLow}
                      </strong>
                    </div>
                    <div className="outlook-source">
                      <small>{t.forecastSource}</small>
                      <strong>
                        {activeForecastModel
                          ? activeForecastModel.label
                          : forecastSource === 'custom'
                            ? t.customBlend
                            : t.blend}
                      </strong>
                      <span className="participant-flags">
                        {todayForecastModels.map((model) => (
                          <CountryFlag
                            key={`outlook-source-${model.key}`}
                            countryCode={model.countryCode}
                            label={language === 'ar' ? model.nameAr : model.nameEn}
                          />
                        ))}
                      </span>
                    </div>
                  </aside>
                </div>
                {forecastOutlook.alert && <div className="outlook-alert">{forecastOutlook.alert}</div>}
                <p className="outlook-note">{t.outlookDescription}</p>
              </article>
            </section>

            <section className="content-section" id="hourly">
              <div className="section-heading">
                <div><span>{t.today}</span><h2>{t.hourly}</h2></div>
                <small>{primary.timezoneAbbreviation} · {t.updated} {formatTime(primary.fetchedAt)}</small>
              </div>
              <div className="hourly-source-summary">
                <div>
                  <span>{language === 'ar' ? 'مصدر الساعات' : 'Hourly source'}</span>
                  <strong>
                    {activeForecastModel
                      ? activeForecastModel.label
                      : forecastSource === 'custom'
                        ? t.customBlend
                        : t.blend}
                  </strong>
                </div>
                <span className="participant-flags">
                  {hourlySourceModels.map((model) => (
                    <CountryFlag
                      key={`hourly-source-${model.key}`}
                      countryCode={model.countryCode}
                      label={language === 'ar' ? model.nameAr : model.nameEn}
                    />
                  ))}
                </span>
                <small>
                  {language === 'ar'
                    ? 'يتغير تلقائيًا مع مصدر التوقعات المختار'
                    : 'Updates automatically with the selected forecast source'}
                </small>
              </div>
              <HourlyChart
                data={sourcedHourly}
                language={language}
                temperatureUnit={settings.temperature}
                windUnit={settings.wind}
                timeFormat={settings.time}
                onSelect={(hour) => setSelectedHour(hour)}
              />
            </section>

            <section className="content-section" id="daily">
              <div className="section-heading">
                <div><span>{language === 'ar' ? 'حتى ١٦ يومًا' : 'Up to 16 days'}</span><h2>{t.daily}</h2></div>
                <button type="button" className="text-button" onClick={() => setShowAllDays((value) => !value)}>
                  {showAllDays ? t.showLess : t.showAll} <FiChevronDown />
                </button>
              </div>

              <div className="forecast-source-picker" aria-label={t.forecastSource}>
                <span>{t.forecastSource}</span>
                <button
                  type="button"
                  className={forecastSource === 'blend' ? 'active' : ''}
                  onClick={() => setForecastSource('blend')}
                >
                  <FiGlobe /> {t.blend}
                </button>
                {weatherModels.map((model) => (
                  <button
                    type="button"
                    key={`forecast-${model.key}`}
                    className={forecastSource === model.key ? 'active' : ''}
                    onClick={() => setForecastSource(model.key)}
                  >
                    <CountryFlag countryCode={model.countryCode} label={language === 'ar' ? model.nameAr : model.nameEn} />
                    {model.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={forecastSource === 'custom' ? 'active' : ''}
                  onClick={() => setForecastSource('custom')}
                >
                  <FiLayers /> {t.customBlend}
                </button>
              </div>

              <div className="daily-grid">
                {displayedDays.map((day, index) => {
                  const resolvedDay = resolvedForecastDays[index];
                  const participantKeys = resolvedDay?.participantKeys ?? [];
                  const participantModels = participantKeys
                    .map((key) => weatherModels.find((model) => model.key === key))
                    .filter((model): model is (typeof weatherModels)[number] => Boolean(model));
                  const maximum = resolvedDay?.maximum ?? day.temperature_2m_max;
                  const minimum = resolvedDay?.minimum ?? day.temperature_2m_min;
                  const rain = resolvedDay?.precipitation ?? day.precipitation_sum;
                  const weatherCode = resolvedDay?.weatherCode ?? day.weathercode;
                  const isSingleSource = participantModels.length === 1;
                  return (
                    <button
                      type="button"
                      className="day-card glass-card"
                      key={day.date}
                      onClick={() => setSelectedDay({
                        ...day,
                        hourly: sourcedHourly.filter((hour) => hour.time.startsWith(day.date))
                      })}
                    >
                      <div className="day-title">
                        <strong>
                          {index === 0
                            ? t.today
                            : new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(day.date))}
                        </strong>
                        <span>{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(day.date))}</span>
                      </div>
                      <div className="day-model-source">
                        <span className="participant-flags">
                          {participantModels.map((model) => (
                            <CountryFlag
                              key={`${day.date}-${model.key}`}
                              countryCode={model.countryCode}
                              label={language === 'ar' ? model.nameAr : model.nameEn}
                            />
                          ))}
                        </span>
                        <span>
                          {isSingleSource
                            ? participantModels[0].label
                            : forecastSource === 'custom' && !activeForecastModel
                              ? t.customBlend
                              : t.blend}
                        </span>
                      </div>
                      <WeatherIcon code={weatherCode} />
                      <p>{getWeatherDescription(weatherCode, language)}</p>
                      <div className="day-temperatures">
                        <strong>{formatTemp(maximum)}</strong>
                        <span>{formatTemp(minimum)}</span>
                      </div>
                      <div className="day-rain">
                        <FiDroplet />
                        {`${rain.toFixed(1)} ${language === 'ar' ? 'ملم' : 'mm'}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="content-section model-section" id="models">
              <div className="section-heading">
                <div><span>{t.modelAgreement}</span><h2>{t.models}</h2></div>
                <small>{t.modelNote}</small>
              </div>
              <div className="glass-card model-card">
                <ModelChart
                  daily={primary.daily}
                  currentModels={primary.modelTemps}
                  language={language}
                  temperatureUnit={settings.temperature}
                  selectedModel={forecastSource}
                  onSelectModel={setForecastSource}
                  comparisonModels={comparisonModels}
                  customBlendModels={customBlendModels}
                  comparisonRange={comparisonRange}
                  onComparisonModelsChange={setComparisonModels}
                  onCustomBlendModelsChange={setCustomBlendModels}
                  onComparisonRangeChange={setComparisonRange}
                />
              </div>
            </section>

            <section className="content-section map-section" id="map">
              <div className="section-heading">
                <div><span>{t.mapTagline}</span><h2>{t.weatherMap}</h2></div>
                <small>{t.selectOnMap}</small>
              </div>
              {!mapActivated ? (
                <button type="button" className="map-launcher glass-card" onClick={() => setMapActivated(true)}>
                  <span><FiGlobe /><FiMap /></span>
                  <strong>{language === 'ar' ? 'تشغيل الخريطة العالمية التفاعلية' : 'Launch the global interactive map'}</strong>
                  <small>
                    {language === 'ar'
                      ? 'خريطة مسطحة وكرة أرضية وطبقات الطقس والنماذج، وتُحمّل عند الطلب للحفاظ على سرعة الهاتف'
                      : 'Flat map, globe, weather layers and models, loaded on demand for mobile speed'}
                  </small>
                </button>
              ) : (
                <Suspense fallback={<div className="map-loading glass-card"><div className="weather-loader"><i /><i /><i /></div><span>{t.mapLoading}</span></div>}>
                  <WeatherMap
                    language={language}
                    location={location}
                    forecastSource={forecastSource}
                    customBlendModels={customBlendModels}
                    onForecastSourceChange={setForecastSource}
                    onUseCurrentLocation={useMyLocation}
                    locating={locating}
                    onLocationSelect={(nextLocation) => {
                      loadLocation(nextLocation);
                      window.setTimeout(() => document.querySelector('#overview')?.scrollIntoView({ behavior: 'smooth' }), 80);
                    }}
                  />
                </Suspense>
              )}
            </section>

            <section className="content-section" id="details">
              <div className="section-heading">
                <div><span>{language === 'ar' ? 'قراءة شاملة' : 'Complete reading'}</span><h2>{t.details}</h2></div>
              </div>
              <div className="details-grid">
                {[
                  { icon: <FiThermometer />, label: t.feels, value: formatTemp(current.apparent_temperature) },
                  { icon: <FiDroplet />, label: t.humidity, value: `${Math.round(current.relativehumidity_2m)}٪` },
                  { icon: <FiWind />, label: t.wind, value: formatWind(current.windspeed_10m) },
                  { icon: <WiStrongWind />, label: t.gusts, value: formatWind(current.windgusts_10m) },
                  { icon: <FiCompass />, label: language === 'ar' ? 'اتجاه الرياح' : 'Wind direction', value: `${Math.round(current.winddirection_10m)}°` },
                  { icon: <FiEye />, label: t.visibility, value: `${((currentHour?.visibility ?? 0) / 1000).toFixed(1)} ${language === 'ar' ? 'كم' : 'km'}` },
                  { icon: <FiActivity />, label: t.pressure, value: `${Math.round(current.pressure_msl)} ${language === 'ar' ? 'هكتوباسكال' : 'hPa'}` },
                  { icon: <FiCloud />, label: t.clouds, value: `${Math.round(current.cloudcover)}٪` },
                  { icon: <FiSun />, label: t.uv, value: today.uv_index_max.toFixed(1) },
                  { icon: <FiSunrise />, label: t.sunrise, value: formatTime(today.sunrise) },
                  { icon: <FiSunset />, label: t.sunset, value: formatTime(today.sunset) },
                  { icon: <WiRaindrop />, label: t.precipitation, value: `${todayForecast.precipitation.toFixed(1)} ${language === 'ar' ? 'ملم' : 'mm'}` }
                ].map((item) => (
                  <article className="detail-card glass-card" key={item.label}>
                    <span>{item.icon}</span>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="content-section sources-section">
              <div className="section-heading">
                <div><span>{language === 'ar' ? 'تحديث مباشر' : 'Live updates'}</span><h2>{t.sources}</h2></div>
              </div>
              <div className="source-grid">
                {[
                  { name: 'Open-Meteo', data: weather.openMeteo?.current, color: '#64d8ff' },
                  { name: 'Visual Crossing', data: weather.visualCrossing?.current, color: '#63f2bb' },
                  { name: 'WeatherAPI', data: weather.weatherApiCom?.current, color: '#c5a3ff' }
                ].map((source) => (
                  <article className="source-card glass-card" key={source.name}>
                    <i style={{ background: source.color }} />
                    <div><strong>{source.name}</strong><span>{source.data ? t.available : t.unavailable}</span></div>
                    <b>{source.data ? formatTemp(source.data.temperature_2m) : '—'}</b>
                  </article>
                ))}
              </div>
              <div className="model-source-status">
                <div className="source-subheading">
                  <strong>{language === 'ar' ? 'نماذج التوقع العالمية' : 'Global forecast models'}</strong>
                  <span>{language === 'ar' ? 'المدة القصوى المنشورة لكل نموذج' : 'Published maximum range for each model'}</span>
                </div>
                <div className="model-status-grid">
                  {weatherModels.map((model) => {
                    const available = primary.modelTemps[model.key] !== null;
                    return (
                      <article className="model-status-card glass-card" key={`status-${model.key}`}>
                        <CountryFlag countryCode={model.countryCode} label={language === 'ar' ? model.nameAr : model.nameEn} />
                        <div>
                          <strong>{model.label}</strong>
                          <span>{language === 'ar' ? model.nameAr : model.nameEn}</span>
                        </div>
                        <b>{model.forecastDays} {language === 'ar' ? 'يومًا' : 'days'}</b>
                        <em className={available ? 'available' : ''}>{available ? t.available : t.unavailable}</em>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="map-source-strip glass-card">
                <span>{language === 'ar' ? 'خدمات الخرائط والرصد المفتوحة' : 'Open mapping and observation services'}</span>
                <b>OpenFreeMap</b>
                <b>RainViewer</b>
                <b>NASA GIBS</b>
                <b>GDACS</b>
              </div>
            </section>
          </>
        )}
      </main>

      <footer>
        <div className="footer-brand">
          <span className="brand-mark"><FiCloud /><FiSun /></span>
          <div><strong>{t.brand}</strong><p>{t.tagline}</p></div>
        </div>
        <p>{t.developer} © {new Date().getFullYear()}</p>
        <div className="footer-actions">
          {installPrompt && <button type="button" onClick={installApp}><FiDownload /> {t.install}</button>}
          <button type="button" onClick={() => setSettingsOpen(true)}><FiSettings /> {t.settings}</button>
        </div>
      </footer>

      {settingsOpen && (
        <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <aside className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
            <header><h2>{t.settings}</h2><button type="button" aria-label={t.close} onClick={() => setSettingsOpen(false)}><FiX /></button></header>
            <label>
              <span>{language === 'ar' ? 'اللغة' : 'Language'}</span>
              <select
                value={settings.language}
                onChange={(event) => setSettings((value) => ({ ...value, language: event.target.value as 'ar' | 'en' }))}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <span>{language === 'ar' ? 'وحدة الحرارة' : 'Temperature unit'}</span>
              <div className="segmented">
                <button type="button" className={settings.temperature === 'c' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, temperature: 'c' }))}>{tempUnitLabel === '°م' ? 'مئوية' : 'Celsius'}</button>
                <button type="button" className={settings.temperature === 'f' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, temperature: 'f' }))}>{language === 'ar' ? 'فهرنهايت' : 'Fahrenheit'}</button>
              </div>
            </label>
            <label>
              <span>{language === 'ar' ? 'وحدة الرياح' : 'Wind unit'}</span>
              <div className="segmented">
                <button type="button" className={settings.wind === 'kmh' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, wind: 'kmh' }))}>{language === 'ar' ? 'كيلومتر/ساعة' : 'km/h'}</button>
                <button type="button" className={settings.wind === 'mph' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, wind: 'mph' }))}>{language === 'ar' ? 'ميل/ساعة' : 'mph'}</button>
              </div>
            </label>
            <label>
              <span>{language === 'ar' ? 'تنسيق الوقت' : 'Time format'}</span>
              <div className="segmented">
                <button type="button" className={settings.time === '12' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, time: '12' }))}>١٢</button>
                <button type="button" className={settings.time === '24' ? 'active' : ''} onClick={() => setSettings((value) => ({ ...value, time: '24' }))}>٢٤</button>
              </div>
            </label>
            <label className="switch-row">
              <span>{language === 'ar' ? 'تقليل الحركة والمؤثرات' : 'Reduce motion and effects'}</span>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(event) => setSettings((value) => ({ ...value, reducedMotion: event.target.checked }))}
              />
            </label>
          </aside>
        </div>
      )}

      <WeatherModal
        day={selectedDay}
        hour={selectedHour}
        language={language}
        temperatureUnit={settings.temperature}
        windUnit={settings.wind}
        timeFormat={settings.time}
        onClose={() => {
          setSelectedDay(null);
          setSelectedHour(null);
        }}
      />

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;
