import charactersMd from '../../datasets/data/characters.md';
import settingsMd from '../../datasets/data/settings.md';
import itemsMd from '../../datasets/data/items.md';
import {capitalizeAllWords} from '../../utils.js';

const _hasNewline = s => s.indexOf('\n') !== -1;

const _formatItem = item => {
  let s = '';
  for (const k in item) {
    const v = item[k];
    if (s) {
      s += '\n';
    }
    s += `${capitalizeAllWords(k)}: ${_hasNewline(v) ? '\n' : ''}${v}`;
  }
  return s;
};

export default async (req, res) => {
  let items = [];
  try {
    for (let md of [
      charactersMd,
      settingsMd,
      itemsMd,
    ]) {
      const match = md.match(/^(.*)\n\n([\s\S]*)$/);
      if (match) {
        const prefix = match[1];
        md = match[2];

        // console.log('prefix', prefix);

        const r = /([\s\S]+?)(?:\n\n|$)/g;
        let match2;
        while (match2 = r.exec(md)) {
          const itemString = match2[1];
          console.log('itemString', itemString);

          const itemAttributes = {};
          let currentAttributeName = '';
          let currentAttributeValue = '';
          const _flushAttribute = () => {
            itemAttributes[currentAttributeName] = currentAttributeValue;
            
            currentAttributeName = '';
            currentAttributeValue = '';
          };

          const itemLines = itemString.split('\n');
          for (let i = 0; i < itemLines.length; i++) {
            const itemLine = itemLines[i];

            const match3 = itemLine.match(/^([\s\S]+?):(?: )?(.*)(?:\n|$)/);
            if (match3) {
              if (currentAttributeName) {
                _flushAttribute();
              }

              currentAttributeName = match3[1];
              currentAttributeValue = match3[2];
            } else {
              if (currentAttributeName) {
                if (currentAttributeValue) {
                  currentAttributeValue += '\n';
                }
                currentAttributeValue += itemLine;
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
    res.send(
      items.map(item => _formatItem(item)).join('\n\n')
    );
  } catch(err) {
    res.status(500).send(err.stack);
  }
};