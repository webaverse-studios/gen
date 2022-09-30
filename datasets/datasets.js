const Alea = require('alea');

export class Dataset {
  constructor({
    prefix,
    parser,
    n = 8, // number of examples randomly selected per prompt
    items,
  }) {
    this.prefix = prefix;
    this.parser = parser;
    this.n = n;
    this.items = [];
    this.parsedItems = [];

    if (items) {
      this.addItems(items);
    }
  }
  addItems(items) {
    this.items = items;
    this.#refreshItems();
  }
  #refreshItems() {
    this.parsedItems = this.items.map(item => this.parser(item));
  }
  #formatItem(item) {
    return `\
# ${item.name}
${this.#formatAttributes(item)}`
  }
  #formatAttributes(item) {
    const keys = Object.keys(item);
    let s = '';
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key !== 'name') {
        if (s.length > 0) {
          s += '\n';
        }
        s += `${key}${item[key]}`;
      }
    }
    return s;
  }
  generatePrompt(name, attributeName) {
    const rng = new Alea(name);

    const candidateItems = this.items.slice();
    const localItems = [];
    for (let i = 0; i < this.n && candidateItems.length > 0; i++) {
      const index = Math.floor(rng() * candidateItems.length);
      localItems.push(candidateItems[index]);
      candidateItems.splice(index, 1);
    }
    
    return `\
${this.prefix}

${localItems.map(item =>
  this.#formatItem(item)
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