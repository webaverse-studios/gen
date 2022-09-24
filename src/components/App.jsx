import React from 'react';

import {makeGenerateFn} from '../../ai/generate.js';

export const App = ({
  router,
}) => {
  const {url, props} = router;
  
  return (
    <div className="app">
      <div className="url">{url}</div>
      <div className="props">{JSON.stringify(props)}</div>
    </div>
  );
};
App.getRouteProps = async (url) => {
  return {
    url,
    text: 'lol',
  };
};