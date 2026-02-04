// Script to add SourceType to all media mappings
const fs = require('fs');

const mappingFile = './mappings/ProjectMapping_Funds_Fixed.json';

console.log('Loading mapping file...');
const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));

const sourceTypeField = {
  "SourceType": {
    "convertType": "const",
    "value": "1"
  }
};

let updateCount = 0;

// Add SourceType to all media types in all languages
for (const language in mapping.mediaMappings) {
  for (const mediaType in mapping.mediaMappings[language]) {
    const mediaMapping = mapping.mediaMappings[language][mediaType];

    // Save the condition (should be at the end)
    const condition = mediaMapping.condition;
    delete mediaMapping.condition;

    // Add SourceType after MonthDirectory
    const entries = Object.entries(mediaMapping);
    const newMapping = {};

    for (const [key, value] of entries) {
      newMapping[key] = value;

      // After MonthDirectory, add SourceType
      if (key === 'MonthDirectory') {
        Object.assign(newMapping, sourceTypeField);
      }
    }

    // Add condition back at the end
    newMapping.condition = condition;

    // Replace the mapping
    mapping.mediaMappings[language][mediaType] = newMapping;
    updateCount++;

    console.log(`✅ Added SourceType to ${language}.${mediaType}`);
  }
}

// Save the updated mapping
fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));

console.log(`\n✅ Successfully added SourceType to ${updateCount} media types`);
console.log(`📁 Updated file: ${mappingFile}`);
