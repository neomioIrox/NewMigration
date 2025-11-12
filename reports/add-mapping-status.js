const fs = require('fs');
const path = require('path');

// Define completed line numbers based on MIGRATION_STATUS.md
const completedLines = new Set([
    // Step 1 - Funds - Project table (145-254)
    149, 151, 153, 158, 161, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180,

    // Step 1 - Funds - ProjectItem (1827-1846)
    1827, 1828, 1829, 1830, 1831, 1832, 1833, 1834, 1835, 1836, 1837, 1838, 1839, 1840, 1841, 1842, 1843, 1844, 1845, 1846,

    // Step 1 - Funds - ProjectLocalization Hebrew (1882-1925)
    1887, 1888, 1901, 1902, 1915, 1916,

    // Step 1.1 - Collections - Project table (383-534) - same fields as Funds
    387, 389, 391, 396, 399, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,

    // Step 1.1 - Collections - ProjectItem Certificate (2594-2611)
    2594, 2595, 2596, 2597, 2598, 2599, 2600, 2601, 2602, 2603, 2604, 2605, 2606, 2607, 2608, 2609, 2610, 2611,

    // Step 1.1 - Collections - ProjectItem Donation (2613-2629)
    2613, 2614, 2615, 2616, 2617, 2618, 2619, 2620, 2621, 2622, 2623, 2624, 2625, 2626, 2627, 2628, 2629,

    // Step 1.1 - Collections - ProjectLocalization Hebrew (2097-2141)
    2102, 2103, 2116, 2117, 2130, 2131,

    // ProjectLocalization English for all (similar pattern)
    1926, 1927, 1940, 1941, 1954, 1955,
    2058, 2059, 2072, 2073, 2086, 2087,

    // ProjectLocalization French for all
    1968, 1969, 1982, 1983, 1996, 1997,
    2058, 2059, 2072, 2073, 2086, 2087
]);

// Read the CSV file (from parent directory)
const csvPath = path.join(__dirname, '..', 'Mapping.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

// Process CSV: Add Status column
const outputLines = [];
for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];

    // Determine status
    let status = '⏳'; // Default: not yet implemented
    if (completedLines.has(lineNumber)) {
        status = '✅'; // Completed
    }

    // Add status as first column
    const modifiedLine = `${status},${line}`;
    outputLines.push(modifiedLine);
}

// Write updated CSV
const outputCsvPath = path.join(__dirname, 'Mapping-WithStatus.csv');
fs.writeFileSync(outputCsvPath, outputLines.join('\n'), 'utf-8');
console.log(`✅ Created: ${outputCsvPath}`);

// Generate HTML version with colors
const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mapping Coverage - Visual Status</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }
        .stats {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stats-item {
            display: inline-block;
            margin-right: 30px;
            font-size: 18px;
        }
        .completed { color: #4CAF50; font-weight: bold; }
        .pending { color: #FF9800; font-weight: bold; }
        table {
            border-collapse: collapse;
            width: 100%;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
            font-size: 13px;
        }
        th {
            background-color: #4CAF50;
            color: white;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        tr:hover {
            background-color: #e8f5e9;
        }
        .status-completed {
            background-color: #c8e6c9 !important;
        }
        .status-pending {
            background-color: #fff9c4 !important;
        }
        .status-cell {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
        }
        .line-number {
            color: #666;
            font-weight: bold;
            text-align: right;
        }
    </style>
</head>
<body>
    <h1>📊 Database Migration Mapping Coverage</h1>

    <div class="stats">
        <div class="stats-item">
            <span class="completed">✅ Completed:</span> ${completedLines.size} rows
        </div>
        <div class="stats-item">
            <span class="pending">⏳ Pending:</span> ${lines.length - completedLines.size} rows
        </div>
        <div class="stats-item">
            <strong>Total:</strong> ${lines.length} rows
        </div>
        <div class="stats-item">
            <strong>Progress:</strong> ${Math.round((completedLines.size / lines.length) * 100)}%
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Status</th>
                <th>Step</th>
                <th>Table</th>
                <th>Column</th>
                <th>Type</th>
                <th>Nullable</th>
                <th>Length</th>
                <th>Convert Type</th>
                <th>Old Table</th>
                <th>Old Column</th>
                <th>Comments</th>
            </tr>
        </thead>
        <tbody>
${outputLines.map((line, idx) => {
    const lineNumber = idx + 1;
    const columns = line.split(',');
    const status = columns[0];
    const rowClass = status === '✅' ? 'status-completed' : 'status-pending';

    return `            <tr class="${rowClass}">
                <td class="line-number">${lineNumber}</td>
                <td class="status-cell">${status}</td>
                ${columns.slice(1, 12).map(col => `<td>${col || ''}</td>`).join('\n                ')}
            </tr>`;
}).join('\n')}
        </tbody>
    </table>

    <br><br>
    <p style="color: #666; text-align: center;">
        Generated: ${new Date().toLocaleString()}<br>
        Green rows (✅) = Implemented and tested<br>
        Yellow rows (⏳) = Not yet implemented
    </p>
</body>
</html>`;

const outputHtmlPath = path.join(__dirname, 'Mapping-Coverage.html');
fs.writeFileSync(outputHtmlPath, htmlContent, 'utf-8');
console.log(`✅ Created: ${outputHtmlPath}`);
console.log(`\n📊 Statistics:`);
console.log(`   ✅ Completed: ${completedLines.size} rows`);
console.log(`   ⏳ Pending: ${lines.length - completedLines.size} rows`);
console.log(`   📈 Progress: ${Math.round((completedLines.size / lines.length) * 100)}%`);
console.log(`\n🌐 Open the HTML file in your browser to see the color-coded mapping!`);
