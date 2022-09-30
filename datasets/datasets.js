import Alea from 'alea';

//

export const parseItems = s => {
  const lines = s.split('\n');

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
        const attributeMatch = line.match(/^([a-zA-Z0-9]+?:|[#>]) (.*)$/);
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
  return items;
};
export const parseDataset = s => {
  const lines = s.split('\n');

  const prefix = lines.splice(0, 2).join('\n').trim();

  const suffix = lines.join('\n');
  const items = parseItems(suffix);

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
  #formatItem(item) {
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
${Object.keys(item.attributes).map(attributeName => {
  const attributeValue = item.attributes[attributeName];
  return `${attributeName} ${item.attributes[attributeName]}`;
}).join('\n')}`;
  }
  #getRngItems(name) {
    const rng = new Alea(name);

    const candidateItems = this.items.slice();
    const localItems = [];
    for (let i = 0; i < this.n && candidateItems.length > 0; i++) {
      const index = Math.floor(rng() * candidateItems.length);
      localItems.push(candidateItems[index]);
      candidateItems.splice(index, 1);
    }
    return localItems;
  }
  /* #getPrompt(name, localItems, description) {
    return `\
${this.prefix}

${localItems.map(item =>
  this.#formatItem(item)
).join('\n\n')}

# ${name}
${description ? `${description}\n` : ''}${attributeName}`;
  } */
  /* generateDescriptionPrompt(name) {
    if (typeof name !== 'string') {
      throw new Error('name is required');
    }
    
    const attributeName = '';
    const localItems = this.#getRngItems(name, attributeName);

    const prompt = this.#getPrompt(name, attributeName, localItems, '');
    return prompt;
  }
  generateAttributePrompt(name, attributeName, description) {
    if (typeof name !== 'string') {
      throw new Error('name is required');
    }
    if (typeof attributeName !== 'string') {
      throw new Error('attributeName is required');
    }
    
    const localItems = this.#getRngItems(name, attributeName);

    const prompt = this.#getPrompt(name, attributeName, localItems, description);
    return prompt;
  } */
  generateItemPrompt(name) {
    if (typeof name !== 'string') {
      throw new Error('name is required');
    }
    
    const localItems = this.#getRngItems(name);

    // const prompt = this.#getPrompt(name, attributeName, localItems, '');

    const prompt = `\
${this.prefix}

${localItems.map(item =>
  this.#formatItem(item)
).join('\n\n')}

# ${name}
>`;

    return prompt;
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
  /* async generateItemDescription(name) {
    const prompt = this.dataset.generateDescriptionPrompt(name);
    let response = await this.aiClient.generate(prompt, '\n\n');
    response = response.trim();
    return {
      prompt,
      response,
    };
  }
  async generateItemAttribute(name, attributeName, description) {
    const prompt = this.dataset.generateAttributePrompt(name, attributeName, description);
    let response = await this.aiClient.generate(prompt, '\n\n');
    response = response.trim();
    return {
      prompt,
      response,
    };
  } */
  async generateItem(name) {
    if (this.dataset.items.length > 0) {
      const item0 = this.dataset.items[0];
      // attributeNames = Object.keys(item0.attributes);

      const prompt = this.dataset.generateItemPrompt(name);
      let response = await this.aiClient.generate(prompt, '\n\n');
      // response = response.trim();
      
      const responseString = `# ${name}\n>${response}`;
      const parsedResponse = parseItems(responseString)[0] ?? null;
      
      return {
        prompt,
        response,
        parsedResponse,
      };
    } else {
      throw new Error(`dataset has no items: ${this.dataset}`);
    }
  }
}