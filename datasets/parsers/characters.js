import charactersString from '../data/characters.md';
import {Dataset, parseDataset} from '../datasets.js';

const {prefix, items} = parseDataset(charactersString);

const characterDataset = new Dataset({
  prefix,
  items,
  parse: s => {
    const match = s.match(/^# (.*)\n## Class: (.*)\n(.*)/);
    if (match) {
      const [_, name, className, bio] = match;
      return {
        name,
        '## Class: ': className,
        '': bio,
      };
    } else {
      return match;
    }
  },
});
export default characterDataset;