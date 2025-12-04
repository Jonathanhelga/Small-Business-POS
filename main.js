const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'public/index.html'));


  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  backendProcess = fork(path.join(__dirname, './app.js'));

  backendProcess.on('message', msg => {
    if (msg === 'backend-ready') {
      console.log("backend ready!!");
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  // 👉 Kill backend when Electron quits
  if (backendProcess) backendProcess.kill();
});
