const Alea = require('alea');

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
    this.items = [];

    if (items) {
      this.addItems(items);
    }
  }
  addItems(items) {
    this.items = items.map(itemString => {
      itemString = itemString.trim();
      const parsedItem = this.parser(itemString);
      if (!parsedItem) {
        throw new Error(`failed to parse item: ${JSON.stringify(itemString)}`);
      }
      return parsedItem;
    });
  }
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
${attributeName} ${item[attributeName]}`
  }
  generatePrompt(name, attributeName) {
    if (!name) {
      throw new Error('name is required');
    }
    if (!attributeName) {
      throw new Error('attributeName is required');
    }
    
    const rng = new Alea(name);

    const candidateItems = this.items.filter(item => item[attributeName]);
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