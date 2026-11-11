'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steamBridge', Object.freeze({
  unlock: id => {
    if (typeof id === 'string' && /^[a-z0-9_]{1,32}$/.test(id)) {
      ipcRenderer.send('steam:unlock', id);
    }
  },
  presence: txt => {
    if (typeof txt === 'string') {
      ipcRenderer.send('steam:presence', txt.slice(0, 120));
    }
  },
  drmStatus: () => ipcRenderer.sendSync('steam:drm-status'),
  quit: () => ipcRenderer.send('app:quit'),
  fullscreen: () => ipcRenderer.send('app:fullscreen'),
  writeSave: data => {
    if (typeof data === 'string' && data.length <= 262144) {
      ipcRenderer.send('save:write', data);
    }
  },
  readSave: () => ipcRenderer.sendSync('save:read')
}));
