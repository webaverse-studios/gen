const weaviate = require('weaviate-client');

const client = weaviate.client({
  scheme: 'http',
  host: 'weaviate-server.webaverse.com',
});

const schemas = [
  {
    "class": "Content",
    "description": "Webaverse content",
    "properties": [
      {
        "dataType": [
          "string"
        ],
        "description": "Title of the page",
        "name": "title"
      },
      {
        "dataType": [
          "string"
        ],
        "description": "Content of the page",
        "name": "content"
      },
      {
        "dataType": [
          "string"
        ],
        "description": "Type of content",
        "name": "type"
      },
    ],
  },
];

(async () => {
  await client
    .schema
    .getter()
    .do();
  for (const schema of schemas) {
    try {
      await client.schema
        .classCreator()
        .withClass(schema)
        .do();
    } catch(err) {
      if (!/422/.test(err)) { // already exists
        throw err;
      }
    }
  }
})();