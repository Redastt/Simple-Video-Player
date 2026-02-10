const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('videoApp', {
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  getNeighbors: (filePath) => ipcRenderer.invoke('video:getNeighbors', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  appCommand: (cmd) => ipcRenderer.invoke('app:command', cmd),
  showVideoContext: (state) => ipcRenderer.send('menu:showVideoContext', state),
  onOpenFile: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, filePath) => handler(filePath);
    ipcRenderer.on('app:openFile', listener);
    return () => ipcRenderer.removeListener('app:openFile', listener);
  },
  onMenuCommand: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  }
});
