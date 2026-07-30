import { DailyForecast, HourlyForecast, Language, WeatherModelKey } from '../types';

const precipitationCodes = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99
]);
const thunderCodes = new Set([95, 96, 99]);
const snowCodes = new Set([71, 73, 75, 77, 85, 86]);

const availableNumbers = (values: Array<number | null | undefined>) =>
  values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

const average = (values: Array<number | null | undefined>) => {
  const available = availableNumbers(values);
  return available.length
    ? available.reduce((total, value) => total + value, 0) / available.length
    : null;
};

const mode = (values: Array<number | null | undefined>) => {
  const counts = new Map<number, number>();
  availableNumbers(values).forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
};

const longestRun = <T,>(values: T[], predicate: (value: T) => boolean) => {
  let longest = 0;
  let current = 0;
  values.forEach((value) => {
    current = predicate(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  });
  return longest;
};

export interface ResolvedForecastDay {
  date: string;
  participantKeys: WeatherModelKey[];
  maximum: number;
  minimum: number;
  precipitation: number;
  precipitationProbability: number;
  weatherCode: number;
  maximumWind: number;
  averageHumidity: number;
  ultravioletIndex: number;
  temperatureSpread: number;
  precipitationAgreement: number;
}

export interface ForecastOutlook {
  headline: string;
  points: string[];
  alert: string | null;
  confidence: 'single' | 'high' | 'medium' | 'low';
}

export const resolveForecastDay = (
  day: DailyForecast,
  allHourly: HourlyForecast[],
  requestedKeys: WeatherModelKey[],
  fallbackKeys: WeatherModelKey[]
): ResolvedForecastDay => {
  let participantKeys = requestedKeys.filter(
    (key) => day.modelMaxTemps[key] !== null && day.modelMinTemps[key] !== null
  );
  if (!participantKeys.length) {
    participantKeys = fallbackKeys.filter(
      (key) => day.modelMaxTemps[key] !== null && day.modelMinTemps[key] !== null
    );
  }

  const hourly = allHourly.filter((hour) => hour.time.startsWith(day.date));
  const maximumValues = participantKeys.map((key) => day.modelMaxTemps[key]);
  const minimumValues = participantKeys.map((key) => day.modelMinTemps[key]);
  const precipitationValues = participantKeys.map((key) => day.modelPrecipitation[key]);
  const weatherCodes = participantKeys.map((key) => day.modelWeatherCodes[key]);
  const probabilityValues = hourly.flatMap((hour) =>
    participantKeys.map((key) => hour.modelPrecipitationProbabilities[key])
  );
  const windValues = hourly.flatMap((hour) =>
    participantKeys.map((key) => hour.modelWindSpeeds[key])
  );
  const humidityValues = hourly.flatMap((hour) =>
    participantKeys.map((key) => hour.modelHumidity[key])
  );
  const availableProbabilities = availableNumbers(probabilityValues);
  const availableWinds = availableNumbers(windValues);
  const maximumAvailable = availableNumbers(maximumValues);
  const precipitationVotes = availableNumbers(weatherCodes)
    .map((code) => precipitationCodes.has(code) ? 1 : 0);

  return {
    date: day.date,
    participantKeys,
    maximum: average(maximumValues) ?? day.temperature_2m_max,
    minimum: average(minimumValues) ?? day.temperature_2m_min,
    precipitation: average(precipitationValues) ?? day.precipitation_sum,
    precipitationProbability: availableProbabilities.length
      ? Math.max(...availableProbabilities)
      : day.precipitation_probability_max,
    weatherCode: mode(weatherCodes) ?? day.weathercode,
    maximumWind: availableWinds.length
      ? Math.max(...availableWinds)
      : day.windspeed_10m_max,
    averageHumidity: average(humidityValues)
      ?? average(hourly.map((hour) => hour.relativehumidity_2m))
      ?? 0,
    ultravioletIndex: day.uv_index_max,
    temperatureSpread: maximumAvailable.length > 1
      ? Math.max(...maximumAvailable) - Math.min(...maximumAvailable)
      : 0,
    precipitationAgreement: precipitationVotes.length
      ? precipitationVotes.reduce<number>((total, value) => total + value, 0) / precipitationVotes.length
      : 1
  };
};

interface OutlookOptions {
  days: ResolvedForecastDay[];
  language: Language;
  formatTemperature: (value: number) => string;
  formatWind: (value: number) => string;
}

export const buildForecastOutlook = ({
  days,
  language,
  formatTemperature,
  formatWind
}: OutlookOptions): ForecastOutlook => {
  if (!days.length) {
    return {
      headline: language === 'ar' ? 'لا تتوفر بيانات كافية للملخص' : 'Not enough data for the outlook',
      points: [],
      alert: null,
      confidence: 'low'
    };
  }

  const isArabic = language === 'ar';
  const maximums = days.map((day) => day.maximum);
  const minimums = days.map((day) => day.minimum);
  const rainDays = days.filter((day) =>
    day.precipitation >= 0.5
    || day.precipitationProbability >= 40
    || precipitationCodes.has(day.weatherCode)
  );
  const heavyRainDays = days.filter((day) =>
    day.precipitation >= 15 || [65, 67, 82].includes(day.weatherCode)
  );
  const thunderDays = days.filter((day) => thunderCodes.has(day.weatherCode));
  const snowDays = days.filter((day) => snowCodes.has(day.weatherCode));
  const frostDays = days.filter((day) => day.minimum <= 0);
  const hottest = Math.max(...maximums);
  const coldest = Math.min(...minimums);
  const strongestWind = Math.max(...days.map((day) => day.maximumWind));
  const highestUltraviolet = Math.max(...days.map((day) => day.ultravioletIndex));
  const averageHumidity = average(days.map((day) => day.averageHumidity)) ?? 0;
  const averageSpread = average(days.map((day) => day.temperatureSpread)) ?? 0;
  const averagePrecipitationAgreement = average(days.map((day) => day.precipitationAgreement)) ?? 1;
  const consecutiveHotDays = longestRun(days, (day) => day.maximum >= 38);
  const veryColdDays = days.filter((day) => day.maximum <= 10 || day.minimum <= 3);
  const largeDayNightRange = days.some((day) => day.maximum - day.minimum >= 15);
  const temperatureChange = days.at(-1)!.maximum - days[0].maximum;
  const points: string[] = [];

  if (thunderDays.length) {
    points.push(isArabic
      ? `تظهر إشارات لعواصف رعدية خلال ${thunderDays.length} من الأيام المحددة.`
      : `Thunderstorm signals appear on ${thunderDays.length} of the selected days.`);
  } else if (heavyRainDays.length) {
    points.push(isArabic
      ? `أمطار غزيرة محتملة خلال ${heavyRainDays.length} من الأيام المحددة، مع أعلى كمية يومية تقارب ${Math.max(...days.map((day) => day.precipitation)).toFixed(1)} ملم.`
      : `Heavy rain is possible on ${heavyRainDays.length} selected days, with a daily peak near ${Math.max(...days.map((day) => day.precipitation)).toFixed(1)} mm.`);
  } else if (rainDays.length) {
    points.push(isArabic
      ? `فرص هطول خلال ${rainDays.length} من الأيام المحددة، وأعلى احتمال يقارب ${Math.round(Math.max(...days.map((day) => day.precipitationProbability)))}٪.`
      : `Precipitation is possible on ${rainDays.length} selected days, peaking near ${Math.round(Math.max(...days.map((day) => day.precipitationProbability)))}%.`);
  } else {
    points.push(isArabic
      ? 'لا تظهر إشارة بارزة لهطول مؤثر خلال المدة المحددة.'
      : 'No notable precipitation signal appears during the selected period.');
  }

  if (snowDays.length) {
    points.push(isArabic
      ? `توجد إشارة للثلوج أو الزخات الثلجية خلال ${snowDays.length} من الأيام المحددة.`
      : `Snow or snow-shower signals appear on ${snowDays.length} selected days.`);
  }
  if (frostDays.length) {
    points.push(isArabic
      ? `احتمال صقيع في ${frostDays.length} من الليالي، مع صغرى تقارب ${formatTemperature(coldest)}.`
      : `Frost is possible on ${frostDays.length} nights, with lows near ${formatTemperature(coldest)}.`);
  } else if (veryColdDays.length >= 2) {
    points.push(isArabic
      ? `فترة باردة متوقعة، مع أدنى حرارة تقارب ${formatTemperature(coldest)}.`
      : `A cold spell is expected, with lows near ${formatTemperature(coldest)}.`);
  }

  if (consecutiveHotDays >= 3) {
    points.push(isArabic
      ? `فترة شديدة الحرارة مرجحة، وتبلغ العظمى نحو ${formatTemperature(hottest)}.`
      : `A period of intense heat is likely, with highs near ${formatTemperature(hottest)}.`);
  } else if (hottest >= 35) {
    points.push(isArabic
      ? `أجواء حارة في أعلى الفترات، والعظمى تقارب ${formatTemperature(hottest)}.`
      : `Hot conditions appear at the warmest point, with highs near ${formatTemperature(hottest)}.`);
  }

  if (strongestWind >= 60) {
    points.push(isArabic
      ? `رياح قوية محتملة، وقد تبلغ السرعة المتوقعة نحو ${formatWind(strongestWind)}.`
      : `Strong winds are possible, reaching about ${formatWind(strongestWind)}.`);
  } else if (strongestWind >= 40) {
    points.push(isArabic
      ? `نشاط ملحوظ للرياح قد يصل إلى ${formatWind(strongestWind)}.`
      : `Noticeably active winds may reach ${formatWind(strongestWind)}.`);
  }

  if (averageHumidity >= 80) {
    points.push(isArabic
      ? `رطوبة مرتفعة عمومًا بمتوسط يقارب ${Math.round(averageHumidity)}٪.`
      : `Humidity is generally high, averaging about ${Math.round(averageHumidity)}%.`);
  }
  if (highestUltraviolet >= 8) {
    points.push(isArabic
      ? `مؤشر الأشعة فوق البنفسجية المساند مرتفع وقد يبلغ ${highestUltraviolet.toFixed(1)}.`
      : `The supporting UV forecast is high and may reach ${highestUltraviolet.toFixed(1)}.`);
  }
  if (Math.abs(temperatureChange) >= 5 && days.length > 1) {
    points.push(temperatureChange > 0
      ? isArabic
        ? `اتجاه نحو ارتفاع الحرارة بنحو ${Math.round(temperatureChange)} درجات حتى نهاية المدة.`
        : `Temperatures trend about ${Math.round(temperatureChange)} degrees warmer by the end of the period.`
      : isArabic
        ? `اتجاه نحو انخفاض الحرارة بنحو ${Math.abs(Math.round(temperatureChange))} درجات حتى نهاية المدة.`
        : `Temperatures trend about ${Math.abs(Math.round(temperatureChange))} degrees cooler by the end of the period.`);
  }
  if (largeDayNightRange) {
    points.push(isArabic
      ? 'فارق ملحوظ بين حرارة النهار والليل؛ يُنصح بمراعاة تغير الحرارة بعد الغروب.'
      : 'A notable day-to-night temperature range is expected; plan for cooler conditions after sunset.');
  }

  const confidence: ForecastOutlook['confidence'] = days[0].participantKeys.length <= 1
    ? 'single'
    : averageSpread <= 2.5 && averagePrecipitationAgreement >= 0.7
      ? 'high'
      : averageSpread <= 5
        ? 'medium'
        : 'low';
  const headline = isArabic
    ? days.length === 1
      ? `ملخص توقع اليوم: عظمى ${formatTemperature(hottest)} وصغرى ${formatTemperature(coldest)}.`
      : `ملخص ${days.length} أيام: العظمى بين ${formatTemperature(Math.min(...maximums))} و${formatTemperature(hottest)}.`
    : days.length === 1
      ? `Today's outlook: high ${formatTemperature(hottest)}, low ${formatTemperature(coldest)}.`
      : `${days.length}-day outlook: highs from ${formatTemperature(Math.min(...maximums))} to ${formatTemperature(hottest)}.`;
  const alert = thunderDays.length
    ? isArabic ? 'تنبيه استرشادي: احتمال عواصف رعدية' : 'Advisory: Thunderstorms are possible'
    : heavyRainDays.length
      ? isArabic ? 'تنبيه استرشادي: احتمال أمطار غزيرة' : 'Advisory: Heavy rain is possible'
      : snowDays.length
        ? isArabic ? 'تنبيه استرشادي: احتمال ثلوج' : 'Advisory: Snow is possible'
        : frostDays.length
          ? isArabic ? 'تنبيه استرشادي: احتمال صقيع' : 'Advisory: Frost is possible'
          : strongestWind >= 60
            ? isArabic ? 'تنبيه استرشادي: رياح قوية محتملة' : 'Advisory: Strong winds are possible'
            : consecutiveHotDays >= 3
              ? isArabic ? 'تنبيه استرشادي: فترة شديدة الحرارة محتملة' : 'Advisory: A period of intense heat is possible'
              : null;

  return {
    headline,
    points: points.slice(0, 5),
    alert,
    confidence
  };
};
