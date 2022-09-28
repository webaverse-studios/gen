export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
export const capitalizeAllWords = s => {
  let words = s.split(/\s+/);
  words = words.map(word => capitalize(word));
  return words.join(' ');
};
export const ensureUrl = async url => {
  const numRetries = 5;
  for (let i = 0; i < numRetries; i++) {
    const res = await fetch(url);
    if (res.ok) {
      return;
    } else {
      if (res.status === 408) {
        continue;
      } else {
        break;
      }
    }
  }
  throw new Error(`invalid status code: ${res.status}`);
};
export const cleanName = name => {
  name = name.replace(/_/g, ' ');
  name = capitalizeAllWords(name);
  return name;
};