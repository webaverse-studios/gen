import {capitalizeAllWords, isAllCaps} from '../utils.js';
import {itemsPromise} from '../datasets/dataset-specs.js';

//

const _run = async (req, res) => {
  const items = await itemsPromise;
  process.stdout.write(
    items.map(item => JSON.stringify(item))
      .join('\n')
  );
};
_run();