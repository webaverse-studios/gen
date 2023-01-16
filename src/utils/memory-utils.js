export function mod(v, n) {
  return ((v % n) + n) % n;
}

//

export const alignN = n => index => {
  const r = index % n;
  return r === 0 ? index : (index + n - r);
};
export const align4 = alignN(4);

//

export const getClosestPowerOf2 = size => Math.ceil(Math.log2(size));