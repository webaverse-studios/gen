import React from 'react';

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
App.getRouteProps = async (url, ctx) => {
  return {
    url,
    text: 'lol',
  };
};