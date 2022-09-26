export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
export const capitalizeAllWords = s => {
  let words = s.split(/\s+/);
  words = words.map(word => capitalize(word));
  return words.join(' ');
};