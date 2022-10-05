// import {isAllCaps} from '../utils.js';

const typeSymbol = Symbol('type');
const nameKeySymbol = Symbol('nameKey');
const descriptionKeySymbol = Symbol('descriptionKey');

export const formatItemJson = item => {
  const {
    [nameKeySymbol]: nameKey,
    [descriptionKeySymbol]: descriptionKey,
  } = item;
  return {
    [nameKey]: item[nameKey],
    [descriptionKey]: item[descriptionKey],
    ...item,
  };
};
// const _hasNewline = s => s.indexOf('\n') !== -1;
export const formatItemText = item => {
  const {
    [nameKeySymbol]: nameKey,
    [descriptionKeySymbol]: descriptionKey,
  } = item;
  // const ignoreKeys = [
  //   nameKey,
  //   descriptionKey,
  // ];

  let s = '';
  for (const k in item) {
    // if (!ignoreKeys.includes(k)) {
      const v = item[k];
      if (s) {
        s += '\n';
      }
      if (k === nameKey) {
        s += `## ${k}: ${v}`;
      } else {
        s += `## ${k}:\n${v}`;
      }
    // }
  }
  return s;
};
export const getItemNameKey = item => item[nameKeySymbol];
export const getItemDescriptionKey = item => item[descriptionKeySymbol];
export const getItemAttributeKeys = item => {
  const {
    [nameKeySymbol]: nameKey,
    [descriptionKeySymbol]: descriptionKey,
  } = item;
  const ignoreKeys = [
    nameKey,
    descriptionKey,
  ];
  return Object.keys(item).filter(k => !ignoreKeys.includes(k));
};
export const formatTrainingItemCandidates = item => {
  const {
    [nameKeySymbol]: nameKey,
    [descriptionKeySymbol]: descriptionKey,
  } = item;

  const _getNameCompletion = () => {
    if (item[nameKey]) {
      const prompt = `@Type: ${item[typeSymbol]}\n## ${nameKey}:`
      const completion = `\n${item[nameKey]}\n\n`;
      return [
        {
          prompt,
          completion,
        },
      ];
    } else {
      return [];
    }
  };
  const _getDescriptionCompletion = () => {
    if (item[nameKey] && item[descriptionKey]) {
      const prompt = `@Type: ${item[typeSymbol]}\n\
## ${nameKey}:\n${item[nameKey]}\n\
## ${descriptionKey}:\
`;
      const completion = `\n${item[descriptionKey]}\n\n`;
      return [
        {
          prompt,
          completion,
        },
      ];
    } else {
      return [];
    }
  };
  const _getAttributeCompletions = () => {
    const basePrompt = `@Type: ${item[typeSymbol]}\n\
${item[nameKey] ? `## ${nameKey}:\n${item[nameKey]}\n` : ''}\
${item[descriptionKey] ? `## ${descriptionKey}:\n${item[descriptionKey]}\n` : ''}\
`;
    // const completion = formatItemText(item, ignoreKeys); */
    const formattedItems = [];
    const itemAttributeKeys = getItemAttributeKeys(item);
    for (const k of itemAttributeKeys) {
    // for (const k in item) {
      // if (!ignoreKeys.includes(k)) {
        const prompt = `${basePrompt}## ${k}:`;
        const completion = `\n${item[k]}\n\n`;
        const formattedItem = {
          prompt,
          completion,
        };
        formattedItems.push(formattedItem);
      // }
    }
    return formattedItems;
  };
  return _getNameCompletion()
    .concat(_getDescriptionCompletion())
    .concat(_getAttributeCompletions());
};
export const formatDatasetNamePrompt = dataset => {
  const {
    type,
    nameKey,
  } = dataset;
  const prompt = `@Type: ${type}\n## ${nameKey}:`;
  return prompt;
};
export const formatDatasetDescriptionPrompt = (dataset, name) => {
  const {
    type,
    nameKey,
    descriptionKey,
  } = dataset;
  const prompt = `@Type: ${type}\n\
## ${nameKey}:\n\
${name}\n\
## ${descriptionKey}:`;
  return prompt;
};
export const formatDatasetAttributePrompts = (dataset, name, description) => {
  const {
    type,
    nameKey,
    descriptionKey,
    attributeKeys,
  } = dataset;
  
  const basePrompt = `@Type: ${type}\n\
## ${nameKey}:\n\
${name}\n\
## ${descriptionKey}:\n\
${description}\n\
`;
  return attributeKeys.map(key => {
    const prompt = `${basePrompt}## ${key}:`;
    return {
      key,
      prompt,
    };
  });
};
export const parseDatasetItems = (md, datasetSpec, {
  count = Infinity,
} = {}) => {
  const {
    type,
    nameKey,
    descriptionKey,
    groupKey,
  } = datasetSpec;

  const items = [];
  const r = /([\s\S]+?)(?:\n\n|$)/g;
  let match2;
  while (match2 = r.exec(md)) {
    const itemString = match2[1];

    const itemAttributes = {};
    let currentAttributeName = '';
    let currentAttributeValue = '';
    let currentAttributeAsterisk = false;
    const _flushAttribute = () => {
      itemAttributes[currentAttributeName] = currentAttributeValue;
      if (currentAttributeAsterisk) {
        itemAttributes[currentAttributeName] = currentAttributeAsterisk;
      } 

      currentAttributeName = '';
      currentAttributeValue = '';
      currentAttributeAsterisk = false;
    };

    // initialize with type
    itemAttributes[typeSymbol] = type;
    itemAttributes[nameKeySymbol] = nameKey;
    itemAttributes[descriptionKeySymbol] = descriptionKey;

    const itemLines = itemString.split('\n');
    for (let i = 0; i < itemLines.length; i++) {
      const itemLine = itemLines[i];

      const match3 = itemLine.match(/^([@#]+ ?[\s\S]+?)(\*?):(?: )?(.*)(?:\n|$)/);
      if (match3 /* && !isAllCaps(name) */) {
        const name = match3[1];
        const asterisk = match3[2];
        const value = match3[3];

        if (currentAttributeName) {
          _flushAttribute();
        }

        currentAttributeName = name.replace(/^[@#]+ ?/, '');
        currentAttributeValue = value;
        currentAttributeAsterisk = !!asterisk;
      } else {
        if (currentAttributeName) {
          if (currentAttributeName === groupKey) {
            const itemAttributesClone = {...itemAttributes};
            itemAttributesClone[currentAttributeName] = itemLine;
            items.push(itemAttributesClone);
            if (items.length >= count) {
              return items;
            }
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
    if (items.length >= count) {
      return items;
    }
  }
  return items;
};
export const parseDatasetSpec = md => {
  const match = md.match(/^([\s\S]*?)\n\n([\s\S]*)$/);
  if (match) {
    const prefix = match[1];
    const itemsMd = match[2];

    console.log('parse dataset spec', {prefix, itemsMd});

    const datasetItems = parseDatasetItems(itemsMd, {
      count: 1,
    });
    if (datasetItems.length === 1) {
      const item0 = datasetItems[0];
      const itemKeys = Object.keys(item0);
      if (itemKeys.length >= 4) {
        const [typeKey, nameKey, descriptionKey] = itemKeys;
        const type = item0[typeKey];
        const ignoreKeys = [typeKey, nameKey, descriptionKey];
        let attributeKeys = itemKeys.filter(k => !ignoreKeys.includes(k));
        const groupKey = attributeKeys.find(k => k.endsWith('*')) ?? null;
        attributeKeys = attributeKeys.filter(k => !k.endsWith('*'));
        return {
          type,
          prefix,
          nameKey,
          descriptionKey,
          attributeKeys,
          groupKey,
        };
      } else {
        throw new Error('invalid dataset item keys: ' + JSON.stringify(itemKeys, null, 2));
      }
    } else {
      throw new Error('expected 1 dataset spec item, got ' + datasetItems.length);
    }
  } else {
    throw new Error('had no prefix: ' + JSON.stringify(md));
  }
};