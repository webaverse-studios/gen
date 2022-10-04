import {capitalizeAllWords, isAllCaps} from '../../utils.js';

const typeSymbol = Symbol('type');
const nameKeySymbol = Symbol('nameKey');
const descriptionKeySymbol = Symbol('descriptionKey');

const _hasNewline = s => s.indexOf('\n') !== -1;
export const formatItemText = (item, ignoreKeys = []) => {
  let s = '';
  for (const k in item) {
    if (!ignoreKeys.includes(k)) {
      const v = item[k];
      if (s) {
        s += '\n';
      }
      s += `${k}: ${_hasNewline(v) ? '\n' : ''}${v}`;
    }
  }
  return s;
};
export const formatItemJson = item => {
  const {
    [nameKeySymbol]: nameKey,
    [descriptionKeySymbol]: descriptionKey,
  } = item;

  const prompt = `@Type: ${item[typeSymbol]}\n\
${item[nameKey] ? `${nameKey}: ${item[nameKey]}\n` : ''}\
${item[descriptionKey] ? `${descriptionKey}: ${item[descriptionKey]}\n` : ''}\
`;
  const ignoreKeys = [
    nameKey,
    descriptionKey,
  ];
  const completion = formatItemText(item, ignoreKeys);
  return {
    prompt,
    completion,
  };
};
export const parseDatasetSpec = mdSpec => {
  let {
    type,
    md,
    nameKey = 'Name',
    descriptionKey = 'Description',
    groupKey = null,
  } = mdSpec;
  if (!type) {
    throw new Error('type is required')
  }
  if (!md) {
    throw new Error('md is required')
  }

  const items = [];
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
      itemAttributes[typeSymbol] = type;
      itemAttributes[nameKeySymbol] = nameKey;
      itemAttributes[descriptionKeySymbol] = descriptionKey;

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
              const formattedItem = formatItemJson(itemAttributesClone);
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

      const formattedItem = formatItemJson(itemAttributes);
      items.push(formattedItem);
    }
  } else {
    throw new Error('had no prefix: ' + JSON.stringify(md));
  }

  return items;
};