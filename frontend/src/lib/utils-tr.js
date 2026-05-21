// Turkish-aware search normalization
// Converts Turkish special characters to ASCII equivalents for accent-insensitive search
const TR_MAP = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ç': 'c', 'Ç': 'c', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o' };

export function normalizeTR(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[ıİşŞçÇğĞüÜöÖ]/g, c => TR_MAP[c] || c);
}
