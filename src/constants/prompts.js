export const prompts = {
  // map: `2D overhead view fantasy battle map scene, mysterious lush sakura forest, anime drawing, digital art`;
  map: `2D overhead view fantasy battle map scene, mysterious dinosaur robot factory, anime video game drawing, trending, winner, digital art`,
  // world: `anime screenshot, mysterious forest path with japanese dojo doorway, neon arrows, jungle labyrinth, metal ramps, lush vegetation, ancient technology, mystery creature, glowing magic, ghibli style, digital art`,
  // world: `anime screenshot, empty desert dunes with ancient technology buried sparsely, neon arrows, cactus, rusty metal sci fi building, ghibli style, digital art`,
  // world: `bird's eye view, tropical jungle with sci fi metal gate, dinosaur, ghibli style, digital art`,
  world: `side passage to a cave, jungle path with cement, sci fi metal gate, dinosaur, ghibli style, digital art`,
  // world: `standing on a skyscraper at the solarpunk city, sakura trees, lush vegetation, ancient technology, ghibli style, digital art`,
  character: `full body, young anime girl wearing a hoodie, white background, studio ghibli style, digital art`,
};

export const labelClasses = ['person', 'floor', 'path', 'sidewalk', 'ground', 'road', 'runway', 'land', 'dirt', 'ceiling', 'field', 'river', 'water', 'sea', 'sky', 'mountain', 'leaves', 'wall', 'house', 'machine', 'rock', 'flower', 'door', 'gate', 'car', 'boat', 'animal', 'mat', 'grass', 'plant', 'metal', 'light', 'tree', 'wood', 'food', 'smoke', 'forest', 'shirt', 'pant', 'structure', 'bird', 'tunnel', 'cave', 'skyscraper', 'sign', 'stairs', 'box', 'sand', 'fruit', 'vegetable', 'barrier'];
export const groundBoost = 50;
export const boostSpec = {
  person: groundBoost,
  building: groundBoost,
  floor: groundBoost,
  sidewalk: groundBoost,
  path: groundBoost,
  ground: groundBoost,
  road: groundBoost,
  runway: groundBoost,
  land: groundBoost,
  dirt: groundBoost,
  field: groundBoost,
  // sky: groundBoost,
  // car: 0.5,
  // boat: 0.5,
};
export const boosts = labelClasses.map(c => boostSpec[c] ?? 1);