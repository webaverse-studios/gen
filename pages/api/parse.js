import path from 'path';
/* import charactersMd from '../../datasets/data/characters.md';
import settingsMd from '../../datasets/data/settings.md';
import itemsMd from '../../datasets/data/items.md';
import cutscenesMd from '../../datasets/data/cutscenes.md';
import chatsMd from '../../datasets/data/chats.md';
import bantersMd from '../../datasets/data/banters.md';
import matchesMd from '../../datasets/data/matches.md'; */
import {capitalizeAllWords, isAllCaps} from '../../utils.js';
import {parseDatasetSpec} from '../../datasets/parsers/dataset.js';

//

const datasetBasePath = `https://webaverse.github.io/lore/datasets/data/`;
const mdUrls = [
  'characters.md',
  'settings.md',
  'items.md',
  'cutscenes.md',
  'chats.md',
  'banters.md',
  'matches.md',
].map(mdUrl => `${datasetBasePath}${mdUrl}`);

const fetchText = async u => {
  const res = await fetch(u);
  if (res.ok) {
    const text = await res.text();
    return text;
  } else {
    throw new Error(`fetch error ${res.status} ${res.statusText} ${u}`);
  }
};
const mdsPromise = Promise.all(mdUrls.map(mdUrl => fetchText(mdUrl)));

//

export default async (req, res) => {
  let items = [];
  try {
    const [
      charactersMd,
      settingsMd,
      itemsMd,
      cutscenesMd,
      chatsMd,
      bantersMd,
      matchesMd,
    ] = await mdsPromise;

    for (let mdSpec of [
      {
        type: 'Character',
        md: charactersMd,
      },
      {
        type: 'Setting',
        md: settingsMd,
      },
      {
        type: 'Item',
        md: itemsMd,
      },
      {
        type: 'Cutscene',
        md: cutscenesMd,
      },
      {
        type: 'Chat',
        md: chatsMd,
      },
      {
        type: 'Banter',
        md: bantersMd,
        groupKey: 'Banters',
      },
      {
        type: 'Match',
        md: matchesMd,
        nameKey: 'Candidate assets',
        descriptionKey: 'Match string',
      },
    ]) {
      const localItems = parseDatasetSpec(mdSpec);
      items.push(...localItems);
    }

    // res.json(items);
    
    // res.send(
    //   items.map(item => _formatItemText(item)).join('\n\n')
    // );
    res.send(
      items.map(item => JSON.stringify(item)).join('\n')
    );
  } catch(err) {
    res.status(500).send(err.stack);
  }
};