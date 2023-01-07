import alea from 'alea';
import {
  formatInitialValueText,
  formatDatasetItemsForPolyfill,
} from './dataset-parser.js';
import {
  getDatasetItemsForDatasetSpec,
} from './dataset-specs.js';

const stops = [
  '\n\n',
  '@Type',
  '\n#'
];

const modelMaxTokens = 4000;
export class DatasetEngine {
  constructor({
    datasetSpec,
    aiClient,
    fillRatio = 0.5,
  }) {
    this.datasetSpec = datasetSpec;
    this.aiClient = aiClient;
    this.fillRatio = fillRatio;
  }
  async generateItem({
    name = '',
    description = '',
  } = {}) {
    const {
      nameKey,
      descriptionKey,
      // attributeKeys,
    } = this.datasetSpec;

    // if (!name) {
    //   const namePrompt = formatDatasetNamePrompt(this.dataset);
    //   // console.log('got name prompt', {namePrompt});
    //   name = await this.aiClient.generate(namePrompt, stops);
    //   name = name.trim();
    // }
    // if (!description) {
    //   const descriptionPrompt = formatDatasetDescriptionPrompt(this.dataset, name);
    //   // console.log('got description prompt', {descriptionPrompt});
    //   description = await this.aiClient.generate(descriptionPrompt, stops);
    //   description = description.trim();
    // }

    // const attributes = {
    //   [nameKey]: name,
    //   [descriptionKey]: description,
    // };
    // const attributePrompts = formatDatasetAttributePrompts(this.dataset, name, description);
    // await Promise.all(attributePrompts.map(async attributePromptSpec => {
    //   const {
    //     key: attributeName,
    //     prompt: attributePrompt,
    //   } = attributePromptSpec;
    //   let attributeValue = await this.aiClient.generate(attributePrompt, stops);
    //   attributeValue = attributeValue.trim();
    //   attributes[attributeName] = attributeValue;
    // }));

    // return attributes;


    const initialValue = {
      Name: 'Death Mountain',
      // Description: 'A mountain in the middle of a desert.',
    };
    const opts = {
      keys: ['Image'],
    };
    const initialValueString = formatInitialValueText(initialValue, this.datasetSpec, opts);
    const initialValueEncoded = this.aiClient.tokenize(initialValueString);
    console.log('got string 1', {
      initialValueString,
      initialValueEncoded,
    });
    let tokenLength = initialValueEncoded.length;
    // note: the token length is conservative, since we don't account for token merge across items

    // choose items
    const items = [];
    const fillTokens = modelMaxTokens * this.fillRatio;
    if (tokenLength < fillTokens) {
      // get candidate items
      let candidateItems = await getDatasetItemsForDatasetSpec(this.datasetSpec);
      candidateItems = candidateItems.slice();
      const rng = alea(Math.random());
      while (candidateItems.length > 0) {
        const index = Math.floor(rng() * candidateItems.length);
        const item = candidateItems[index];
        let itemString = '';
        if (items.length > 0) {
          itemString += '\n\n';
        }
        itemString += formatDatasetItemsForPolyfill([item], this.datasetSpec, initialValue, opts);
        const itemStringEncoded = this.aiClient.tokenize(itemString);
        const itemStringEncodedLength = itemStringEncoded.length;
        if (tokenLength + itemStringEncodedLength <= fillTokens) {
          tokenLength += itemStringEncodedLength;
          items.push(item);
          candidateItems.splice(index, 1); 
        } else {
          break;
        }
      }
    }

    const itemsString = formatDatasetItemsForPolyfill(items, this.datasetSpec, initialValue, opts);
    const prompt = itemsString + '\n\n' + initialValueString;
    console.log('got components', {
      items,
      itemsString,
      initialValueString,
    });
    return prompt;

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