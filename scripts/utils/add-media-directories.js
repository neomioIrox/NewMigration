// Script to add YearDirectory and MonthDirectory to all media mappings
const fs = require('fs');

const mappingFile = './mappings/ProjectMapping_Funds_Fixed.json';

console.log('Loading mapping file...');
const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));

const directoryFields = {
  "YearDirectory": {
    "convertType": "const",
    "value": "2020"
  },
  "MonthDirectory": {
    "convertType": "const",
    "value": "01"
  }
};

let updateCount = 0;

// Add directory fields to all media types in all languages
for (const language in mapping.mediaMappings) {
  for (const mediaType in mapping.mediaMappings[language]) {
    const mediaMapping = mapping.mediaMappings[language][mediaType];

    // Save the condition (should be at the end)
    const condition = mediaMapping.condition;
    delete mediaMapping.condition;

    // Add directory fields after RelativePath
    const entries = Object.entries(mediaMapping);
    const newMapping = {};

    for (const [key, value] of entries) {
      newMapping[key] = value;

      // After RelativePath, add the directory fields
      if (key === 'RelativePath') {
        Object.assign(newMapping, directoryFields);
      }
    }

    // Add condition back at the end
    newMapping.condition = condition;

    // Replace the mapping
    mapping.mediaMappings[language][mediaType] = newMapping;
    updateCount++;

    console.log(`✅ Added directories to ${language}.${mediaType}`);
  }
}

// Save the updated mapping
fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));

console.log(`\n✅ Successfully added YearDirectory and MonthDirectory to ${updateCount} media types`);
console.log(`📁 Updated file: ${mappingFile}`);
