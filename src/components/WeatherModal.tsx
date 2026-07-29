import { FiDroplet, FiWind, FiX } from 'react-icons/fi';
import { DailyForecast, HourlyForecast, Language, TemperatureUnit, TimeFormat, WindUnit } from '../types';
import { getWeatherDescription, translations } from '../constants';
import WeatherIcon from './WeatherIcon';

interface Props {
  day: DailyForecast | null;
  hour: HourlyForecast | null;
  language: Language;
  temperatureUnit: TemperatureUnit;
  windUnit: WindUnit;
  timeFormat: TimeFormat;
  onClose: () => void;
}

const temp = (value: number, unit: TemperatureUnit) =>
  Math.round(unit === 'f' ? (value * 9) / 5 + 32 : value);

const wind = (value: number, unit: WindUnit) =>
  Math.round(unit === 'mph' ? value * 0.621371 : value);

export default function WeatherModal({
  day,
  hour,
  language,
  temperatureUnit,
  windUnit,
  timeFormat,
  onClose
}: Props) {
  if (!day && !hour) return null;
  const t = translations[language];
  const hours = day?.hourly ?? (hour ? [hour] : []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="weather-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{t.hourlyDetails}</span>
            <h2>
              {day
                ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  }).format(new Date(day.date))
                : new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', {
                    hour: 'numeric',
                    hour12: timeFormat === '12'
                  }).format(new Date(hour!.time))}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close}><FiX /></button>
        </header>

        <div className="modal-hours">
          {hours.map((item) => (
            <article key={item.time}>
              <time>
                {new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', {
                  hour: 'numeric',
                  hour12: timeFormat === '12'
                }).format(new Date(item.time))}
              </time>
              <WeatherIcon code={item.weathercode} />
              <strong>{temp(item.temperature_2m, temperatureUnit)}°</strong>
              <p>{getWeatherDescription(item.weathercode, language)}</p>
              <div><FiDroplet /> {Math.round(item.precipitation_probability)}٪</div>
              <div><FiWind /> {wind(item.windspeed_10m, windUnit)}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
