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


## Installation and Running on Windows

#### WSL

You need to use Windows Subsystem for Linux to install and run Webaverse. [This video](https://www.youtube.com/watch?v=5RTSlby-l9w) shows you how you can set up WSL and Ubuntu.

Requirements:
- WSL2. If you have WSL1 installed you need to upgrade to WSL2.
- Ubuntu 20+. Install Ubuntu 20+.

Once you have WSL and Ubuntu set up, run `wsl` in a Windows command window to get a WSL Ubuntu command prompt. Run `exit` at the WSL command prompt to return to the Windows command prompt.

#### Node

At a WSL command prompt, use `nvm` to install Node 18+.

#### Installation

You can host the source files on either your Windows file system or on the Ubuntu file system in WSL's virtual drive.

**Windows File System:** Run the Git commands to clone and pull source files from a Windows command prompt. You may find this best if you're using programs such as SourceTree as a Git GUI. You can also edit source using your usual IDE.

**Ubuntu File System:** Run the Git commands to clone and pull source files from a WSL command prompt. In this case consider [using the Visual Studio Code WSL extension](https://code.visualstudio.com/docs/remote/wsl) as your dev environment - for features such as hot reload.

#### Running

Start the application by running the NPM command at a WSL command prompt.


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
