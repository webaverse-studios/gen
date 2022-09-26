import uuidByString from 'uuid-by-string';

import {Ctx} from '../context.js';

const Settings = ({
  // url,
  id,
}) => {
  return (
    <div>
      settings {url} {id}
    </div>
  );
};
Settings.getInitialProps = async ctx => {
  const {req} = ctx;
  const c = new Ctx();
  return {
    // url: req.url,
    id: uuidByString(req.url),
  };
};

export default Settings;