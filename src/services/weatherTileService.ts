import { Language, WeatherMapField } from '../types';

export interface LegendBand {
  color: string;
  label: string;
}

export interface MapLegend {
  bands?: LegendBand[];
  imageUrl?: string;
  kind: 'bands' | 'image' | 'pressure' | 'wind';
  noteAr?: string;
  noteEn?: string;
  primaryLabelAr?: string;
  primaryLabelEn?: string;
  secondaryBands?: LegendBand[];
  secondaryLabelAr?: string;
  secondaryLabelEn?: string;
  unitAr?: string;
  unitEn?: string;
}

export interface WeatherRasterLayer {
  attribution: string;
  labelAr: string;
  labelEn: string;
  legend?: MapLegend;
  maxZoom: number;
  noteAr?: string;
  noteEn?: string;
  opacity: number;
  supportsForecast: boolean;
  tileSize: number;
  tileUrl: string;
}

const dwdBase = 'https://maps.dwd.de/geoserver/dwd/ows';
const ecmwfBase = 'https://eccharts.ecmwf.int/wms/';

const makeBands = (colors: string[], labels: string[]): LegendBand[] =>
  colors.map((color, index) => ({ color, label: labels[index] ?? '' }));

const temperatureLegend: MapLegend = {
  kind: 'bands',
  unitAr: 'درجة مئوية',
  unitEn: '°C',
  bands: makeBands(
    [
      '#FFF7F3', '#FDE0DD', '#FCC5C0', '#FA9FB5', '#F768A1', '#DD3497',
      '#AE017E', '#7A0177', '#680099', '#0570B0', '#74A9CF', '#BDC9E1',
      '#EDF8FB', '#C7E9B4', '#FFFFB2', '#FED976', '#FEB24C', '#FD8D3C',
      '#FC4E2A', '#E31A1C', '#B10026', '#4D0000'
    ],
    [
      '< −60', '−60 – −55', '−55 – −50', '−50 – −45', '−45 – −40',
      '−40 – −35', '−35 – −30', '−30 – −25', '−25 – −20', '−20 – −15',
      '−15 – −10', '−10 – −5', '−5 – 0', '0 – 5', '5 – 10', '10 – 15',
      '15 – 20', '20 – 25', '25 – 30', '30 – 35', '35 – 40', '> 40'
    ]
  )
};

const precipitationLegend: MapLegend = {
  kind: 'bands',
  unitAr: 'مليمتر خلال 6 ساعات',
  unitEn: 'mm / 6h',
  bands: makeBands(
    [
      'rgba(0, 0, 0, 0.078431375)', '#DCF7C3', '#B9F77C', '#00E601', '#00BF01', '#008017',
      '#33B9FF', '#007DFF', '#FFC040', '#E69900', '#B37700', '#FF0000',
      '#CC0000', '#A60000', '#FE00FF', '#D800D9', '#BC00BF', '#A500A6',
      '#C7B3FF', '#AA8CFF', '#8E66FF', '#FFFFFF'
    ],
    [
      '< 0.1', '0.1 – 0.5', '0.5 – 1', '1 – 2', '2 – 5', '5 – 10',
      '10 – 15', '15 – 20', '20 – 25', '25 – 30', '30 – 35', '35 – 40',
      '40 – 50', '50 – 60', '60 – 70', '70 – 80', '80 – 90', '90 – 100',
      '100 – 150', '150 – 200', '200 – 300', '> 300'
    ]
  )
};

const humidityLegend: MapLegend = {
  kind: 'bands',
  unitAr: 'نسبة مئوية',
  unitEn: '%',
  bands: makeBands(
    [
      'rgba(255, 255, 255, 0.01)', '#FFFF4D', '#FFFF99', '#FFFFCC', '#FFFFE6',
      '#CBFFCC', '#66DC81', '#00BF00', '#009900', '#007801'
    ],
    [
      '0 – 15', '15 – 30', '30 – 45', '45 – 60', '60 – 70',
      '70 – 80', '80 – 90', '90 – 95', '95 – 100', '> 100'
    ]
  )
};

const ecmwfLegend = (
  layer: string,
  style: string,
  unitAr: string,
  unitEn: string
): MapLegend => ({
  imageUrl: `${ecmwfBase}?token=public&request=GetLegend&layers=${layer}&styles=${style}&width=350&height=50`,
  kind: 'image',
  unitAr,
  unitEn
});

export const radarLegend: MapLegend = {
  kind: 'bands',
  unitAr: 'شدة الانعكاس بالديسيبل',
  unitEn: 'Reflectivity · dBZ',
  noteAr: 'الألوان مأخوذة من جدول رين فيور الرسمي للمخطط الأزرق العالمي',
  noteEn: 'Colours follow the official RainViewer Universal Blue table',
  primaryLabelAr: 'المطر',
  primaryLabelEn: 'Rain',
  bands: makeBands(
    [
      '#827B6949', '#CEC08796', '#88DDEE', '#00A3E0', '#0077AA',
      '#005588', '#FFEE00', '#FFAA00', '#FF4400', '#C10000',
      '#FFAAFF', '#FF77FF', '#FFFFFF'
    ],
    [
      '0', '10', '15', '20', '25', '30', '35',
      '40', '45', '50', '55', '60', '≥ 65'
    ]
  ),
  secondaryLabelAr: 'الثلج',
  secondaryLabelEn: 'Snow',
  secondaryBands: makeBands(
    [
      '#C7FFFF7F', '#BFFFFFFF', '#9FDFFF', '#7FBFFF', '#5F9FFF',
      '#4F8FFF', '#3F7FFF', '#2F6FFF', '#1F5FFF', '#0F4FFF',
      '#003FFF', '#002FFF', '#001FFF'
    ],
    [
      '0', '10', '15', '20', '25', '30', '35',
      '40', '45', '50', '55', '60', '≥ 65'
    ]
  )
};

const forecastTime = (hours: number, intervalHours = 3) => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(Math.floor(date.getUTCHours() / intervalHours) * intervalHours);
  return date.toISOString().replace('.000Z', 'Z');
};

const dwdTile = (
  layer: string,
  style: string,
  hours: number,
  extra = ''
) =>
  `${dwdBase}?service=WMS&version=1.1.1&request=GetMap`
  + `&layers=dwd:${layer}&styles=${style}`
  + '&format=image/png&transparent=true&width=512&height=512'
  + '&interpolations=bilinear'
  + '&srs=EPSG:3857&bbox={bbox-epsg-3857}'
  + `&time=${forecastTime(hours)}${extra}`;

const ecmwfTile = (
  layer: string,
  style: string,
  hours: number
) =>
  `${ecmwfBase}?service=WMS&version=1.1.1&token=public&request=GetMap`
  + `&layers=${layer}&styles=${style}`
  + '&format=image/png&transparent=true&width=512&height=512'
  + '&srs=EPSG:3857&bbox={bbox-epsg-3857}'
  + `&time=${forecastTime(hours)}`;

export function weatherRasterForField(
  field: Exclude<WeatherMapField, 'none'>,
  forecastHour: number
): WeatherRasterLayer {
  const commonDwd = {
    attribution: 'DWD Open Data · AICON/ICON',
    maxZoom: 10,
    opacity: 0.78,
    supportsForecast: true,
    tileSize: 512
  };

  if (field === 'temperature') {
    return {
      ...commonDwd,
      labelAr: 'الأرصاد الألمانية · AICON',
      labelEn: 'DWD · AICON',
      legend: temperatureLegend,
      tileUrl: dwdTile('Aicon_reg025_fd_sl_T', 'aicon_reg025_fd_sl_t2m_wmc_isoarea', forecastHour)
    };
  }
  if (field === 'precipitation') {
    return {
      ...commonDwd,
      labelAr: 'الأرصاد الألمانية · أمطار 6 ساعات',
      labelEn: 'DWD · 6-hour precipitation',
      legend: precipitationLegend,
      tileUrl: dwdTile(
        'Aicon_reg025_fd_sl_TOTPREC06H',
        'aicon_reg025_fd_sl_TOTPREC06H_wmc_isoarea',
        forecastHour
      )
    };
  }
  if (field === 'wind') {
    return {
      ...commonDwd,
      labelAr: 'الأرصاد الألمانية · رياح سطحية',
      labelEn: 'DWD · surface wind',
      legend: {
        kind: 'wind',
        noteAr: 'الريشة تشير إلى اتجاه حركة الرياح، وعدد الخطوط على الذيل يبين سرعتها وفق المعيار الجوي',
        noteEn: 'The barb points with the wind; tail feathers encode speed using the meteorological standard',
        unitAr: 'عقدة',
        unitEn: 'kn'
      },
      noteAr: 'الرموز الريحية تبين الاتجاه والسرعة وفق المعيار الجوي',
      noteEn: 'Wind barbs show direction and speed using the meteorological standard',
      opacity: 0.92,
      tileUrl: dwdTile('Aicon_reg025_fd_sl_UV10M', 'aicon_reg025_fd_sl_uv10m', forecastHour)
    };
  }
  if (field === 'pressure') {
    return {
      ...commonDwd,
      labelAr: 'الأرصاد الألمانية · ضغط سطح البحر',
      labelEn: 'DWD · mean sea-level pressure',
      legend: {
        kind: 'pressure',
        noteAr: 'كل خط يصل نقاطًا لها ضغط متساو، والرقم المكتوب عليه هو الضغط عند مستوى سطح البحر',
        noteEn: 'Each isobar joins equal-pressure points; its label is mean sea-level pressure',
        unitAr: 'هكتوباسكال',
        unitEn: 'hPa'
      },
      noteAr: 'خطوط تساوي الضغط تبين مراكز المرتفعات والمنخفضات',
      noteEn: 'Isobars show high and low pressure systems',
      opacity: 0.95,
      tileUrl: dwdTile('Aicon_reg025_fd_sl_PMSL', 'aicon_reg025_fd_sl_pmsl_isoline_label', forecastHour)
    };
  }
  if (field === 'humidity') {
    return {
      ...commonDwd,
      labelAr: 'الأرصاد الألمانية · رطوبة 1000 هكتوباسكال',
      labelEn: 'DWD · 1000 hPa humidity',
      legend: humidityLegend,
      tileUrl: dwdTile(
        'Icon_reg025_fd_pl_RELHUM',
        'icon_reg025_fd_pl_relhum_wmc_isoarea_scheme',
        forecastHour,
        '&elevation=1000'
      )
    };
  }
  if (field === 'clouds') {
    return {
      ...commonDwd,
      labelAr: 'الأرصاد الألمانية · مؤشر السحب',
      labelEn: 'DWD · cloud-layer indicator',
      legend: {
        ...humidityLegend,
        noteAr: 'هذا مؤشر رطوبة طبقة 700 هكتوباسكال للسحب المتوسطة، وليس نسبة الغطاء السحابي الكلي',
        noteEn: 'This is 700 hPa humidity used as a mid-level cloud indicator, not total cloud cover'
      },
      noteAr: 'يعرض رطوبة طبقة 700 هكتوباسكال بوصفها مؤشرًا متصلًا لمناطق السحب المتوسطة',
      noteEn: 'Shows 700 hPa humidity as a continuous indicator of mid-level cloud regions',
      tileUrl: dwdTile(
        'Icon_reg025_fd_pl_RELHUM',
        'icon_reg025_fd_pl_relhum_wmc_isoarea_scheme',
        forecastHour,
        '&elevation=700'
      )
    };
  }
  if (field === 'uv') {
    return {
      attribution: 'CAMS · ECMWF',
      labelAr: 'كوبرنيكوس · المركز الأوروبي',
      labelEn: 'CAMS · ECMWF',
      legend: ecmwfLegend('composition_uvindex', 'sh_all_uvindex', 'مؤشر الأشعة فوق البنفسجية', 'UV index'),
      maxZoom: 10,
      opacity: 0.78,
      supportsForecast: true,
      tileSize: 512,
      tileUrl: ecmwfTile('composition_uvindex', 'sh_all_uvindex', forecastHour)
    };
  }
  return {
    attribution: 'CAMS · ECMWF',
    labelAr: 'كوبرنيكوس · غبار عالمي',
    labelEn: 'CAMS · global dust',
    legend: ecmwfLegend('composition_duaod550', 'sh_Oranges_aod', 'العمق البصري للغبار', 'Dust AOD'),
    maxZoom: 10,
    noteAr: 'يعرض العمق البصري لغبار الغلاف الجوي؛ اللون الأقوى يعني حمولة غبار أعلى',
    noteEn: 'Shows dust aerosol optical depth; stronger colour means a higher dust load',
    opacity: 0.8,
    supportsForecast: true,
    tileSize: 512,
    tileUrl: ecmwfTile('composition_duaod550', 'sh_Oranges_aod', forecastHour)
  };
}

export function satelliteRaster(): WeatherRasterLayer {
  return {
    attribution: 'NASA EOSDIS GIBS · VIIRS',
    labelAr: 'وكالة الفضاء الأمريكية · أحدث رصد متاح',
    labelEn: 'NASA · latest available observation',
    maxZoom: 9,
    opacity: 0.66,
    supportsForecast: false,
    tileSize: 256,
    tileUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'
  };
}

export function aerosolRaster(forecastHour: number): WeatherRasterLayer {
  return {
    attribution: 'CAMS · ECMWF',
    labelAr: 'كوبرنيكوس · الهباء الجوي العالمي',
    labelEn: 'CAMS · global aerosol',
    legend: ecmwfLegend('composition_aod550', 'sh_BuYlRd_aod', 'العمق البصري للهباء الجوي', 'Aerosol AOD'),
    maxZoom: 10,
    opacity: 0.74,
    supportsForecast: true,
    tileSize: 512,
    tileUrl: ecmwfTile('composition_aod550', 'sh_BuYlRd_aod', forecastHour)
  };
}

export const fieldSourceLabel = (layer: WeatherRasterLayer, language: Language) =>
  language === 'ar' ? layer.labelAr : layer.labelEn;
