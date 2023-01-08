import {model} from '../../constants/model-constants.js';
import GPT3Tokenizer from 'gpt3-tokenizer';
import {OPENAI_API_KEY} from '../../src/constants/auth.js';

export function makeGenerateFn() {
  async function query(params = {}) {
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(OPENAI_API_KEY),
      },
      body: JSON.stringify(params),
    };
    try {
      const response = await fetch(
        "https://api.openai.com/v1/completions",
        requestOptions
      );
      if (response.status !== 200) {
        console.log(response.statusText);
        console.log(response.status);
        console.log(await response.text());
        return "";
      }

      const data = await response.json();
      // console.log("choices:", data.choices);
      return data?.choices?.[0]?.text;
    } catch (e) {
      console.log(e);
      return "returning from error";
    }
  }
  async function openaiRequest(prompt, stop, opts) {
    const {
      max_tokens = 256,
    } = opts ?? {};
    return await query({
      model,
      prompt,
      stop,
      // top_p: 1,
      // frequency_penalty: needsRepetition ? 0.1 : 0.4,
      // presence_penalty: needsRepetition ? 0.1 : 0.4,
      // temperature: 0.85,
      max_tokens,
      best_of: 1,
    });
  }
  
  return async (prompt, stop, opts) => {
    return await openaiRequest(prompt, stop, opts);
  };
}
export function makeEmbedFn() {
  async function embed(input) {
    const embeddingModel = `text-embedding-ada-002`;
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(OPENAI_API_KEY),
      },
      body: JSON.stringify({
        input,
        model: embeddingModel,
      }),
    };
    try {
      const response = await fetch(
        "https://api.openai.com/v1/embeddings ",
        requestOptions
      );
      if (response.status !== 200) {
        console.log(response.statusText);
        console.log(response.status);
        console.log(await response.text());
        return "";
      }

      const data = await response.json();
      return data?.data?.[0].embedding;
    } catch (e) {
      console.log(e);
      return "returning from error";
    }
  }
  return embed;
}
const makeTokenizeFn = () => {
  const tokenizer = new GPT3Tokenizer({
    type: 'gpt3',
  });
  function tokenize(s) {
    const encoded = tokenizer.encode(s);
    return encoded.text;
  }
  return tokenize;
};

export class AiClient {
  constructor() {
    this.generate = makeGenerateFn();
    this.embed = makeEmbedFn();
    this.tokenize = makeTokenizeFn();
  }
};