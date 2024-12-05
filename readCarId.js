const fs = require('fs');
const ini = require('ini');

/**
 * Function to get the RSFCarID for a given car slot ID
 * @param {string} carsIniPath - Path to the Cars.ini file
 * @param {number} slotId - The slot ID (e.g., 5)
 * @returns {object} - JSON with the CarId if found or an error message
 */
function getRSFCarID(carsIniPath, slotId) {
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

    // Return the RSFCarID
    return { CarId: parseInt(config[section].RSFCarID, 10) };
}

// Example usage
function main() {
    const carsIniPath = 'E:/Richard Burns Rally/Cars/Cars.ini'; // Adjust the path as needed
    const slotId = 5; // Replace with the slot ID you want to query

    const result = getRSFCarID(carsIniPath, slotId);
    console.log(JSON.stringify(result, null, 2));
}

// Run the example
main();
