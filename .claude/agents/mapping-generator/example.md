# Example Usage

## Test Case: Generate ProjectItemLocalization Mapping

### Input Request:
```
Table: projectitemlocalization
Steps: 3.1-3.2
Format: ui
```

### Step 1: Read CSV and Filter

From data/Mapping.csv, find rows where Step is between 3.1 and 3.2:

```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,,,,,Comments
3.1,projectitemlocalization,ItemId,FK,,,,,,,From projectitem
3.1,projectitemlocalization,LanguageId,const,,,,,,,1
3.1,projectitemlocalization,Title,direct,products,CertText,,,,,"Certificate text (Hebrew)"
3.1,projectitemlocalization,Description,direct,products,CertTextLong,,,,,
3.1,projectitemlocalization,Price,expression,products,Price,,,,,Handle 0 as NULL
3.2,projectitemlocalization,ItemId,FK,,,,,,,From projectitem
3.2,projectitemlocalization,LanguageId,const,,,,,,,2
3.2,projectitemlocalization,Title,direct,products,CertText_en,,,,,"Certificate text (English)"
3.2,projectitemlocalization,Description,direct,products,CertTextLong_en,,,,,
3.2,projectitemlocalization,Price,expression,products,Price_en,,,,,Handle 0 as NULL
```

### Step 2: Identify Patterns

- Step 3.1 = Hebrew (LanguageId=1)
- Step 3.2 = English (LanguageId=2)
- This is a localization table with language variants
- Price needs special handling for 0 values

### Step 3: Generate Mapping

```json
{
  "filename": "ProjectItemLocalization_Mapping",
  "whereClause": null,
  "columnMappings": {
    "RecordStatus": {
      "convertType": "const",
      "value": "2"
    },
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
  },
  "localizationMappings": {
    "Title": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "CertText",
        "expression": "value ? value.substring(0, 150) : null"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "CertText_en",
        "expression": "value ? value.substring(0, 150) : (row.CertText ? row.CertText.substring(0, 150) : 'No Translation')",
        "defaultValue": "No Translation"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "CertText_fr",
        "expression": "value ? value.substring(0, 150) : (row.CertText ? row.CertText.substring(0, 150) : 'No Translation')",
        "defaultValue": "No Translation"
      }
    },
    "Description": {
      "hebrew": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "CertTextLong"
      },
      "english": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "CertTextLong_en",
        "defaultValue": ""
      },
      "french": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "CertTextLong_fr",
        "defaultValue": ""
      }
    },
    "Price": {
      "hebrew": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Price",
        "expression": "(value === 0 || value === null) ? null : value"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Price_en",
        "expression": "(value === 0 || value === null) ? null : value"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Price_fr",
        "expression": "(value === 0 || value === null) ? null : value"
      }
    }
  },
  "savedAt": "2025-11-12T16:00:00.000Z"
}
```

### Step 4: Validation

✅ All fields mapped
✅ NULL safety in expressions
✅ All 3 languages included (Hebrew from CSV, French inferred)
✅ Price handles 0→NULL conversion
✅ System fields added (RecordStatus, timestamps, user tracking)
✅ Valid JSON structure

## Common Scenarios

### Scenario 1: Simple Table (No Localization)
```
Input: Table: lead, Steps: 4
Output: Standard columnMappings only
```

### Scenario 2: Project with Types
```
Input: Table: project, Steps: 1-1.1
Output: Nested structure with funds/collections
```

### Scenario 3: ProjectItem with Cardinality
```
Input: Table: projectitem, Steps: 3
Output: Different mappings for funds (1 item) vs collections (2 items)
```

### Scenario 4: FK Heavy Table
```
Input: Table: payment, Steps: 5
Output: Multiple FK mappings with translation tables
```

## Error Cases

### Missing Comments for Const
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,Status,const,,,,
```
**Action**: Check column name for hints, default to "1" or "0"

### Unknown Old Column
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,NewField,direct,products,UnknownColumn,
```
**Action**: Add with defaultValue, warn in output

### Invalid Expression
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,Name,expression,products,Name,INVALID_SYNTAX
```
**Action**: Fallback to direct mapping, note in comments