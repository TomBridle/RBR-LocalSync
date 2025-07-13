// debugRBRStage.js
// Node.js script using memoryjs to read and dump RBR values each sample
// Reads all stage/map and car telemetry fields exposed by RBRAPI.h, plus game mode
// Dynamically computes addresses from module base (ASLR-aware)
// Also supports scanning CarInfo region to discover unknown offsets (use --scan-carinfo)
// Outputs each metric as formatted lines
// Run as Administrator with matching Node bitness (32-bit for 32-bit RBR)

const memoryjs = require('memoryjs');

// === CONFIGURATION ===
const PROC_NAME = 'RichardBurnsRally_SSE.exe';
const DEFAULT_BASE = 0x00400000;
const SAMPLE_INTERVAL = 100; // ms

// Absolute virtual addresses from RBRAPI.h (preferred base DEFAULT_BASE)
const ABS_OFF = {
  // Stage and map info
  stageNamePtr:    0x007D1D64,  // WCHAR* to stage name
  mapInfoBase:     0x01659184,  // RBRMapInfo struct base
  stageLengthOff:  0x00075310,  // offset in RBRMapInfo
  mapSettings:     0x01660800,  // RBRMapSettings struct base
  mapSettingsEx:   0x008938F8,  // RBRMapSettingsEx struct base
  // Car info
  carInfoPtrAddr:  0x0165FC68,  // pointer to RBRCarInfo struct
  // Game mode struct
  gameModeBase:    0x007EAC48   // RBRGameMode struct base
};
const GAME_MODE_OFF = 0x728;    // offset of gameMode field in RBRGameMode

// Offsets within RBRMapSettings
const MS_OFF = { trackID:0x04, tyreType:0x38, weatherType:0x48, damageType:0x50, pacecarEnabled:0x54 };
// Offsets within RBRMapSettingsEx
const MSE_OFF= { timeOfDay:0x38, skyType:0x3C, surfaceWetness:0x14, surfaceAge:0x18 };
// Offsets within RBRCarInfo struct (floats unless noted)
const CI_OFF = {
  hudX:           0x00,  hudY:         0x04,  raceStarted: 0x08,
  speed:          0x0C,  rpm:          0x10,
  waterTemp:      0x14,  turboPressure:0x18,
  distanceFS:     0x20,  distanceTrav:0x24, distanceToFinish:0x28,
  stageProgress:  0x13C, raceTime:    0x140,
  raceFinished:   0x144, drivingDir:  0x150, fadeWrongWay:0x154,
  gear:           0x170,
  stageDelay:     0x244, falseStart:  0x248,
  splitNo:        0x254, split1Time:  0x258, split2Time:  0x25C,
  finishPassed:   0x2C4,
  // brakes and tyres unknown until scan
};

// Car controls offsets
const CC_OFF = { steering:0x007EAC48+0x738+0x5C, throttle:0x60, brake:0x64, handBrake:0x68, clutch:0x6C };
// Controller movement in RBRCarMovement omitted for brevity

// === HELPERS ===
function safeRead(handle, addr, type) {
  try { return memoryjs.readMemory(handle, addr, type); }
  catch { return NaN; }
}
function readWideString(handle, ptr, max=256) {
  if (!ptr) return '';
  try { const buf = memoryjs.readBuffer(handle, ptr, max); return buf.toString('utf16le').replace(/\0.*$/,''); }
  catch { return ''; }
}
function format(key,val){
  if (isNaN(val)) return 'N/A';
  switch(key){
    case 'speed': return (val*3.6).toFixed(1)+' km/h';
    case 'stageLength': return (val/1000).toFixed(2)+' km';
    case 'waterTemp': case 'turboPressure':
    case 'raceTime': return val.toFixed(1);
    case 'rpm': return val.toFixed(0)+' RPM';
    case 'gear': return val.toString();
    default: return val.toString();
  }
}

function computeAddrs(base){
  const r={};
  for(let k in ABS_OFF) r[k] = base + (ABS_OFF[k] - DEFAULT_BASE);
  return r;
}

// === READ FUNCTIONS ===
function readMapInfo(h, a){
  const m={};
  m.stageLength = safeRead(h,a.mapInfoBase+ABS_OFF.stageLengthOff,memoryjs.INT);
  for(let k in MS_OFF) m[k]=safeRead(h,a.mapSettings+MS_OFF[k],memoryjs.INT);
  for(let k in MSE_OFF)m[k]=safeRead(h,a.mapSettingsEx+MSE_OFF[k],memoryjs.INT);
  return m;
}
function readCarInfo(h,a){
  const c={};
  let p= safeRead(h,a.carInfoPtrAddr,memoryjs.PTR);
  p= typeof p==='bigint'? Number(p):p;
  if(!p) return c;
  for(let k in CI_OFF) c[k]= safeRead(h,p+CI_OFF[k], k==='gear'?memoryjs.INT:memoryjs.FLOAT);
  return c;
}
function readGameMode(handle){
  // Read absolute gameMode without ASLR adjustment
  const addr = ABS_OFF.gameModeBase + GAME_MODE_OFF;
  const gm = safeRead(handle, addr, memoryjs.INT);
  const M = {
    1: 'Driving',
    2: 'Pause',
    3: 'MainMenu',
    5: 'Loading',
    8: 'Replay',
    9: 'Finished',
    10: 'PreStart',
    12: 'Exiting'
  };
  return M[gm] || `Mode${gm}`;
};

function scanCarInfo(h,a,len=512){
  console.log('Scanning CarInfo...');
  let p= safeRead(h,a.carInfoPtrAddr,memoryjs.PTR); p=typeof p==='bigint'?Number(p):p;
  if(!p){console.log('Invalid ptr'); return;}
  for(let off=0;off<len;off+=4){ let f=safeRead(h,p+off,memoryjs.FLOAT);
    if(!isNaN(f)&&Math.abs(f)>0.1) console.log(`0x${off.toString(16)}: ${f}`);
  }
}

// === MAIN ===
(async()=>{
  let proc;
  try{ proc=memoryjs.openProcess(PROC_NAME);}catch(e){console.error('Open failed',e);return;}
  const mods = memoryjs.getModules(proc.th32ProcessID);
  const mod = mods.find(m=>m.szModule.toLowerCase()===PROC_NAME.toLowerCase());
  if(!mod){console.error('Module not found');return;}
  const addrs=computeAddrs(mod.modBaseAddr);
  if(process.argv.includes('--scan-carinfo')){ scanCarInfo(proc.handle,addrs); return; }

  setInterval(()=>{
    console.clear();
    console.log('GameMode:',readGameMode(proc.handle,addrs));
    console.log('=== Stage/Map ===');
    const map=readMapInfo(proc.handle,addrs);
    for(let k in map) console.log(k+':',format(k,map[k]));
    console.log('=== CarInfo ===');
    const car=readCarInfo(proc.handle,addrs);
    for(let k in car) console.log(k+':',format(k,car[k]));
  },SAMPLE_INTERVAL);
})();
