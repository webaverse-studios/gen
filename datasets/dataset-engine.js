// import Alea from 'alea';
import {
  formatDatasetNamePrompt,
  formatDatasetDescriptionPrompt,
  formatDatasetAttributePrompts,
} from './dataset-parser.js';

//

/* export const parseItems = s => {
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
        const attributeMatch = line.match(/^([a-zA-Z0-9]+?:|[#]+) (.*)$/);
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

export const formatItem = item => {
  return Object.keys(item.attributes).map(attributeName => {
    const attributeValue = item.attributes[attributeName];
    return `${attributeName} ${attributeValue}`;
  }).join('\n');
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
  }
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
  generateItemPrompt(name) {
    if (typeof name !== 'string') {
      throw new Error('name is required');
    }
    
    const localItems = this.#getRngItems(name);

    const prompt = `\
${this.prefix}

${localItems.map(item =>
  this.#formatItem(item)
).join('\n\n')}

# ${name}
##`;

    return prompt;
  }
} */

//

export class DatasetEngine {
  constructor({
    dataset,
    aiClient,
  }) {
    this.dataset = dataset;
    this.aiClient = aiClient;
  }
  async generateItem(name, description) {
    const {
      nameKey,
      descriptionKey,
      attributeKeys,
    } = this.dataset;

    if (!name) {
      const namePrompt = formatDatasetNamePrompt(this.dataset);
      // console.log('got name prompt', {namePrompt});
      name = await this.aiClient.generate(namePrompt, '\n\n');
    }
    if (!description) {
      const descriptionPrompt = formatDatasetDescriptionPrompt(this.dataset, name);
      // console.log('got description prompt', {descriptionPrompt});
      description = await this.aiClient.generate(descriptionPrompt, '\n\n');
    }

    return {
      [nameKey]: name,
      [descriptionKey]: description,
    };

    /* if (this.dataset.items.length > 0) {
      const item0 = this.dataset.items[0];

      const prompt = this.dataset.generateItemPrompt(name);
      const result = await this.aiClient.generate(prompt, '\n\n');
      
      const response = `##${result}`;
      const fullResponse = `# ${name}\n${response}`;
      const parsedResponse = parseItems(fullResponse)[0] ?? null;
      
      return {
        prompt,
        response,
        parsedResponse,
      };
    } else {
      throw new Error(`dataset has no items: ${this.dataset}`);
    } */
  }
}