import React from 'react';
import ReactDOM from 'react-dom/client';

import {Gen} from './gen.jsx';
import '../styles/globals.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Gen />
  </React.StrictMode>,
);