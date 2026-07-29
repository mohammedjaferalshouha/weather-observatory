interface Props {
  countryCode?: string;
  label?: string;
  className?: string;
}

export default function CountryFlag({ countryCode, label, className = '' }: Props) {
  const code = countryCode?.trim().toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) {
    return <span className={`country-flag-fallback ${className}`} aria-hidden="true">🌍</span>;
  }

  return (
    <img
      className={`country-flag-image ${className}`}
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={label ? `${label}` : ''}
      loading="lazy"
      width="28"
      height="19"
    />
  );
}
