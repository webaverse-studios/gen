import path from 'path';
/* import charactersMd from '../../datasets/data/characters.md';
import settingsMd from '../../datasets/data/settings.md';
import itemsMd from '../../datasets/data/items.md';
import cutscenesMd from '../../datasets/data/cutscenes.md';
import chatsMd from '../../datasets/data/chats.md';
import bantersMd from '../../datasets/data/banters.md';
import matchesMd from '../../datasets/data/matches.md'; */
import {capitalizeAllWords, isAllCaps} from '../../utils.js';

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

const _hasNewline = s => s.indexOf('\n') !== -1;

const _formatItemText = (item, ignoreKeys = []) => {
  let s = '';
  for (const k in item) {
    if (!ignoreKeys.includes(k)) {
      const v = item[k];
      if (s) {
        s += '\n';
      }
      s += `${capitalizeAllWords(k)}: ${_hasNewline(v) ? '\n' : ''}${v}`;
    }
  }
  return s;
};
const _formatItemJson = (item, {
  nameKey,
  descriptionKey,
}) => {
  const prompt = `Type: ${item['Type']}\n\
${item[nameKey] ? `${nameKey}: ${item[nameKey]}\n` : ''}\
${item[descriptionKey] ? `${descriptionKey}: ${item[descriptionKey]}\n` : ''}\
`;
  const completion = _formatItemText(item, ['Type', nameKey, descriptionKey]);
  return {
    prompt,
    completion,
  };
};

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

    for (let {
      type,
      md,
      nameKey = 'Name',
      descriptionKey = 'Description',
      groupKey = null,
    } of [
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
      const _formatItemJson2 = item => _formatItemJson(item, {
        nameKey,
        descriptionKey,
      });
      
      const match = md.match(/^([\s\S]*?)\n\n([\s\S]*)$/);
      if (match) {
        const prefix = match[1];
        md = match[2];

        // console.log('prefix', prefix);

        const r = /([\s\S]+?)(?:\n\n|$)/g;
        let match2;
        while (match2 = r.exec(md)) {
          const itemString = match2[1];
          // console.log('itemString', itemString);

          const itemAttributes = {};
          let currentAttributeName = '';
          let currentAttributeValue = '';
          const _flushAttribute = () => {
            itemAttributes[currentAttributeName] = currentAttributeValue;
            
            currentAttributeName = '';
            currentAttributeValue = '';
          };

          // initialize with type
          itemAttributes['Type'] = type;

          const itemLines = itemString.split('\n');
          for (let i = 0; i < itemLines.length; i++) {
            const itemLine = itemLines[i];

            const match3 = itemLine.match(/^([\s\S]+?):(?: )?(.*)(?:\n|$)/);
            if (match3 && !isAllCaps(match3[1])) {
              if (currentAttributeName) {
                _flushAttribute();
              }

              currentAttributeName = match3[1];
              currentAttributeValue = match3[2];
            } else {
              if (currentAttributeName) {
                if (currentAttributeName === groupKey) {
                  // console.log('got banter split', {currentAttributeName, currentAttributeValue});
                  const itemAttributesClone = {...itemAttributes};
                  itemAttributesClone[currentAttributeName] = itemLine;
                  const formattedItem = _formatItemJson2(itemAttributesClone);
                  items.push(formattedItem);
                } else {
                  if (currentAttributeValue) {
                    currentAttributeValue += '\n';
                  }
                  currentAttributeValue += itemLine;
                }
              } else {
                throw new Error('did not have item attribute context: ' + JSON.stringify({itemString, itemLines}, null, 2));
              }
            }
          }
          if (currentAttributeName) {
            _flushAttribute();
          }

          const formattedItem = _formatItemJson2(itemAttributes);
          items.push(formattedItem);
        }

        /* const response = await fetch(md);
        const text = await response.text();
        console.log(text); */
      } else {
        throw new Error('had no prefix: ' + JSON.stringify(md));
      }
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