import uuidByString from 'uuid-by-string';

export const characters = ctx => [
  {
    methods: ['get'],
    path: '/characters',
    handler: (req, res, next) => {
      res.send(`characters ${req.url}`);
    },
  },
  {
    methods: ['get'],
    path: '/characters/:id',
    handler: (req, res, next) => {
      res.send(`characters ${req.url} ${JSON.stringify(req.params)}`);
    },
  },
];