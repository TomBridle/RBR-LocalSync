const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const os = require('os');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const fs = require('fs');
const ini = require('ini');
const bonjour = require('bonjour')();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const codriverParser = require('./parseCodriver');
const axios = require('axios');
const cheerio = require('cheerio');
const { decode } = require('html-entities');
const levenshtein = require('fast-levenshtein');


let mainWindow;
const clients = {}; // Store WebSocket clients by device ID
const clientFiles = {}; // Track received files per client
const sentFiles = new Set(); // Track globally sent files
let folderPath = null;
let configFilePath; // Set this after app is ready
let db; // Initialize db variable here

// **Added variable to keep track of the WebSocket client requesting drag-and-drop**
let wsClient; // WebSocket client requesting drag-and-drop

// Helper function to get the local network IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const details of iface) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return 'localhost';
}

// Create WebSocket server using the local network IP
const localIP = getLocalIPAddress();
const wss = new WebSocket.Server({ port: 8080 });
const wsUrl = `ws://${localIP}:8080`; // Define WebSocket URL using the local IP

// Advertise service on local network using bonjour
bonjour.publish({ name: 'Local Sync WebSocket', type: 'ws', port: 8080 });

// Load configuration file
function loadConfig() {
  try {
    if (!fs.existsSync(configFilePath)) {
      const defaultConfig = { folderPath: null };
      fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
      console.log('Config file created with default settings.');
    }
    
    const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
    folderPath = config.folderPath || null;
    if (folderPath) {
      setupDatabase(folderPath); // Initialize database if folderPath is set
    }
  } catch (error) {
    console.error('Error loading or creating config file:', error);
  }
}

// Create and update HTML status content in the window
function updateStatus() {
  const connectedDevices = Object.keys(clients).map(
    (deviceId) => `<li>${deviceId}</li>`
  ).join('');

  mainWindow.webContents.send('status-update', {
    folderPath,
    connectedDevices,
    fileStatus: Array.from(sentFiles),
    wsUrl // Add WebSocket URL to the status update
  });
}

function setupDatabase(basePath) {
  const dbPath = path.join(basePath, 'Plugins', 'NGPCarMenu', 'RaceStat', 'raceStatDB.sqlite3');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      return console.error('Error opening database at path:', dbPath, 'Error:', err.message);
    }
    console.log('Connected to database at', dbPath);
  });
}

function saveConfig() {
  const config = { folderPath };
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
}

app.on('ready', () => {
  configFilePath = path.join(app.getPath('userData'), 'config.json');
  loadConfig();

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  const htmlContent = `
  <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #111;
          color: #fff;
          text-align: center;
          margin: 0;
          padding: 0;
        }
        h1 {
          color: #e60000; /* Bold red like the Richard Burns text */
          margin-top: 20px;
          font-size: 28px;
          letter-spacing: 1px;
        }
        h2 {
          color: #e60000;
          margin-top: 30px;
          font-size: 22px;
        }
        #status-container {
          display: flex;
          justify-content: center;
          margin-top: 20px;
          gap: 20px;
        }
        .status-item {
          padding: 15px;
          border-radius: 8px;
          background-color: #222;
          width: 200px;
          text-align: left; /* Align text to the left */
        }
        .status-item strong {
          display: block;
          font-size: 16px;
          color: #fff; /* Changed to white */
        }
        #ws-url, #folder-path {
          display: block;
          margin: 10px 0;
          font-size: 16px;
          color: white; /* Changed to white */
        }
        #folder-path {
          text-align: left; /* Align folder path text to the left */
        }
        button {
          background-color: #e60000;
          border: none;
          color: white;
          padding: 10px 20px;
          text-align: center;
          text-decoration: none;
          display: inline-block;
          font-size: 16px;
          margin: 15px 0;
          cursor: pointer;
          border-radius: 5px;
          transition: background-color 0.3s;
        }
        button:hover {
          background-color: #cc0000;
        }
        #device-list, #file-list {
          list-style: none;
          padding: 0;
          font-size: 15px;
          text-align: left; /* Align list items to the left */
        }
        #device-list li, #file-list li {
          background-color: #333;
          margin: 5px 0;
          padding: 8px;
          border-radius: 4px;
          color: #e60000; /* Bold red text for list items */
        }
        /* Styles for drag-drop-area */
        #drag-drop-area {
          width: 100%;
          height: 100%;
          border: 2px dashed #e60000;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        #drag-drop-area p {
          font-size: 24px;
          color: #fff;
        }
        #drag-drop-area.dragover {
          background-color: rgba(230, 0, 0, 0.5);
        }
      </style>
    </head>
    <body>
      <!-- Main content -->
      <div id="main-content">
        <h1>Pacenote Sync Widget</h1>
        <div id="status-container">
          <div class="status-item">
            <strong>WebSocket URL:</strong>
            <span id="ws-url">Not available</span>
          </div>
          <div class="status-item">
            <strong>Folder Path:</strong>
            <span id="folder-path">Not set</span>
            <button onclick="window.requestFolder()">Set Folder Path</button>
          </div>
        </div>
        <h2>Connected Devices</h2>
        <ul id="device-list">
          <li>None</li>
        </ul>
        <h2>Files Found In RBR Folder</h2>
        <ul id="file-list">
          <li>None</li>
        </ul>
      </div>

      <!-- Added drag-and-drop content -->
      <div id="drag-drop-content" style="display: none;">
        <div id="drag-drop-area">
          <p>Drop .SYM files here</p>
        </div>
        <button id="back-button">Back</button>
      </div>

      <script>
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('status-update', (event, data) => {
          document.getElementById('ws-url').innerText = data.wsUrl || 'Not available';
          document.getElementById('folder-path').innerText = 'Folder Path: ' + (data.folderPath || 'Not set');
          document.getElementById('device-list').innerHTML = data.connectedDevices.length
            ? data.connectedDevices.map(device => '<li>' + device + '</li>').join('')
            : '<li>None</li>';
          document.getElementById('file-list').innerHTML = data.fileStatus.length
            ? data.fileStatus.map(file => '<li>' + file + '</li>').join('')
            : '<li>None</li>';
        });
  
        window.requestFolder = () => {
          ipcRenderer.send('request-folder');
        };

        // **Added IPC communication for mode switching**
        ipcRenderer.on('switch-mode', (event, mode) => {
          if (mode === 'drag-drop') {
            document.getElementById('main-content').style.display = 'none';
            document.getElementById('drag-drop-content').style.display = 'block';
          } else if (mode === 'normal') {
            document.getElementById('main-content').style.display = 'block';
            document.getElementById('drag-drop-content').style.display = 'none';
          }
        });

        // **Added drag-and-drop functionality**
        const dragDropArea = document.getElementById('drag-drop-area');

        dragDropArea.addEventListener('dragover', (event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDropArea.classList.add('dragover');
        });

        dragDropArea.addEventListener('dragleave', (event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDropArea.classList.remove('dragover');
        });

        dragDropArea.addEventListener('drop', (event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDropArea.classList.remove('dragover');

          const files = event.dataTransfer.files;
          if (files.length > 0) {
            const filePath = files[0].path;
            ipcRenderer.send('file-dropped', filePath);
          }
        });

        // **Added back button functionality**
        document.getElementById('back-button').addEventListener('click', () => {
          ipcRenderer.send('switch-to-normal');
        });
      </script>
    </body>
  </html>
  `;
  
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  

  ipcMain.on('request-folder', async () => {
    const result = dialog.showOpenDialogSync(mainWindow, {
      properties: ['openDirectory']
    });

    if (result) {
      folderPath = result[0];
      saveConfig();
      setupDatabase(folderPath); // Initialize database with the selected folder path
      startWatchingFolder(folderPath);
      updateStatus();
    }
  });

  // **Added listener for 'file-dropped' event**
  ipcMain.on('file-dropped', (event, filePath) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        console.error('Error reading file:', err);
        return;
      }

      if (wsClient) {
        wsClient.send(JSON.stringify({ type: 'file-content', content: data }));
      }

      // Send IPC message to switch back to normal mode
      mainWindow.webContents.send('switch-mode', 'normal');
    });
  });

  // **Added listener for 'switch-to-normal' event**
  ipcMain.on('switch-to-normal', () => {
    mainWindow.webContents.send('switch-mode', 'normal');
  });

  if (folderPath) {
    startWatchingFolder(folderPath);
  } else {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('status-update', { folderPath: 'Not set', wsUrl });
    });
  }
});

function startWatchingFolder(rootPath) {
  const pacenotePath = path.join(rootPath, 'Plugins', 'NGPCarMenu', 'MyPacenotes'); // Define pacenote folder path
  const watcher = chokidar.watch(pacenotePath, { persistent: true });

  watcher.on('add', filePath => {
    console.log(`File added: ${filePath}`);
    broadcastFileToClients(filePath, rootPath); // Pass rootPath to make file paths relative
    updateStatus();
  });
  watcher.on('change', filePath => {
    console.log(`File changed: ${filePath}`);
    broadcastFileToClients(filePath, rootPath);
    updateStatus();
  });
  watcher.on('unlink', filePath => {
    console.log(`File removed: ${filePath}`);
    sentFiles.delete(filePath); // Remove from sent files set if deleted
    updateStatus();
  });
}

// Rest of your WebSocket and database functions remain unchanged

function broadcastFileToClients(filePath, rootPath) {
  const pacenoteRoot = path.join(rootPath, 'Plugins', 'NGPCarMenu', 'MyPacenotes'); // Root path of MyPacenotes

  if (!filePath.endsWith('.ini')) {
    console.log(`Skipping non-.ini file: ${filePath}`);
    return;
  }

  if (sentFiles.has(filePath)) {
    console.log(`File ${filePath} has already been sent. Skipping.`);
    return;
  }

  try {
    // Relative path should be from inside MyPacenotes folder
    const relativePath = path.relative(pacenoteRoot, filePath);

    // Ensure the file is inside MyPacenotes
    if (relativePath.startsWith('..')) {
      console.log(`Skipping file outside of MyPacenotes: ${filePath}`);
      return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsedContent = ini.parse(fileContent);
    const stats = fs.statSync(filePath);
    const lastModified = stats.mtime.toISOString(); 
    //console.log(`Modified: ${lastModified}`);

    const jsonContent = {
      path: relativePath, // Only the relative path within MyPacenotes
      data: parsedContent,
      date: lastModified
    };

    Object.keys(clients).forEach(deviceId => {
      if (!clientFiles[deviceId]) clientFiles[deviceId] = new Set();
      if (!clientFiles[deviceId].has(filePath)) {
        //sendToClient(deviceId, jsonContent);
        clientFiles[deviceId].add(filePath);
      }
    });

    sentFiles.add(filePath);
    updateStatus();
  } catch (error) {
    console.error('Error reading or parsing .ini file:', error);
  }
}

// WebSocket server handling connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      //console.log('Received message:', data);
      //console.log('Parsed message:', data);

      // **Added handling for 'show-drag-area' command**
      if (data.command === 'show-drag-area') {
        wsClient = ws; // Save the WebSocket client that requested the drag-and-drop
        // Send IPC message to switch to drag-drop mode
        mainWindow.webContents.send('switch-mode', 'drag-drop');
      } else if (data.type === 'getStageTimes' && data.slotId !== undefined) {
        console.log('Received request for stage times for slotId:', data.slotId);
        getStageTimesAfterDate(data.stageId, data.slotId, folderPath, (stageTimes) => {
          console.log('Sending stage times:', stageTimes);
          ws.send(JSON.stringify({ type: 'stageTimes', data: stageTimes }));
        });
      } else if (data.type === 'save' && data.pacenotes && data.stageInfo) {
        console.log('Received save message. Attempting to save new INI file.');
        
        // Build the target directory path using your existing folder structure.
        savePacenotesToIni(data)
        
        // Send a success response back to the client.
        ws.send(JSON.stringify({ type: 'save', status: 'success' }));
    
      // Handle messages that include a deviceId.
      } else if (data.type === 'replace' && data.pacenotes && data.stageInfo) {
        console.log('Received replace message. Attempting to replace INI file.');
        
        // Build the target directory path using your existing folder structure.
        replacePacenotesToIni(data)
        
        // Send a success response back to the client.
        ws.send(JSON.stringify({ type: 'replace', status: 'success' }));
    
      // Handle messages that include a deviceId.
      } 
       else if (data.type === 'pacenoteLabels' && typeof data.data === 'string') {
  console.log('Received pacenoteLabels. Saving to .sym file…');
  savePacenoteLabelsToSym(data.data);
  ws.send(JSON.stringify({ type: 'pacenoteLabels', status: 'success' }));
}

      else if (data.command === 'getCodrivers') {
        const codriverDir = path.join(folderPath, 'Plugins', 'Pacenote', 'config', 'pacenotes', 'packages');
        console.log('getCoDrivers called');

        try {

          console.log('Resolved codriverDir:', codriverDir);
          console.log('Exists?', fs.existsSync(codriverDir));

          const pacenotes = codriverParser.processAllIniFiles(codriverDir);
          const organized = codriverParser.organizePacenotes(pacenotes);
          ws.send(JSON.stringify({
            type: 'codrivers',
            data: organized
          }));
          console.log('Sent codriver pacenotes to client');
         // console.log(JSON.stringify(organized, null, 2));
        } catch (err) {
          console.error('Failed to parse codriver data:', err.message);
          ws.send(JSON.stringify({ type: 'codrivers', error: err.message }));
       
        }
      }
       else if (data.deviceId) {
        const deviceId = data.deviceId;
        clients[deviceId] = ws;
        console.log('Device ID received: ${deviceId}');

        if (!clientFiles[deviceId]) {
          clientFiles[deviceId] = new Set();
        }
        await sendAllFilesToClient(deviceId)
        await sendMissingFiles(deviceId);
        updateStatus();
      } 
      else {
        console.log('Received message without deviceId:', message);
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

 

  ws.on('close', () => {
    console.log('Client disconnected');
    
    // **Clear wsClient if it matches the disconnected client**
    if (ws === wsClient) {
      wsClient = null;
    }

    for (const [deviceId, clientWs] of Object.entries(clients)) {
      if (clientWs === ws) {
        console.log(`Device ID ${deviceId} disconnected`);
        delete clients[deviceId];
        updateStatus();
        break;
      }
    }
  });
});

function savePacenotesToIni(data) {
  if (!data.stageInfo || !data.pacenotes || data.pacenotes.length === 0) {
      console.error("Invalid data received for saving.");
      return;
  }

  // Extract necessary information
  const stageInfo = data.stageInfo;
  const pacenotes = data.pacenotes;

  // Define file name and target folder
  const stageName = stageInfo.StageName.replace(/\s+/g, '_'); // Replace spaces with underscores
  const versionId = pacenotes[0].VersionID; // Assuming all pacenotes have the same VersionID
  const fileName = `${stageName}.ini`;

  // Get the full path to save the file
  const targetFolder = path.join(folderPath, 'Plugins', 'NGPCarMenu', 'MyPacenotes', stageInfo.FolderPath);
  const filePath = path.join(targetFolder, fileName);

  // Ensure target folder exists
  if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Construct the .ini file content
  let iniContent = `; MyPacenote generated by ${stageInfo.author}\n\n`;
  iniContent += `[PACENOTES]\n`;
  iniContent += `count = ${pacenotes.length}\n\n`;

  // Add each pacenote entry in the correct format
  pacenotes.forEach((note, index) => {
      iniContent += `[P${index}]\n`;
      iniContent += `type = ${note.Type}\n`;
      iniContent += `distance = ${note.Distance}\n`;
      iniContent += `flag = ${note.Flag}\n\n`;
  });

  // Write the .ini file
  fs.writeFileSync(filePath, iniContent, 'utf-8');
  console.log(`Saved pacenotes to: ${filePath}`);
}

function replacePacenotesToIni(data) {
  if (!data.stageInfo || !data.pacenotes || data.pacenotes.length === 0) {
      console.error("Invalid data received for saving.");
      return;
  }

  // Extract necessary information
  const stageInfo = data.stageInfo;
  const pacenotes = data.pacenotes;

  // Define file name and target folder
  const stageName = stageInfo.StageName.replace(/\s+/g, '_'); // Replace spaces with underscores
  const versionId = pacenotes[0].VersionID; // Assuming all pacenotes have the same VersionID
  const fileName = `${stageName}.ini`;

  // Get the full path to save the file
  const targetFolder = path.join(folderPath, 'Plugins', 'NGPCarMenu', 'MyPacenotes', stageInfo.FolderPath);
  const filePath = path.join(targetFolder, fileName);

  // Ensure target folder exists
  if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
  }

  // Construct the .ini file content
  let iniContent = `; MyPacenote generated by ${stageInfo.author}\n\n`;
  iniContent += `[PACENOTES]\n`;
  iniContent += `count = ${pacenotes.length}\n\n`;

  // Add each pacenote entry in the correct format
  pacenotes.forEach((note, index) => {
      iniContent += `[P${index}]\n`;
      iniContent += `type = ${note.Type}\n`;
      iniContent += `distance = ${note.Distance}\n`;
      iniContent += `flag = ${note.Flag}\n\n`;
  });

  // Write the .ini file
  fs.writeFileSync(filePath, iniContent, 'utf-8');
  console.log(`Saved pacenotes to: ${filePath}`);
}


function getStageTimesAfterDate(stageId, slotId, folderPath, callback) {

    const carsIniPath = path.join(folderPath, 'Cars', 'Cars.ini');

    if (!fs.existsSync(carsIniPath)) {
        return { error: `Cars.ini file not found at path: ${carsIniPath}` };
    }

    // Parse the Cars.ini file
    const config = ini.parse(fs.readFileSync(carsIniPath, 'utf-8'));
    const section = `Car0${slotId}`;

    // Check if the section exists
    if (!config[section]) {
        return { error: `Car slot ID ${slotId} not found in Cars.ini` };
    }

    // Check if the RSFCarID is present
    if (!config[section].RSFCarID) {
        return { error: `RSFCarID not found for slot ID ${slotId}` };
    }

    carId = parseInt(config[section].RSFCarID, 10);

  console.log(`Executing query for car ${carId} on stage ${stageId}`);

  // SQL Query
  const query = `
    SELECT 
    FRR.RaceDate, 
    FRR.RaceDateTime, 
    FRR.RallyName, 
    M.MapID AS StageID, 
    M.StageName, 
    FRR.Split1Time, -- Add Split1Time to the result
    FRR.Split2Time, -- Add Split2Time to the result
    FRR.FinishTime AS FastestStageTime,
    M.Format AS StageFormat, 
    M.Length AS StageLength, 
    C.CarID, 
    C.ModelName AS CarModel, 
    C.FIACategory AS FIACat,
    (FRR.FalseStartPenaltyTime + FRR.CutPenaltyTime + FRR.OtherPenaltyTime) AS TotalPenaltyTime
FROM 
    F_RallyResult FRR
JOIN 
    D_Map M ON FRR.MapKey = M.MapKey
JOIN 
    D_Car C ON FRR.CarKey = C.CarKey
WHERE 
    FRR.FinishTime IS NOT NULL 
    AND M.MapID = ? 
    AND C.CarID = ?  
ORDER BY 
    FRR.FinishTime ASC
LIMIT 1;

  `;

  // Execute the query
  db.all(query, [stageId, carId], (err, rows) => {
      if (err) {
          console.error('Database error:', err);
          callback(null); // Pass null to the callback in case of error
          return;
      }

      console.log('Query results:', rows);
      callback(rows); // Pass the query results to the callback
  });
}


// Function to send all available .ini files to a specific client
// Load all stage metadata from RallySimFans
async function loadAllStageMetadata() {
  const url = 'https://www.rallysimfans.hu/rbr/stages.php?lista=3&rendez=stage_id';
  const data = [];
  console.log('Loading stage metadata from RallySimFans...');

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Referer': 'https://www.rallysimfans.hu/'
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    // Grab all elements that carry a Tip('...') tooltip (these contain the stage HTML)
    const tooltipCarriers = $('div[onmouseover^="Tip(\'"], a[onmouseover^="Tip(\'"]');

    tooltipCarriers.each((_, el) => {
      const onmo = $(el).attr('onmouseover') || '';
      const m = onmo.match(/Tip\(\s*'([\s\S]*?)'\s*\)/);
      if (!m) return;

      // Unescape JS string and decode HTML entities
      let raw = m[1].replace(/\\"/g, '"').replace(/\\'/g, "'");
      const tooltipHTML = decode(raw);

      const $tip = cheerio.load(tooltipHTML);

      const getNext = (label) => {
        const tds = $tip('td').toArray();
        const lab = tds.find(td => $tip(td).text().trim().startsWith(label));
        if (!lab) return '';
        const next = $tip(lab).next('td');
        return next.length ? next.text().trim() : '';
      };

      const name = $tip('h2').first().text().trim();

      // ID may be in next cell or inline like "ID: 123"
      let idText = getNext('ID:');
      if (!idText) {
        const inline = $tip('td').toArray().map(td => $tip(td).text()).join(' ');
        const mm = inline.match(/ID:\s*(\d+)/);
        idText = mm ? mm[1] : '';
      }

      const lengthText = getNext('Length:');
      const surface = getNext('Surface:');
      const author = getNext('Author:');
      const country = getNext('Country:');

      // Lengths may be like "5,23 km" or "5.23 km"
      const lengthKm = parseFloat((lengthText || '').replace(',', '.').replace(/[^0-9.]/g, ''));

      if (name && idText) {
        data.push({
          StageId: parseInt(idText, 10),
          StageName: name,
          Length: Number.isFinite(lengthKm) ? Math.round(lengthKm * 1000) : null, // store as metres like before
          Surface: surface || '',
          Author: author || '',
          Country: country || ''
        });
      }
    });

    console.log(`✅ Found ${data.length} stages`);
  } catch (err) {
    console.error('❌ Failed to scrape stage data:', err.message);
  }

  return data;
}
  

/**
 * Save pacenote labels string to a .sym file
 * @param {string} labelsString - lines like "DefaultName = UserLabel"
 */
function savePacenoteLabelsToSym(labelsString) {
  const symDir = path.join(
    folderPath,
    'Plugins',
    'NGPCarMenu',
    'MyPacenotes',
    'CustomLabels'
  );
  fs.mkdirSync(symDir, { recursive: true });

  // Normalize line endings and ensure trailing newline
  const content =
    labelsString.trim().split(/\r?\n/).join('\r\n') + '\r\n';

  const symPath = path.join(symDir, 'pacenoteLabels.sym');
  fs.writeFileSync(symPath, content, 'utf8');
  console.log(`Pacenote labels saved to: ${symPath}`);
}


function normalize(str) {
  return str.toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, '')  // remove accents
    .replace(/[^a-z0-9]/g, '');                      // remove symbols/spaces
}

async function sendAllFilesToClient(deviceId) {
  const client = clients[deviceId];
  if (!client) return;

  console.log(`📤 Sending all files to device ${deviceId}...`);
  clientFiles[deviceId] = new Set();

  const pacenotePath = path.join(folderPath, 'Plugins', 'NGPCarMenu', 'MyPacenotes');
  const stageMetadataList = await loadAllStageMetadata();

  const folders = fs.readdirSync(pacenotePath, { withFileTypes: true }).filter(dirent => dirent.isDirectory());

  for (const folder of folders) {
    const folderPath = path.join(pacenotePath, folder.name);
    const folderNameNormalized = normalize(folder.name.trim());
    console.log(`🔍 Matching for folder: "${folder.name}" → "${folderNameNormalized}"`);

    let stageInfo = null;

    // --- Exact match
    stageInfo = stageMetadataList.find(s => normalize(s.StageName) === folderNameNormalized);
    if (stageInfo) console.log(`✅ Exact match: "${stageInfo.StageName}"`);

    // --- StartsWith match
    if (!stageInfo) {
      stageInfo = stageMetadataList.find(s => normalize(s.StageName).startsWith(folderNameNormalized));
      if (stageInfo) console.log(`✅ StartsWith match: "${stageInfo.StageName}"`);
    }

    // --- Fuzzy match
    if (!stageInfo) {
      const scored = stageMetadataList.map(s => ({
        stage: s,
        distance: levenshtein.get(normalize(s.StageName), folderNameNormalized)
      }));

      scored.sort((a, b) => a.distance - b.distance);

      if (scored.length && scored[0].distance <= 3) {
        if (scored.length === 1 || scored[0].distance + 2 < scored[1].distance) {
          stageInfo = scored[0].stage;
          console.log(`✅ Fuzzy match: "${stageInfo.StageName}" (distance ${scored[0].distance})`);
        } else {
          console.warn(`⚠️ Ambiguous fuzzy match for "${folder.name}":`, scored.slice(0, 3));
        }
      }
    }

    if (!stageInfo) {
      console.warn(`⛔ No match for "${folder.name}" (${folderNameNormalized}), skipping.`);
      continue;
    }

    // Load .ini files inside this folder
    const iniFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.ini'));

    for (const iniFile of iniFiles) {
      const filePath = path.join(folderPath, iniFile);
      const relativePath = path.relative(pacenotePath, filePath);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsedContent = ini.parse(fileContent);
      const stats = fs.statSync(filePath);
      const lastModified = stats.mtime.toISOString();

      const jsonContent = {
        type: 'file-content',
        path: filePath,
        data: parsedContent,
        date: lastModified,
        stageInfo: {
          ...stageInfo,
          FolderPath: `/${folder.name}`
        }
      };

      await sendToClient(deviceId, jsonContent);
    }
  }

  console.log(`✅ Resent all available files to device ${deviceId}`);
}


async function sendToClient(deviceId, jsonContent) {
  const client = clients[deviceId];
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(jsonContent));
   // console.log(JSON.stringify(jsonContent, null, 2));
    console.log(`📦 Sent to device ${deviceId}`);
    console.log('Stage Info:', JSON.stringify(jsonContent.stageInfo, null, 2));
  }
}

function sendMissingFiles(deviceId) {
  const client = clients[deviceId];
  if (!clientFiles[deviceId]) clientFiles[deviceId] = new Set();

  sentFiles.forEach(filePath => {
    const relativePath = path.relative(folderPath, filePath);
    const stats = fs.statSync(filePath);
    const lastModified = stats.mtime.toISOString(); 


//     if (!clientFiles[deviceId].has(filePath)) {
//       sendToClient(deviceId, {
//         path: relativePath,
//         data: ini.parse(fs.readFileSync(filePath, 'utf-8')),
//         date: lastModified
//       });
//       clientFiles[deviceId].add(filePath);
//     }
  });
}

app.on('before-quit', () => {
  bonjour.unpublishAll(() => {
    bonjour.destroy();
  });
});
