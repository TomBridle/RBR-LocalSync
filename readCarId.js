const fs = require('fs');
const ini = require('ini');

/**
 * Function to populate car IDs and names from Cars.ini file
 * @param {string} carsIniPath - Path to the Cars.ini file
 * @returns {object} - A dictionary mapping slot IDs to car details
 */
function populateCarIds(carsIniPath) {
    if (!fs.existsSync(carsIniPath)) {
        console.error(`File '${carsIniPath}' was not found, car identification will not work.`);
        return null;
    }

    const config = ini.parse(fs.readFileSync(carsIniPath, 'utf-8'));
    const slotToCarID = {};

    for (let i = 0; i < 8; i++) {
        const section = `Car0${i}`;
        const carCgsFileName = config[section]?.FileName || '';
        const carName = config[section]?.CarName || '';

        if (!carCgsFileName) {
            console.log(`Failed to load car at slot ID: ${i}`);
        } else {
            slotToCarID[i] = {
                hash: carCgsFileName.hashCode(),
                carCgsFileName,
                carName,
            };
            console.log(`Car in slot: ${i} hashed to: 0x${carCgsFileName.hashCode().toString(16)}. (${carName || 'Unknown'} - File: ${carCgsFileName})`);
        }
    }

    return slotToCarID;
}

/**
 * Utility function to hash a string into a unique 32-bit integer
 * @returns {number} - A 32-bit hash code
 */
String.prototype.hashCode = function () {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
        const char = this.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

/**
 * Function to get car details by slot ID
 * @param {number} slotId - The slot ID to look up
 * @param {object} slotToCarID - The mapping of slot IDs to car details
 * @returns {object|null} - Car details or null if slot ID is not found
 */
function getCarDetailsBySlotId(slotId, slotToCarID) {
    if (slotToCarID[slotId]) {
        return slotToCarID[slotId];
    } else {
        console.error(`Slot ID ${slotId} not found in Cars.ini data.`);
        return null;
    }
}

/**
 * Main function to demonstrate car lookup
 */
function main() {
    const carsIniPath = './Cars/Cars.ini'; // Adjust the path as needed
    const slotToCarID = populateCarIds(carsIniPath);

    if (!slotToCarID) {
        console.error('Failed to populate car IDs.');
        return;
    }

    // Example: Slot ID provided from elsewhere
    const slotId = 5; // Replace with your actual slotId
    const carDetails = getCarDetailsBySlotId(slotId, slotToCarID);

    if (carDetails) {
        console.log(`Car details for slot ID ${slotId}:`);
        console.log(`Car Name: ${carDetails.carName}`);
        console.log(`Car File: ${carDetails.carCgsFileName}`);
        console.log(`Car Hash: 0x${carDetails.hash.toString(16)}`);
    } else {
        console.error(`No car found for slot ID ${slotId}`);
    }
}

// Run the main function
main();