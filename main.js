// VCH-HaemLIS desktop wrapper.
// Loads the single bundled HTML file. No network access of any kind.
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    title: "VCH-HaemLIS — Vila Central Hospital Haematology",
    backgroundColor: "#F1EFF5",
    webPreferences: {
      nodeIntegration: false,      // the page gets no access to the file system
      contextIsolation: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, "VCH-HaemLIS.html"));

  // Nothing in this application should ever open an external site.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const template = [
    {
      label: "File",
      submenu: [
        { label: "Print report", accelerator: "CmdOrCtrl+P",
          click: () => win.webContents.print({}) },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About this system",
          click: () => dialog.showMessageBox(win, {
            type: "info",
            title: "VCH-HaemLIS",
            message: "Haematology Laboratory Information System",
            detail:
              "Vila Central Hospital, Port Vila — Laboratory Department\n\n" +
              "All data is stored on this computer only. It is not sent anywhere " +
              "and it is not shared with other machines.\n\n" +
              "Take a backup at the end of every shift from the Documents tab, " +
              "and keep the copy somewhere other than this computer.\n\n" +
              "Reference intervals must be verified locally before clinical use.",
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", e => e.preventDefault());
});
