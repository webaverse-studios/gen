import {model} from '../constants/model.js';

export function makeGenerateFn() {
  function getOpenAIKey() {
    const key = process.env.OPENAI_KEY;
    if (!key) {
      return console.error("No openai key found");
    }
    return key;
  }
  async function query(openai_api_key, params = {}) {
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(openai_api_key),
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
      console.log("choices:", data.choices);
      return data.choices[0]?.text;
    } catch (e) {
      console.log(e);
      return "returning from error";
    }
  }
  async function openaiRequest(key, prompt, stop/*, needsRepetition*/) {
    return await query(key, {
      // model: 'text-davinci-002',
      model,
      prompt,
      stop,
      // top_p: 1,
      // frequency_penalty: needsRepetition ? 0.1 : 0.4,
      // presence_penalty: needsRepetition ? 0.1 : 0.4,
      // temperature: 0.85,
      max_tokens: 256,
      best_of: 1,
    });
  }
  const openAiKey = getOpenAIKey();
  
  return async (prompt, stop/*, needsRepetition = true*/) => {
    return await openaiRequest(openAiKey, prompt, stop/*, needsRepetition*/);
  };
}

export class AiClient {
  constructor() {
    this.generate = makeGenerateFn();
  }
};