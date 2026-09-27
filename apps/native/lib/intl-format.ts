// Cached Intl formatters.
//
// Number#toLocaleString and Date#toLocale{Date,Time}String construct a brand
// new Intl formatter on EVERY call — slow on Hermes, and this app calls them
// per list row and per calendar day (hundreds per data change). By spec,
// `x.toLocaleString(locale, options)` is exactly
// `new Intl.NumberFormat(locale, options).format(x)`, so reusing one
// formatter per (locale, options) gives identical output at a fraction of
// the cost.

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

export function dateFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}
