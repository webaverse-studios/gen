import uuidByString from 'uuid-by-string';

export const settings = ctx => [
  {
    methods: ['get'],
    path: '/settings',
    handler: (req, res, next) => {
      res.send(`settings ${req.url} ${req.params}`);
    },
  },
  {
    methods: ['get'],
    path: '/settings/:id',
    handler: (req, res, next) => {
      res.send(`settings ${req.url} ${JSON.stringify(req.params)}`);
    },
  },
];