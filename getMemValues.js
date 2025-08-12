// debugRBRStage.js
// Node.js script to read and dump all RBR values per NGPCarMenu’s RBRAPI.h
// ASLR-aware: computes addresses from module base at runtime
// Supports a scan mode to discover unknown CarInfo offsets (--scan-carinfo)
// Outputs each metric as formatted text

const memoryjs = require('memoryjs');

// === CONFIGURATION ===
const PROC_NAME        = 'RichardBurnsRally_SSE.exe';
const DEFAULT_BASE     = 0x00400000;
const SAMPLE_INTERVAL  = 100; // ms

// Absolute VAs from RBRAPI.h (preferred base DEFAULT_BASE)
const ABS_OFF = {
  // Version
  ptrRBRVersion:        0x0165FC38,
  ptrRBRVersionMinor:   0x0165FC3C,
  ptrRBRVersionPatch:   0x0165FC40,
  rbrBase:              0x00400000,
  stageNamePtr:         0x007D1D64,
  mapInfoBase:          0x01659184,
  mapSettings:          0x01660800,
  mapSettingsEx:        0x008938F8,
  carControlsPtr:       0x0165FD68,
  carInfoPtr:           0x0165FC68,
  gameModeBase:         0x007EAC48,
  carMovementBase:      0x008EF660 // RBRCarMovement struct base
};
// Field-specific offsets
const MI_OFF = { curLap:0x00, totalLaps:0x04, stageLength:0x75310 };
const MS_OFF = { trackID:0x04, tyreType:0x38, weatherType:0x48, damageType:0x50, pacecarEnabled:0x54 };
const MSE_OFF= { timeOfDay:0x38, skyType:0x3C, surfaceWetness:0x14, surfaceAge:0x18 };
const CI_OFF = {
  hudX:0x00, hudY:0x04, raceStarted:0x08,
  speed:0x0C, rpm:0x10,
  waterTemp:0x14, oilTemp:0x18, turboPressure:0x1C,
  brakeTempFL:0x20, brakeTempFR:0x24, brakeTempRL:0x28, brakeTempRR:0x2C,
  tyreTempFL:0x30, tyreTempFR:0x34, tyreTempRL:0x38, tyreTempRR:0x3C,
  distanceFS:0x40, distanceTrav:0x44, distanceToFinish:0x48,
  stageProgress:0x4C, raceTime:0x50, bestLapTime:0x54, curLapTime:0x58,
  split1Time:0x5C, split2Time:0x60, raceFinished:0x64,
  drivingDir:0x68, fadeWrongWay:0x6C, gear:0x70,
  stageDelay:0x74, falseStart:0x78, splitNo:0x7C, finishPassed:0x80,
  // Damage offsets (replace with discovered values)
  damageFL: 0x00,
  damageFR: 0x00,
  damageRL: 0x00,
  damageRR: 0x00,
  // Car world coordinates
  carPosX: 0xEF8,
  carPosY: 0xEFC,
  carPosZ: 0xF00
};
const CC_OFF = { steering:0x5C, throttle:0x60, brake:0x64, handBrake:0x68, clutch:0x6C, gearUp:0x70, gearDown:0x74 };
const GAME_MODE_OFF = 0x0;  // Offset zero since gameModeBase now points directly to the field = 0x728;  // within RBRGameMode

// === HELPERS ===
function safeRead(handle, addr, type) {
  try { return memoryjs.readMemory(handle, addr, type); } catch { return NaN; }
}
function readWideString(handle, ptr) {
  if (!ptr) return '';
  try {
    const buf = memoryjs.readBuffer(handle, ptr, 256);
    return buf.toString('utf16le').replace(/\0.*$/,'');
  } catch { return ''; }
}
function format(key,val) {
  if (isNaN(val)) return 'N/A';
  switch(key) {
    case 'speed': return (val*3.6).toFixed(1)+' km/h';
    case 'stageLength': return (val/1000).toFixed(2)+' km';
    case 'waterTemp': case 'oilTemp': case 'turboPressure':
    case 'brakeTempFL': case 'tyreTempFL': return val.toFixed(1)+' °C';
    case 'rpm': return val.toFixed(0)+' RPM';
    case 'gear': return val.toString();
    default: return val.toString();
  }
}
function computeAddrs(base) {
  const r = {};
  for (let k in ABS_OFF) r[k] = base + (ABS_OFF[k] - DEFAULT_BASE);
  return r;
}

// === READ FUNCTIONS ===
function readMapInfo(h,a) {
  const m = {};
  m.curLap = safeRead(h,a.mapInfoBase+MI_OFF.curLap,memoryjs.INT);
  m.totalLaps = safeRead(h,a.mapInfoBase+MI_OFF.totalLaps,memoryjs.INT);
  m.stageLength = safeRead(h,a.mapInfoBase+MI_OFF.stageLength,memoryjs.INT);
  for (let k in MS_OFF) m[k] = safeRead(h,a.mapSettings+MS_OFF[k],memoryjs.INT);
  for (let k in MSE_OFF) m[k] = safeRead(h,a.mapSettingsEx+MSE_OFF[k],memoryjs.INT);
  return m;
}
function readCarInfo(h, a) {
  const c = {};
  let p = safeRead(h, a.carInfoPtr, memoryjs.PTR);
  p = typeof p === 'bigint' ? Number(p) : p;
  if (!p) return c;
  for (let k in CI_OFF) {
    const type = (k === 'gear') ? memoryjs.INT : memoryjs.FLOAT;
    let val = safeRead(h, p + CI_OFF[k], type);
    // Invert Y coordinate
    if (k === 'carPosY') {
      val = -val;
    }
    c[k] = val;
  }
  return c;
}
function readCarControls(h, a) {
  const ctl = {};
  let p = safeRead(h, a.carControlsPtr, memoryjs.PTR);
  p = typeof p === 'bigint' ? Number(p) : p;
  if (!p) return ctl;
  for (let k in CC_OFF) {
    ctl[k] = safeRead(h, p + CC_OFF[k], memoryjs.FLOAT);
  }
  return ctl;
}
function readGameMode(handle){
  // Directly read gameMode at absolute Cheat Engine address 0x04190770
  const addr = 0x04190770;
  const gm = safeRead(handle, addr, memoryjs.INT);
  const M = {1:'Driving',2:'Pause',3:'MainMenu',5:'Loading',8:'Replay',9:'Finished',10:'PreStart',12:'Exiting'};
  return M[gm] || `Mode${gm}`;
}
function scanCarInfo(h,a,len=512) {
  let p = safeRead(h,a.carInfoPtr,memoryjs.PTR);
  p = typeof p==='bigint'?Number(p):p;
  if (!p) { console.log('Invalid ptr'); return; }
  console.log('Scanning CarInfo:');
  for (let off=0;off<len;off+=4) {
    const f = safeRead(h,p+off,memoryjs.FLOAT);
    if (!isNaN(f)&&Math.abs(f)>0.1) console.log(`0x${off.toString(16)}: ${f}`);
  }
}

// === MAIN ===
(async()=>{
  let proc;
  try { proc=memoryjs.openProcess(PROC_NAME); console.log(`Opened ${PROC_NAME}`); }
  catch(e){console.error('Failed to open',e);return;}

  const mods = memoryjs.getModules(proc.th32ProcessID);
  const mod = mods.find(m=>m.szModule.toLowerCase()===PROC_NAME.toLowerCase());
  if(!mod){console.error('Module not found');return;}
  const addrs = computeAddrs(mod.modBaseAddr);

  if(process.argv.includes('--scan-carinfo')){ scanCarInfo(proc.handle,addrs); return; }

// Initialize previous damage values for detection
let prevDamage = { damageFL: 0, damageFR: 0, damageRL: 0, damageRR: 0 };

  setInterval(() => {
    console.clear();
    console.log('GameMode:', readGameMode(proc.handle, addrs));
    console.log('=== Stage/Map ===');
    const map = readMapInfo(proc.handle, addrs);
    for (let k in map) console.log(k + ':', format(k, map[k]));

    console.log('=== CarInfo ===');
    const car = readCarInfo(proc.handle, addrs);
    for (let k in car) console.log(k + ':', format(k, car[k]));

    // Damage detection
    console.log('=== Damage Detection ===');
    ['damageFL','damageFR','damageRL','damageRR'].forEach(key => {
      const curr = car[key] || 0;
      const prev = prevDamage[key] || 0;
      if (curr > prev) console.log(`${key} increased: ${prev} -> ${curr}`);
      prevDamage[key] = curr;
    });

    console.log('=== Controls ===');
    const ctl = readCarControls(proc.handle, addrs);
    for (let k in ctl) console.log(k + ':', ctl[k]);
  }, SAMPLE_INTERVAL);
})();
