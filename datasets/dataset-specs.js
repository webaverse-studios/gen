import {
  parseDatasetSpecItems,
  formatTrainingItemCandidates,
  getItemNameKey,
  getItemDescriptionKey,
  getItemAttributeKeys,
} from './dataset-parser.js';

//

const fetchText = async u => {
  const res = await fetch(u);
  if (res.ok) {
    const text = await res.text();
    return text;
  } else {
    throw new Error(`fetch error ${res.status} ${res.statusText} ${u}`);
  }
};

//

const datasetBasePath = `https://webaverse.github.io/lore/datasets/data/`;
const mdSpecs = [
  {
    type: 'character',
    url: 'characters.md',
  },
  {
    type: 'setting',
    url: 'settings.md',
  },
  {
    type: 'item',
    url: 'items.md',
  },
  {
    type: 'cutscene',
    url: 'cutscenes.md',
  },
  {
    type: 'chat',
    url: 'chats.md',
  },
  {
    type: 'lore',
    url: 'lore.md',
  },
  {
    type: 'battle-banter',
    url: 'battle-banters.md',
    groupKey: 'Banters',
  },
  {
    type: 'match',
    url: 'matches.md',
    nameKey: 'Match string',
    descriptionKey: 'Candidate assets',
  },
].map(mdSpec => {
  return {
    nameKey: 'Name',
    descriptionKey: 'Description',
    ...mdSpec,
    url: `${datasetBasePath}${mdSpec.url}`,
    md: '',
    attributeKeys: [],
  };
});

//

export const getDatasetSpecs = async () => {
  const datasetSpecs = await Promise.all(mdSpecs.map(async mdSpec => {
    const mdText = await fetchText(mdSpec.url);
    mdSpec.md = mdText;
    return mdSpec;
  }));
  for (let i = 0; i < datasetSpecs.length; i++) {
    const datasetSpec = datasetSpecs[i];
    const item0 = parseDatasetSpecItems(datasetSpec, {
      count: 1,
    })[0];

    datasetSpec.nameKey = getItemNameKey(item0);
    datasetSpec.descriptionKey = getItemDescriptionKey(item0);
    datasetSpec.attributeKeys = getItemAttributeKeys(item0);
  }
  return datasetSpecs;
};

export const getTrainingItems = async () => {
  const datasetSpecs = await getDatasetSpecs();
  const itemsArray = await Promise.all(datasetSpecs.map(async datasetSpec => {
    let items = parseDatasetSpecItems(datasetSpec);
    items = items.map(item => formatTrainingItemCandidates(item)).flat();
    return items;
  }));
  return itemsArray.flat();
};