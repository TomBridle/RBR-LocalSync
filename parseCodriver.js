const fs = require("fs");
const path = require("path");
const ini = require("ini");

let visitedFiles = new Set(); // To prevent re-processing of the same file

// Parse a single PACENOTE file and extract `[PACENOTE::...]` sections
function parsePacenoteFile(filePath, pacenoteType) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const iniContent = fs.readFileSync(filePath, "utf-8");
    const config = ini.parse(iniContent);

    const pacenotes = [];
    const keyOrder = ["id", "sounds", "snd0", "snd1", "column", "link"];

    for (const section in config) {
        if (section.startsWith("PACENOTE::")) {
            const name = section.replace("PACENOTE::", "");
            const values = keyOrder.reduce((acc, key) => {
                acc[key] = config[section]?.[key] || null;
                return acc;
            }, {});
            values["name"] = name;
            values["type"] = pacenoteType; // Add the pacenote type
            pacenotes.push(values);
        }
    }

    return pacenotes;
}

// Recursively process all `.ini` files referenced in `[PACKAGE::...]` or `[CATEGORY::...]` sections
function processIniFile(filePath, baseDir, pacenoteType = "UNKNOWN") {
    if (visitedFiles.has(filePath)) {
        return []; // Skip already processed files
    }

    console.log(`Processing INI file: ${filePath}`);
    visitedFiles.add(filePath);

    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const iniContent = fs.readFileSync(filePath, "utf-8");
    const config = ini.parse(iniContent);

    const pacenotes = [];

    // Process `[PACKAGE::...]` sections for references
    for (const section in config) {
        if (section.startsWith("PACKAGE::")) {
            const packageType = section.replace("PACKAGE::", "");
            const packageSection = config[section];

            for (const key in packageSection) {
                if (key.startsWith("file")) {
                    const relativePath = packageSection[key]?.replace("\\", "/");
                    const fullPath = path.resolve(baseDir, relativePath);

                    if (fs.existsSync(fullPath)) {
                        console.log(`Parsing referenced file from PACKAGE: ${fullPath}`);
                        pacenotes.push(...processIniFile(fullPath, path.dirname(fullPath), packageType));
                    } else {
                        console.warn(`Referenced file not found: ${fullPath}`);
                    }
                }
            }
        }
    }

    // Process `[CATEGORY::...]` sections for references
    for (const section in config) {
        if (section.startsWith("CATEGORY::")) {
            const categorySection = config[section];
            const relativePath = categorySection?.file?.replace("\\", "/");
            if (relativePath) {
                const fullPath = path.resolve(baseDir, relativePath);

                if (fs.existsSync(fullPath)) {
                    console.log(`Parsing referenced file from CATEGORY: ${fullPath}`);
                    pacenotes.push(...processIniFile(fullPath, path.dirname(fullPath), pacenoteType));
                } else {
                    console.warn(`Referenced CATEGORY file not found: ${fullPath}`);
                }
            }
        }
    }

    // Parse PACENOTE sections in the current file
    pacenotes.push(...parsePacenoteFile(filePath, pacenoteType));

    return pacenotes;
}

// Process all `.ini` files in the base directory
function processAllIniFiles(directoryPath) {
    console.log(`Processing all INI files in directory: ${directoryPath}`);
    if (!fs.existsSync(directoryPath)) {
        throw new Error(`Directory not found: ${directoryPath}`);
    }

    const iniFiles = fs.readdirSync(directoryPath).filter((file) => file.endsWith(".ini"));
    const aggregatedPacenotes = [];

    iniFiles.forEach((file) => {
        const fullPath = path.join(directoryPath, file);
        try {
            const pacenotes = processIniFile(fullPath, directoryPath);
            aggregatedPacenotes.push(...pacenotes);
        } catch (error) {
            console.error(`Error processing ${file}: ${error.message}`);
        }
    });

    return aggregatedPacenotes;
}

// Export aggregated pacenotes to a JSON file
function exportJsonResults(pacenotes, outputFilePath) {
    fs.writeFileSync(outputFilePath, JSON.stringify(pacenotes, null, 2), "utf-8");
    console.log(`Pacenotes exported to JSON: ${outputFilePath}`);
}

// Example usage
try {
    const baseDir = "E:/Richard Burns Rally/Plugins/Pacenote/config/pacenotes"; // Adjust to the actual directory
    const outputFilePath = "E:/Richard Burns Rally/Plugins/Pacenote/config/pacenotes.json";

    console.log(`Starting processing for directory: ${baseDir}`);
    const pacenotes = processAllIniFiles(baseDir);

    console.log("Aggregated PACENOTES Data:");
    console.log(JSON.stringify(pacenotes, null, 2));

    exportJsonResults(pacenotes, outputFilePath);

    console.log("Processing complete.");
} catch (error) {
    console.error("Error:", error.message);
}


// const baseDir = "C:/Richard Burns Rally/Plugins/Pacenote/config/pacenotes"; // Update to the actual base directory
//     console.log(`Starting processing for directory: ${baseDir}`);