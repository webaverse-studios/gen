# Wiki

Wiki interface app that interfaces with the Lore Engine.

Supports deployment to Vercel.

## Minimum Requirements
- Node.js 18 or greater ([nvm](https://github.com/nvm-sh/nvm) is recommended).
- An OpenAI key.

## Installation

Get the source and install the dependencies:
```
git clone --recurse-submodules https://github.com/upstreet-labs/gen.git
cd gen
npm install
```

Create a `.env` file in the root directory and add a line specifying your OpenAI key:
```
OPENAI_KEY="sk-ABCDE..."
```


## Running

Build and run the dev server:
```
npm run dev
```

Open the URL reported in your browser:
```
https://local.webaverse.com:9999/
```

## Available Wiki Content

### Characters:
Example Route: ```/character/Any_name_or_description```
### Chats:
Example Route: ```/chat/Any_name_or_description```
### Items:
Example Route: ```/item/Any_name_or_description```
### Lore:
Example Route: ```/lore/Any_name_or_description```
### Settings:
Example Route: ```/setting/Any_name_or_description```
### Matches:
Example Route: ```/match/Any_name_or_description```
### Cutscenes:
Example Route: ```/cuscenes/Any_name_or_description```
### Battle Benters:
Example Route: ```/battle-banter/Any_name_or_description```
