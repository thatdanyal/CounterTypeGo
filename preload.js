// Nothing is bridged from Node yet: the renderer talks to the keyboard bridge over a plain
// WebSocket (ws://127.0.0.1:7365) and keeps its settings/history in localStorage.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('counterTypeGo', { version: '1.0.0', platform: process.platform });
