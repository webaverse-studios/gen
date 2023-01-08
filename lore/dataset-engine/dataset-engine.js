import alea from 'alea';
import {
  formatInitialValueText,
  formatDatasetItemsForPolyfill,
  getCompletionParser,
} from './dataset-parser.js';
import {
  getDatasetItemsForDatasetSpec,
} from './dataset-specs.js';

// const stops = [
//   '\n\n',
//   '@Type',
//   '\n#'
// ];

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
  async generateItem(initialValue, opts) {
    const {
      continueKey,
    } = opts;

    const initialValueString = formatInitialValueText(initialValue, this.datasetSpec, opts);
    const initialValueEncoded = this.aiClient.tokenize(initialValueString);
    // console.log('got string 1', {
    //   initialValueString,
    //   initialValueEncoded,
    // });
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
    let prompt = itemsString + '\n\n' + initialValueString;
    let stops;
    const lineKey = '\n-';
    if (continueKey) {
      prompt += lineKey;
      stops = [
        lineKey,
        '\n\n',
      ];
    } else {
      stops = [
        '\n',
      ];
    }
    const completion = await this.aiClient.generate(prompt, stops);
    // console.log('got completion', {
    //   prompt,
    //   completion,
    // });
    const parseFn = getCompletionParser(this.datasetSpec, initialValue, opts);
    const parsedCompletion = parseFn(completion);
    // console.log('parsed completion', {
    //   prompt,
    //   completion,
    //   parsedCompletion,
    // });

    const completedValue = {
      ...initialValue,
      ...parsedCompletion,
    };
    return completedValue;

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