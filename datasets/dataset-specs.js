import {parseDatasetSpec} from './parsers/dataset.js'; 

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
    type: 'Character',
    url: 'characters.md',
  },
  {
    type: 'Setting',
    url: 'settings.md',
  },
  {
    type: 'Item',
    url: 'items.md',
  },
  {
    type: 'Cutscene',
    url: 'cutscenes.md',
  },
  {
    type: 'Chat',
    url: 'chats.md',
  },
  {
    type: 'Lore',
    url: 'lore.md',
  },
  {
    type: 'Banter',
    url: 'banters.md',
    groupKey: 'Banters',
  },
  {
    type: 'Match',
    url: 'matches.md',
    nameKey: 'Candidate assets',
    descriptionKey: 'Match string',
  },
].map(mdSpec => {
  return {
    ...mdSpec,
    url: `${datasetBasePath}${mdSpec.url}`,
  };
});

//

export const getTrainingItems = async () => {
  const itemsArray = await Promise.all(mdSpecs.map(async mdSpec => {
    const mdText = await fetchText(mdSpec.url);
    mdSpec.md = mdText;
    const items = parseDatasetSpec(mdSpec);
    return items;
  }));
  return itemsArray.flat();
};