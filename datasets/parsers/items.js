import itemsString from '../data/items.md';
import {Dataset, parseDataset} from '../datasets.js';

const {prefix, items} = parseDataset(itemsString);

const itemsDataset = new Dataset({
  prefix,
  items,
  parse: s => {
    // match an item, parsing out the attributes
    const match = s.match(/^# (.*)\n## (.*)/);
    if (match) {
      const name = match[1];
      const description = match[2];
      return {
        name,
        '': description,
      };
    } else {
      return match;
    }
  }
});
export default itemsDataset;