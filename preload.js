const { contextBridge, ipcRenderer } = require('electron');

const portArg = process.argv.find(a => a.startsWith('--locohost-port='));
const port = portArg ? portArg.split('=')[1] : '3847';

contextBridge.exposeInMainWorld('locohost', {
  port: parseInt(port, 10),
  resize: (height) => ipcRenderer.send('resize', height),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
