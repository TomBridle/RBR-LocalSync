const memoryjs = require('memoryjs');

// Replace 'rbr.exe' with the actual process name of the game
const processName = 'rbr.exe';

// Open the process by its name
const processObject = memoryjs.openProcess(processName);

if (!processObject || !processObject.handle) {
    console.error('Failed to open process. Ensure the game is running.');
    process.exit(1);
}

// Base address of RBRCarInfo structure
const carInfoAddress = 0x0165FC68;

// Buffer size to match the structure layout (adjust if necessary)
const bufferSize = 256;

// Read memory from the specified address
try {
    const carInfoBuffer = memoryjs.readBuffer(processObject.handle, carInfoAddress, bufferSize);
    console.log('Car Info Buffer:', carInfoBuffer);
    
    // Example: If you know offsets, you can parse the buffer
    const carSpeed = carInfoBuffer.readFloatLE(0x0C); // Speed at offset 0x0C
    console.log('Car Speed:', carSpeed);

    const carRPM = carInfoBuffer.readFloatLE(0x10); // RPM at offset 0x10
    console.log('Car RPM:', carRPM);
} catch (err) {
    console.error('Failed to read memory:', err.message);
}

// Close the process handle
memoryjs.closeProcess(processObject.handle);