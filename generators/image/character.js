import {generateImage} from './generate-image.js';

export const generateCharacterImage = generateImage({
  modelName: 'webaverse_characters',
  prefix: `Single character concept art trending on ArtStation.`,
});