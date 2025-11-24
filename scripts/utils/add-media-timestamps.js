// Script to add timestamp fields to all media mappings
const fs = require('fs');
const path = require('path');

const mappingPath = path.join(__dirname, '../../mappings/ProjectMapping_Funds_Fixed.json');
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// Fields to add to each media mapping
const timestampFields = {
  "StatusChangedAt": {
    "convertType": "const",
    "value": "GETDATE()"
  },
  "StatusChangedBy": {
    "convertType": "const",
    "value": "-1"
  },
  "CreatedAt": {
    "convertType": "const",
    "value": "GETDATE()"
  },
  "CreatedBy": {
    "convertType": "const",
    "value": "-1"
  },
  "UpdatedAt": {
    "convertType": "const",
    "value": "GETDATE()"
  },
  "UpdatedBy": {
    "convertType": "const",
    "value": "-1"
  }
};

// Process each language
for (const language in mapping.mediaMappings) {
  console.log(`\nProcessing ${language}...`);

  for (const mediaType in mapping.mediaMappings[language]) {
    const mediaMapping = mapping.mediaMappings[language][mediaType];
    const condition = mediaMapping.condition;

    // Remove condition temporarily
    delete mediaMapping.condition;

    // Add timestamp fields before condition
    Object.assign(mediaMapping, timestampFields);

    // Add condition back at the end
    mediaMapping.condition = condition;

    console.log(`  Added timestamps to ${mediaType}`);
  }
}

// Update savedAt timestamp
mapping.savedAt = new Date().toISOString();

// Save back to file
fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));

console.log('\n✅ Successfully added timestamp fields to all media mappings!');
console.log(`Updated: ${mappingPath}`);
