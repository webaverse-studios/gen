import {Dataset, parseDataset} from '../datasets.js';
import settingsString from '../data/settings.md';

const {prefix, items} = parseDataset(settingsString);

const settingsDataset = new Dataset({
  prefix,
  items,
  parse: s => {
    const match = s.match(/^# (.*)\n(.*)$/);
    if (match) {
      const [_, name, description] = match;
      return {
        name,
        '': description,
      };
    } else {
      return match;
    }
  },
});
export default settingsDataset;