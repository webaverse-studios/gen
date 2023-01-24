import {makeId} from './util.js';

//

const formatObject = c => {
  const result = {};
  for (const key in c) {
    result[key.toLowerCase()] = c[key];
  }
  return result;
};

//

export class StoryManager {
  constructor({
    generators,
  }) {
    this.generators = generators;

    const conversation = new NLPConversation();
    this.conversation = conversation;
  }
  async createConversationAsync() {
    let [
      character1,
      // character2,
      setting,
    ] = await Promise.all([
      this.generators.dataset.generateItem('character', {
        // Name: 'Death Mountain',
        // Description: panelSpec.description,
      }, {
        keys: ['Name', 'Description', 'Image'],
      }),
      // datasetGenerator.generateItem('character', {
      //   // Name: 'Death Mountain',
      //   // Description: panelSpec.description,
      // }, {
      //   // keys: ['Name', 'Description', 'Image'],
      // }),
      this.generators.dataset.generateItem('setting', {
        // Name: 'Death Mountain',
        // Description: panelSpec.description,
      }, {
        keys: ['Name', 'Description', 'Image'],
      }),
    ]);
    const characters = [
      character1,
      // character2,
    ].map(c =>  formatObject(c));
    setting = formatObject(setting);
    // console.log('got character spec', {characters, setting});

    return new NLPConversation({
      characters,
      setting,
    });
  }
}

//

export class NLPConversation {
  constructor({
    name = `conversation_${makeId()}`,
    characters = [],
    setting = '',
    messages = [],
  } = {}) {
    this.name = name;
    this.characters = characters;
    this.setting = setting;
    this.messages = messages;
  }
}