import alea from 'alea';

export function shuffle(array, seed = '') {
  const rng = alea(seed);
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}