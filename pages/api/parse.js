import charactersMd from '../../datasets/data/characters.md';
import settingsMd from '../../datasets/data/settings.md';
import itemsMd from '../../datasets/data/items.md';
import cutscenesMd from '../../datasets/data/cutscenes.md';
import chatsMd from '../../datasets/data/chats.md';
import bantersMd from '../../datasets/data/banters.md';
import {capitalizeAllWords, isAllCaps} from '../../utils.js';

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
const _formatItemJson = item => {
  const prompt = `Type: ${item['Type']}\nName: ${item['Name']}\nDescription: ${item['Description']})`;
  const completion = _formatItemText(item, ['Type', 'Name', 'Description']);
  return {
    prompt,
    completion,
  };
};

export default async (req, res) => {
  let items = [];
  try {
    for (let {
      type,
      md,
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
    ]) {
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
                  items.push(itemAttributesClone);
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

          items.push(itemAttributes);
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
      items.map(item => JSON.stringify(_formatItemJson(item))).join('\n')
    );
  } catch(err) {
    res.status(500).send(err.stack);
  }
};