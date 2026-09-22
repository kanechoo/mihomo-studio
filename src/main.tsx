import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initDrafts } from './store/drafts';

// Before anything renders, and before any store is pointed at a slot: moves a
// document written by the version that kept one draft for the whole browser
// into the slot it belongs to, and sweeps the drafts that have stopped
// protecting anything.
initDrafts();

// BrowserRouter, not HashRouter: the subscription URLs the server hands out are
// real paths already, and whatever serves the built files has to answer unknown
// paths with index.html regardless — deploy/nginx.conf does.
//
// reducedMotion="user" honours the operating system's "reduce motion" setting
// for every animation in the app at once. It is not a blanket off switch:
// fades still run, because what that setting is actually asking us to stop is
// movement — the sliding and scaling that can make someone motion-sensitive
// ill. Setting it here rather than per component means a new animation is
// covered by default instead of when somebody remembers.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>
);
