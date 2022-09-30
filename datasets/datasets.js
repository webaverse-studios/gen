import Alea from 'alea';

//

export const parseDataset = s => {
  const lines = s.split('\n');

  const prefix = lines.splice(0, 2).join('\n').trim();

  const items = [];
  let currentName = '';
  let currentAttributes = {};
  const _flushObject = () => {
    items.push({
      name: currentName,
      attributes: currentAttributes,
    });
    currentName = '';
    currentAttributes = {};
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!currentName) {
      if (line) {
        const match = line.match(/^# (.*)$/);
        if (match) {
          currentName = match[1];
        } else {
          console.log('expected name', {line});
          throw new Error('expected name: ' + JSON.stringify(line));
        }
      } else {
        continue;
      }
    } else {
      if (line) {
        const attributeMatch = line.match(/^([a-zA-Z0-9]+?:) (.*)$/);
        let attributeName, attributeValue;
        if (attributeMatch) {
            attributeName = attributeMatch[1];
            attributeValue = attributeMatch[2];
        } else {
          attributeName = '';
          attributeValue = line;
        }
        currentAttributes[attributeName] = attributeValue;
      } else {
        _flushObject();
      }
    }
  }
  if (currentName) {
    _flushObject();
  }

  return {
    prefix,
    items,
  };

};

//

export class Dataset {
  constructor({
    prefix,
    parse,
    n = 8, // number of examples randomly selected per prompt
    items,
  }) {
    this.prefix = prefix;
    this.parser = parse;
    this.n = n;
    this.items = items;

    /* if (items) {
      this.addItems(items);
    } */
  }
  /* addItems(items) {
    this.items = items.map(itemString => {
      itemString = itemString.trim();
      const parsedItem = this.parser(itemString);
      if (!parsedItem) {
        throw new Error(`failed to parse item: ${JSON.stringify(itemString)}`);
      }
      return parsedItem;
    });
  } */
  #formatItem(item, attributeName) {
    const formatAttributes = item => {
      const keys = Object.keys(item);
      let s = '';
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (s.length > 0) {
          s += '\n';
        }
        s += `${key}${item[key]}`;
      }
      return s;
    };

    return `\
# ${item.name}
${attributeName !== '' ?
  `${attributeName} ${item.attributes[attributeName]}\n`
: ''}${item.attributes[''] ?? '?'}`;
  }
  generatePrompt(name, attributeName) {
    if (typeof name !== 'string') {
      throw new Error('name is required');
    }
    if (typeof attributeName !== 'string') {
      throw new Error('attributeName is required');
    }
    
    const rng = new Alea(name);

    const candidateItems = this.items.filter(item => !!item.attributes[attributeName]);
    /* console.log('got candidate items', JSON.stringify({
      items: this.items,
      candidateItems,
      attributeName,
    }, null, 2)); */
    const localItems = [];
    for (let i = 0; i < this.n && candidateItems.length > 0; i++) {
      const index = Math.floor(rng() * candidateItems.length);
      localItems.push(candidateItems[index]);
      candidateItems.splice(index, 1);
    }

    // console.log('got local items', {localItems});
    
    return `\
${this.prefix}

${localItems.map(item =>
  this.#formatItem(item, attributeName)
).join('\n\n')}

# ${name}
${attributeName}`;
  }
}

//

export class DatasetEngine {
  constructor({
    dataset,
    aiClient,
  }) {
    this.dataset = dataset;
    this.aiClient = aiClient;
  }
  async generateItemAttribute(name, attributeName) {
    const prompt = this.dataset.generatePrompt(name, attributeName);
    let response = await this.aiClient.generate(prompt, '\n\n');
    response = response.trim();
    return response;
  }
}