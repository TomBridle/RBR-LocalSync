const fs = require('fs');
const chalk = require('chalk');

// Load the two JSON files
const file1 = JSON.parse(fs.readFileSync('janne.json', 'utf8'));
const file2 = JSON.parse(fs.readFileSync('default.json', 'utf8'));

// Create a mapping of names to full objects for each file
const map1 = file1.reduce((acc, entry) => {
    if (entry.name) acc[entry.name] = entry;
    return acc;
}, {});

const map2 = file2.reduce((acc, entry) => {
    if (entry.name) acc[entry.name] = entry;
    return acc;
}, {});

// Find differences
const differences = [];
const uniqueTo1 = [];
const uniqueTo2 = [];

// Check for differences in matching names
Object.keys(map1).forEach(name => {
    if (map2[name]) {
        const entry1 = map1[name];
        const entry2 = map2[name];
        const diff = {};

        // Compare all fields, including 'id'
        Object.keys(entry1).forEach(key => {
            if (entry1[key] !== entry2[key]) {
                diff[key] = {
                    file1: entry1[key],
                    file2: entry2[key]
                };
            }
        });

        // If there are differences, add them to the result
        if (Object.keys(diff).length > 0) {
            differences.push({ name, id_file1: entry1.id, id_file2: entry2.id, differences: diff });
        }
    } else {
        uniqueTo1.push(name);
    }
});

// Find names unique to file2
Object.keys(map2).forEach(name => {
    if (!map1[name]) {
        uniqueTo2.push(name);
    }
});

// Output the results
if (differences.length > 0) {
    console.log(chalk.green('Differences found in matching names:'));
    differences.forEach(({ name, id_file1, id_file2, differences }) => {
        console.log(chalk.bold(`Name: ${name}`));
        console.log(chalk.yellow(`  ID (File 1): ${id_file1 || 'N/A'}`));
        console.log(chalk.yellow(`  ID (File 2): ${id_file2 || 'N/A'}`));
        Object.keys(differences).forEach(key => {
            console.log(
                `  ${key}: ` +
                chalk.red(`File 1: ${differences[key].file1 || 'N/A'}`) +
                chalk.blue(` | File 2: ${differences[key].file2 || 'N/A'}`)
            );
        });
        console.log(); // Add spacing between entries
    });
} else {
    console.log(chalk.green('No differences found in matching names.'));
}

if (uniqueTo1.length > 0) {
    console.log(chalk.green('Names unique to file1:'));
    uniqueTo1.forEach(name => console.log(chalk.red(`  ${name}`)));
    uniqueTo1.forEach(id => console.log(chalk.red(`  ${id}`)));

}

if (uniqueTo2.length > 0) {
    console.log(chalk.green('Names unique to file2:'));
    uniqueTo2.forEach(name => console.log(chalk.blue(`  ${name}`)));
    uniqueTo2.forEach(id => console.log(chalk.blue(`  ${id}`)));

}
