import { useEffect, useMemo, useState } from 'react';
import { FiBarChart2, FiLayers } from 'react-icons/fi';
import CountryFlag from './CountryFlag';
import { translations, weatherModels } from '../constants';
import {
  ComparisonRange,
  DailyForecast,
  ForecastSource,
  Language,
  ModelTemperature,
  ModelWorkspaceMode,
  TemperatureUnit,
  WeatherModelKey
} from '../types';

interface Props {
  daily: DailyForecast[];
  currentModels: ModelTemperature;
  language: Language;
  temperatureUnit: TemperatureUnit;
  selectedModel: ForecastSource;
  comparisonModels: WeatherModelKey[];
  customBlendModels: WeatherModelKey[];
  comparisonRange: ComparisonRange;
  onSelectModel: (model: ForecastSource) => void;
  onComparisonModelsChange: (models: WeatherModelKey[]) => void;
  onCustomBlendModelsChange: (models: WeatherModelKey[]) => void;
  onComparisonRangeChange: (range: ComparisonRange) => void;
}

const convert = (value: number, unit: TemperatureUnit) =>
  unit === 'f' ? (value * 9) / 5 + 32 : value;

const average = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

const toggleModel = (
  key: WeatherModelKey,
  selected: WeatherModelKey[],
  minimum: number
) => selected.includes(key)
  ? selected.length > minimum ? selected.filter((item) => item !== key) : selected
  : [...selected, key];

interface ActiveGraphPoint {
  key: WeatherModelKey;
  date: string;
  value: number;
}

export default function ModelChart({
  daily,
  currentModels,
  language,
  temperatureUnit,
  selectedModel,
  comparisonModels,
  customBlendModels,
  comparisonRange,
  onSelectModel,
  onComparisonModelsChange,
  onCustomBlendModelsChange,
  onComparisonRangeChange
}: Props) {
  const t = translations[language];
  const [workspaceMode, setWorkspaceMode] = useState<ModelWorkspaceMode>('compare');
  const [activeGraphPoint, setActiveGraphPoint] = useState<ActiveGraphPoint | null>(null);
  const activeSelection = workspaceMode === 'compare' ? comparisonModels : customBlendModels;
  const activeModels = weatherModels.filter((model) => activeSelection.includes(model.key));
  const shownDays = useMemo(() => {
    if (comparisonRange === 'full') return daily;
    const selection = workspaceMode === 'compare' ? comparisonModels : customBlendModels;
    return daily.filter((day) =>
      selection.every((key) => day.modelMaxTemps[key] !== null && day.modelMinTemps[key] !== null)
    );
  }, [comparisonModels, comparisonRange, customBlendModels, daily, workspaceMode]);
  const graphDays = shownDays.slice(0, 10);
  const values = graphDays
    .flatMap((day) => activeSelection.map((key) => day.modelMaxTemps[key]))
    .filter((value): value is number => value !== null)
    .map((value) => convert(value, temperatureUnit));
  const rawMinimum = values.length ? Math.min(...values) : 0;
  const rawMaximum = values.length ? Math.max(...values) : 1;
  const graphPadding = Math.max(1, Math.ceil((rawMaximum - rawMinimum) * 0.18));
  const min = Math.floor(rawMinimum - graphPadding);
  const max = Math.ceil(rawMaximum + graphPadding);
  const currentValues = activeSelection
    .map((key) => currentModels[key])
    .filter((value): value is number => value !== null);
  const spread = currentValues.length ? Math.max(...currentValues) - Math.min(...currentValues) : 10;
  const agreement = Math.max(0, Math.min(100, Math.round(100 - spread * 12)));
  const customCurrentAverage = average(activeSelection.map((key) => currentModels[key]));
  const chartLeft = 48;
  const chartRight = 466;
  const chartTop = 20;
  const chartBottom = 176;
  const graphRange = Math.max(1, max - min);
  const tickValues = Array.from({ length: 5 }, (_, index) => max - (graphRange * index) / 4);
  const xFor = (index: number) =>
    chartLeft + index * ((chartRight - chartLeft) / Math.max(1, graphDays.length - 1));
  const yFor = (value: number) =>
    chartTop + ((max - convert(value, temperatureUnit)) / graphRange) * (chartBottom - chartTop);

  const pathFor = (key: WeatherModelKey) => {
    let hasPoint = false;
    return graphDays.map((day, index) => {
      const value = day.modelMaxTemps[key];
      if (value === null) {
        hasPoint = false;
        return '';
      }
      const x = xFor(index);
      const y = yFor(value);
      const command = hasPoint ? 'L' : 'M';
      hasPoint = true;
      return `${command} ${x} ${y}`;
    }).join(' ');
  };

  useEffect(() => {
    if (activeGraphPoint && !activeSelection.includes(activeGraphPoint.key)) {
      setActiveGraphPoint(null);
    }
  }, [activeGraphPoint, activeSelection]);

  const chooseAll = () => {
    const keys = weatherModels.map((model) => model.key);
    if (workspaceMode === 'compare') onComparisonModelsChange(keys);
    else onCustomBlendModelsChange(keys);
  };

  return (
    <div className="model-layout">
      <div className="model-workspace-tabs" role="tablist">
        <button type="button" className={workspaceMode === 'compare' ? 'active' : ''} onClick={() => setWorkspaceMode('compare')}>
          <FiBarChart2 /> {t.customComparison}
        </button>
        <button type="button" className={workspaceMode === 'blend' ? 'active' : ''} onClick={() => setWorkspaceMode('blend')}>
          <FiLayers /> {t.customBlend}
        </button>
      </div>

      <div className="model-builder">
        <div className="model-builder-heading">
          <div>
            <strong>{workspaceMode === 'compare' ? t.customComparison : t.customBlend}</strong>
            <span>
              {language === 'ar'
                ? workspaceMode === 'compare' ? 'اختر نموذجين أو أكثر للمقارنة' : 'اختر النماذج التي تدخل في التجميع'
                : workspaceMode === 'compare' ? 'Choose two or more models' : 'Choose models included in the blend'}
            </span>
          </div>
          <div className="builder-actions">
            <button type="button" onClick={chooseAll}>{t.selectAll}</button>
            <button
              type="button"
              onClick={() => workspaceMode === 'compare'
                ? onComparisonModelsChange(weatherModels.slice(0, 2).map((model) => model.key))
                : onCustomBlendModelsChange([weatherModels[0].key])}
            >
              {t.clearSelection}
            </button>
          </div>
        </div>

        <div className="model-checks">
          {weatherModels.map((model) => {
            const checked = activeSelection.includes(model.key);
            return (
              <label className={checked ? 'checked' : ''} key={`builder-${workspaceMode}-${model.key}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => workspaceMode === 'compare'
                    ? onComparisonModelsChange(toggleModel(model.key, comparisonModels, 2))
                    : onCustomBlendModelsChange(toggleModel(model.key, customBlendModels, 1))}
                />
                <CountryFlag countryCode={model.countryCode} label={language === 'ar' ? model.nameAr : model.nameEn} />
                <span><b>{model.label}</b><small>{language === 'ar' ? model.nameAr : model.nameEn}</small></span>
                <em>{model.forecastDays} {language === 'ar' ? 'يومًا' : 'days'}</em>
              </label>
            );
          })}
        </div>

        <div className="range-and-apply">
          <div className="range-switch">
            <button type="button" className={comparisonRange === 'common' ? 'active' : ''} onClick={() => onComparisonRangeChange('common')}>
              {t.commonPeriod}
            </button>
            <button type="button" className={comparisonRange === 'full' ? 'active' : ''} onClick={() => onComparisonRangeChange('full')}>
              {t.fullPeriod}
            </button>
          </div>
          {workspaceMode === 'blend' && (
            <button type="button" className="apply-blend" onClick={() => onSelectModel('custom')}>
              <FiLayers /> {t.apply}
            </button>
          )}
        </div>
      </div>

      <div className="model-current">
        {workspaceMode === 'blend' && (
          <button
            type="button"
            className={`model-reading model-blend ${selectedModel === 'custom' ? 'active' : ''}`}
            onClick={() => onSelectModel('custom')}
          >
            <span>{t.customBlend}</span>
            <strong>
              {customCurrentAverage === null
                ? '—'
                : `${Math.round(convert(customCurrentAverage, temperatureUnit))}°`}
            </strong>
          </button>
        )}
        {activeModels.map((model) => (
          <button
            type="button"
            className={`model-reading ${selectedModel === model.key ? 'active' : ''}`}
            key={model.key}
            onClick={() => onSelectModel(model.key)}
          >
            <CountryFlag countryCode={model.countryCode} label={language === 'ar' ? model.nameAr : model.nameEn} className="model-flag" />
            <span><b>{model.label}</b><small>{language === 'ar' ? model.nameAr : model.nameEn}</small></span>
            <strong>{currentModels[model.key] === null ? '—' : `${Math.round(convert(currentModels[model.key]!, temperatureUnit))}°`}</strong>
          </button>
        ))}
        <div className="agreement-card">
          <div className="agreement-ring" style={{ '--agreement': `${agreement * 3.6}deg` } as React.CSSProperties}>
            <strong>{agreement}٪</strong>
          </div>
          <span>{language === 'ar' ? 'توافق النماذج المختارة الآن' : 'Selected model agreement'}</span>
        </div>
      </div>

      <div className="model-graph" aria-label={language === 'ar' ? 'رسم مقارنة النماذج' : 'Weather model comparison chart'}>
        <header className="graph-heading">
          <div>
            <strong>{language === 'ar' ? 'العظمى اليومية حسب النموذج' : 'Daily maximum by model'}</strong>
            <span>{comparisonRange === 'common' ? t.commonPeriod : t.fullPeriod}</span>
          </div>
          <div className="graph-legend" aria-label={language === 'ar' ? 'دليل ألوان النماذج' : 'Model color legend'}>
            {activeModels.map((model) => (
              <span key={`legend-${model.key}`}>
                <i style={{ background: model.color }} />
                {model.label}
              </span>
            ))}
          </div>
        </header>

        {graphDays.length ? (
          <>
            <svg viewBox="0 0 480 205" role="img" aria-label={language === 'ar' ? 'درجات الحرارة العظمى للنماذج المختارة' : 'Maximum temperatures for selected models'}>
              {tickValues.map((tick, index) => {
                const y = chartTop + index * ((chartBottom - chartTop) / 4);
                return (
                  <g key={`tick-${index}`}>
                    <line x1={chartLeft} x2={chartRight} y1={y} y2={y} className="grid-line" />
                    <text x="42" y={y + 4} className="axis-label" textAnchor="end">
                      {Math.round(tick)}°
                    </text>
                  </g>
                );
              })}
              {activeModels.map((model) => (
                <g key={model.key}>
                  <path
                    d={pathFor(model.key)}
                    fill="none"
                    stroke={model.color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {graphDays.map((day, index) => {
                    const value = day.modelMaxTemps[model.key];
                    if (value === null) return null;
                    const active = activeGraphPoint?.key === model.key && activeGraphPoint.date === day.date;
                    const selectPoint = () => setActiveGraphPoint({
                      key: model.key,
                      date: day.date,
                      value
                    });
                    return (
                      <g
                        key={`${model.key}-${day.date}`}
                        className={`graph-point ${active ? 'active' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${model.label} ${Math.round(convert(value, temperatureUnit))}°`}
                        onClick={selectPoint}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') selectPoint();
                        }}
                      >
                        <circle className="graph-point-hit" cx={xFor(index)} cy={yFor(value)} r="13" />
                        <circle cx={xFor(index)} cy={yFor(value)} r={active ? 5.5 : 3.8} fill={model.color} />
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
            <div className="graph-days" style={{ '--graph-days': graphDays.length } as React.CSSProperties}>
              {graphDays.map((day) => (
                <span key={day.date}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', { weekday: 'short' }).format(new Date(day.date))}</span>
              ))}
            </div>
            <div className={`graph-reading ${activeGraphPoint ? 'visible' : ''}`} aria-live="polite">
              {activeGraphPoint ? (() => {
                const model = weatherModels.find((item) => item.key === activeGraphPoint.key)!;
                return (
                  <>
                    <CountryFlag countryCode={model.countryCode} label={language === 'ar' ? model.nameAr : model.nameEn} />
                    <strong>{model.label}</strong>
                    <span>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(activeGraphPoint.date))}</span>
                    <b>{Math.round(convert(activeGraphPoint.value, temperatureUnit))}°</b>
                  </>
                );
              })() : (
                <span>{language === 'ar' ? 'المس أي نقطة لعرض درجتها' : 'Tap any point to see its value'}</span>
              )}
            </div>
          </>
        ) : (
          <div className="graph-empty">
            {language === 'ar'
              ? 'لا توجد فترة زمنية مشتركة بين النماذج المختارة'
              : 'No common forecast period is available for the selected models'}
          </div>
        )}
      </div>

      {workspaceMode === 'blend' && (
        <div className="selected-model-forecast">
          <header>
            <span className="participant-flags">
              {customBlendModels.map((key) => {
                const model = weatherModels.find((item) => item.key === key)!;
                return <CountryFlag key={`blend-head-${key}`} countryCode={model.countryCode} label={model.label} />;
              })}
            </span>
            <div><strong>{t.customBlend}</strong><span>{t.participatingModels}</span></div>
          </header>
          <div className="model-days">
            {shownDays.slice(0, 16).map((day) => {
              const participants = customBlendModels.filter((key) => day.modelMaxTemps[key] !== null && day.modelMinTemps[key] !== null);
              const maximum = average(participants.map((key) => day.modelMaxTemps[key]));
              const minimum = average(participants.map((key) => day.modelMinTemps[key]));
              const rain = average(participants.map((key) => day.modelPrecipitation[key]));
              return (
                <article key={`custom-${day.date}`}>
                  <span>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-US', { weekday: 'short' }).format(new Date(day.date))}</span>
                  <span className="participant-flags">
                    {participants.map((key) => {
                      const model = weatherModels.find((item) => item.key === key)!;
                      return <CountryFlag key={`${day.date}-${key}`} countryCode={model.countryCode} label={model.label} />;
                    })}
                  </span>
                  <strong>{maximum === null || minimum === null ? '—' : `${Math.round(convert(maximum, temperatureUnit))}° / ${Math.round(convert(minimum, temperatureUnit))}°`}</strong>
                  <small>{rain === null ? '—' : `${rain.toFixed(1)} ${language === 'ar' ? 'ملم' : 'mm'}`}</small>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
