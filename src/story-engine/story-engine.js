import React from 'react';
import {useEffect} from 'react';
import ReactDOM from 'react-dom';
import ReactDOMClient from 'react-dom/client';

import Markdown from 'marked-react';

import {
  makeId,
  makePromise,
} from './util.js';
import md from './markdown-utils.js';
import {AiClient} from '../../clients/ai/ai-client.js';
import {
  DatabaseClient,
} from '../../clients/database/database-client.js';
import {
  ImageAiClient,
} from '../clients/image-client.js';

//

const aiClient = new AiClient();
const databaseClient = new DatabaseClient({
  aiClient,
});
const imageAiClient = new ImageAiClient();

//

const abortError = new Error('abort');
abortError.isAbortError = true;

//

const RenderWrap = ({
  promise,
  children,
}) => {
  useEffect(() => {
    // console.log('rendered', promise);
    promise.resolve();
  });

  return (
    // <Markdown gfm openLinksInNewTab={false}>
    //   {children}
    // </Markdown>
    React.createElement(Markdown, {
      gfm: true,
      openLinksInNewTab: false,
    }, children)
  );
};

//

const formatObject = c => {
  const result = {};
  for (const key in c) {
    result[key.toLowerCase()] = c[key];
  }
  return result;
};

//

const compileImages = async (text, opts) => {
  const {
    abortController = null,
  } = opts;
  
  const rootEl = document.createElement('div');
  const root = ReactDOMClient.createRoot(rootEl);
  const p = makePromise();
  root.render(
    // <RenderWrap
    //   promise={p}
    // >
    //   {text}
    // </RenderWrap>
    React.createElement(RenderWrap, {
      promise: p,
    }, text)
  );
  await p;
  if (abortController && abortController.signal.aborted) {
    throw abortError;
  }

  const imgPlaceholders = Array.from(rootEl.querySelectorAll('img'));
  const imgPromptsAlts = imgPlaceholders.map(img => {
    const alt = img.getAttribute('alt');
    const match = alt.match(/^([^\|]*?)\|([\s\S]*)$/);
    if (match) {
      const altText = match[1].trim();
      const promptText = match[2].trim();
      return [
        promptText,
        altText,
      ];
    } else {
      throw new Error('invalid alt text: ' + alt);
    }
  });
  const imgs = await Promise.all(imgPromptsAlts.map(async ([promptText, altText]) => {
    const img = await imageAiClient.createImage(promptText);
    img.setAttribute('prompt', promptText);
    img.setAttribute('alt', altText);
    return img;
  }));
  if (abortController && abortController.signal.aborted) {
    throw abortError;
  }

  root.unmount();

  return imgs;
};
const compileObject = async (object, {
  abortController = null,
} = {}) => {
  const text = md.toMarkdownString(object);
  const [
    imgs,
    vector,
  ] = await Promise.all([
    compileImages(text, {
      abortController,
    }),
    aiClient.embed(text, {
      // abortController,
    }),
  ]);

  return {
    text,
    imgs,
    vector,
  };
};

//

export class StoryManager {
  constructor({
    generators,
  }) {
    this.generators = generators;
  }
  async createConversationAsync() {
    let [
      character1,
      setting,
    ] = await Promise.all([
      this.generators.dataset.generateItem('character', {
        // Name: 'Death Mountain',
        // Description: panelSpec.description,
      }, {
        keys: ['Name', 'Description', 'Image'],
      }),
      this.generators.dataset.generateItem('setting', {
        // Name: 'Death Mountain',
        // Description: panelSpec.description,
      }, {
        keys: ['Name', 'Description', 'Image'],
      }),
    ]);
    let characters = [
      character1,
    ].map(c =>  formatObject(c));
    setting = formatObject(setting);

    const conversation = new NLPConversation({
      characters,
      setting,
    });
    await conversation.waitForLoad();
    return conversation;
  }
  static compileObject(...args) {
    return compileObject(...args);
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

    this.imageCache = new Map(); // prompt -> image
    this.vector = null;

    this.loadPromise = this.updateAsync();
  }
  waitForLoad() {
    return this.loadPromise;
  }
  async updateAsync() {
    const {
      imgs,
      text,
      vector,
    } = await compileObject({
      character: this.characters,
      setting: [this.setting],
    });

    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      const prompt = img.getAttribute('prompt');
      this.imageCache.set(prompt, img);
    }
    this.vector = vector;

    // XXX debug display
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];2
      img.style.cssText = `\
        width: 512px;
        height: 512px;
        background: red;
      `;
      document.body.appendChild(img);
    }
    console.log('got image cache', {imgs, text, vector}, this.imageCache, this.vector);
  }
}