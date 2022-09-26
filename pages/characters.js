import uuidByString from 'uuid-by-string';

import {Ctx} from '../context.js';

const Characters = ({
  // url,
  id,
}) => {
  return (
    <div>
      characters {id}
    </div>
  );
};
Characters.getInitialProps = async ctx => {
  const {req} = ctx;
  
  const c = new Ctx();
  await c.aiClient.generate(`\

`);

  return {
    // url: req.url,
    id: uuidByString(req.url),
  };
};

export default Characters;