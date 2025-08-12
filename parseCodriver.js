const fs = require("fs");
const path = require("path");
const ini = require("ini");
module.exports = {
    processAllIniFiles,
    organizePacenotes
  };
let visitedFiles = new Set(); // To prevent re-processing of the same file

// Parse a single PACENOTE file and extract `[PACENOTE::...]` sections
function parsePacenoteFile(filePath, pacenoteType) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const iniContent = fs.readFileSync(filePath, "utf-8");
    const config = ini.parse(iniContent);

    const pacenotes = [];
    const keyOrder = ["id", "column", "link"];
    const fileName = path.basename(filePath);

    for (const section in config) {
        if (section.startsWith("PACENOTE::")) {
            const name = section.replace("PACENOTE::", "");
            const sectionData = config[section];

            // Normalize keys to lowercase for consistent access
            const normalized = {};
            for (const key in sectionData) {
                normalized[key.toLowerCase()] = sectionData[key];
            }

            const values = keyOrder.reduce((acc, key) => {
                acc[key] = normalized[key] || null;
                return acc;
            }, {});

            values["name"] = name;
            values["type"] = pacenoteType;
            values["source"] = fileName.replace(".ini", "");
            pacenotes.push(values);
        }
    }

    return pacenotes;
}


// Determine the type from the folder name of the referenced file
function determineTypeFromPath(filePath, baseDir) {
    const relativePath = path.relative(baseDir, filePath); // Get the path relative to the base directory
    const folders = relativePath.split(path.sep); // Split into folder segments
    return folders.length > 1 ? folders[0] : "UNKNOWN"; // Use the first folder down from the base
}

// Recursively process all `.ini` files referenced in `[PACKAGE::...]` or `[CATEGORY::...]` sections
function processIniFile(filePath, baseDir, pacenoteType = "UNKNOWN", visitedFiles) {
    const resolvedFilePath = path.resolve(baseDir, filePath);

    if (visitedFiles.has(resolvedFilePath)) {
        return []; // Skip already processed files
    }

    console.log(`Processing INI file: ${resolvedFilePath}`);
    visitedFiles.add(resolvedFilePath);

    if (!fs.existsSync(resolvedFilePath)) {
        throw new Error(`File not found: ${resolvedFilePath}`);
    }

    const iniContent = fs.readFileSync(resolvedFilePath, "utf-8");
    const config = ini.parse(iniContent);

    const pacenotes = [];

    // Determine type from folder name if not explicitly provided
    if (pacenoteType === "UNKNOWN") {
        pacenoteType = determineTypeFromPath(resolvedFilePath, baseDir);
        console.log(`Derived pacenote type from folder: ${pacenoteType}`);
    }

    // Process `[PACKAGE::...]` sections for references
    for (const section in config) {
        if (section.startsWith("PACKAGE::")) {
            const packageType = section.replace("PACKAGE::", "");
            const packageSection = config[section];

            for (const key in packageSection) {
                if (key.startsWith("file")) {
                    const relativePath = packageSection[key]?.replace("\\", "/");
                    if (relativePath) {
                        const fullPath = path.resolve(baseDir, relativePath);
                        console.log(`Parsing referenced file from PACKAGE: ${fullPath}`);
                        pacenotes.push(...processIniFile(fullPath, baseDir, packageType, visitedFiles));
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
                console.log(`Parsing referenced file from CATEGORY: ${fullPath}`);
                pacenotes.push(...processIniFile(fullPath, baseDir, pacenoteType, visitedFiles));
            }
        }
    }

    // Parse PACENOTE sections in the current file
    pacenotes.push(...parsePacenoteFile(resolvedFilePath, pacenoteType));

    return pacenotes;
}


// Process and organize the pacenotes into the desired JSON format
function organizePacenotes(pacenotes) {
    const cornerTypes = {};
    const standardNotes = [];

    for (const pacenote of pacenotes) {
        const { type, source } = pacenote;

        if (type === "corners") {
            if (!cornerTypes[source]) {
                cornerTypes[source] = [];
            }
            cornerTypes[source].push(pacenote);
        } else {
            standardNotes.push(pacenote);
        }
    }

    return { cornerTypes, standardNotes };
}

function processAllIniFiles(directoryPath) {
    console.log(`Processing all INI files in directory: ${directoryPath}`);
    if (!fs.existsSync(directoryPath)) {
        throw new Error(`Directory not found: ${directoryPath}`);
    }

    const visitedFiles = new Set(); // <== Scoped here now

    const iniFiles = fs.readdirSync(directoryPath).filter((file) => file.endsWith(".ini"));
    const aggregatedPacenotes = [];

    iniFiles.forEach((file) => {
        const fullPath = path.join(directoryPath, file);
        try {
            const pacenotes = processIniFile(fullPath, directoryPath, "UNKNOWN", visitedFiles);
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
    const baseDir = "E:/Richard Burns Rally/Plugins/Pacenote/config/pacenotes/packages"; // Adjust to the actual directory
    const outputFilePath = "E:/Richard Burns Rally/Plugins/Pacenote/config/pacenotes.json";

    console.log(`Starting processing for directory: ${baseDir}`);
    const pacenotes = processAllIniFiles(baseDir);

    console.log("Organizing pacenotes...");
    const organizedPacenotes = organizePacenotes(pacenotes);

    console.log("Exporting pacenotes...");
    exportJsonResults(organizedPacenotes, outputFilePath);

    console.log("Processing complete.");
} catch (error) {
    console.error("Error:", error.message);
}
