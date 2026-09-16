import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { aplicarModoBalcao } from './lib/modoBalcao';
import './index.css';

// Antes de montar o React: a tela de Pedidos lê som e impressão já no primeiro
// render para desenhar os botões. Ver `modoBalcao.js`.
aplicarModoBalcao();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
