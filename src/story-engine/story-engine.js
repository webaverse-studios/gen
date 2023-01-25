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

const getMarkdownImagesAsync = async (text, {
  abortController = null,
} = {}) => {
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
  
  root.unmount();
  
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
  return imgPromptsAlts;
}
const compileImages = async (text, {
  abortController = null,
} = {}) => {
  const imgPromptsAlts = await getMarkdownImagesAsync(text, {
    abortController,
  });
  const imgUrls = await Promise.all(imgPromptsAlts.map(async ([promptText, altText]) => {
    const imgBlob = await imageAiClient.createImageBlob(promptText);
    // img.setAttribute('prompt', promptText);
    // img.setAttribute('alt', altText);
    // return img;
    // return {
    //   imgBlob,
    // };
    const url = URL.createObjectURL(imgBlob);
    return {
      url,
      prompt: promptText,
      alt: altText,
    };
  }));
  if (abortController && abortController.signal.aborted) {
    throw abortError;
  }
  return imgUrls;
};
const getMainImagePromptsAsync = async (object, {
  abortController = null,
} = {}) => {
  const results = {};
  for (const type in object) {
    const items = object[type];

    results[type] = await Promise.all(items.map(async item => {
      let result = null;
      console.log('check item image 1', item);
      if (item.image) {
        const imgPromptsAlts = await getMarkdownImagesAsync(item.image, {
          abortController,
        });
        console.log('check item image 2', imgPromptsAlts);
        if (imgPromptsAlts.length > 0) {
          const [
            promptText,
            altText,
          ] = imgPromptsAlts[0];
          result = promptText;
        }
      }
      return result;
    }));
  }
  return results;
};
const compileObject = async (object, {
  abortController = null,
} = {}) => {
  const text = md.toMarkdownString(object);
  const mainImagePromptAlts = await getMainImagePromptsAsync(object);
  console.log('main image prompt alts', object, mainImagePromptAlts);
  const mainImagePrompts = (() => {
    const results = {};
    for (const type in mainImagePromptAlts) {
      results[type] = [];

      const items = mainImagePromptAlts[type];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        let result = null;
        if (item) {
          const [promptText, altText] = item;
          result = promptText;
        }
        results[type].push(result);
      }
    }
    return results;
  })();
  console.log('main image prompts', mainImagePrompts);
  const [
    images,
    vector,
  ] = await Promise.all([
    compileImages(text, {
      abortController,
    }),
    aiClient.embed(text, {
      abortController,
    }),
  ]);

  return {
    mainImagePrompts,
    text,
    images,
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
      images,
      text,
      vector,
    } = await compileObject({
      character: this.characters,
      setting: [this.setting],
    });

    for (let i = 0; i < images.length; i++) {
      const {
        url,
        prompt,
        alt,
      } = images[i];

      const img = document.createElement('img');
      img.src = url;
      img.setAttribute('prompt', prompt);
      img.setAttribute('alt', alt);
      img.style.cssText = `\
        width: 512px;
        height: 512px;
        background: red;
      `;
      document.body.appendChild(img);
      await new Promise((accept, reject) => {
        img.onload = accept;
        img.onerror = reject;
      });
      this.imageCache.set(prompt, img);
    }
    this.vector = vector;

    // XXX debug display
    console.log('got image cache', {images, text, vector}, this.imageCache, this.vector);
  }
}