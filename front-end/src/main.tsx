import React from "react";
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { BrowserRouter } from "react-router-dom";
import { store } from "./app/store";
import { Provider } from "react-redux";


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>

     <BrowserRouter>
     <App/>
     </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
