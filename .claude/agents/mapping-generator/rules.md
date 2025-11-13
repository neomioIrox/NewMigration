# Mapping Rules & Examples

## Rule Categories

### 1. Direct Mappings
**Pattern**: When Convert Type = "direct" and both old/new columns exist
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,Name,direct,products,Name,
```
**Output**:
```json
"Name": {
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "Name"
}
```

### 2. Constant Values
**Pattern**: When Convert Type = "const", value comes from Comments
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,ProjectType,const,,,1
```
**Output**:
```json
"ProjectType": {
  "convertType": "const",
  "value": "1"
}
```

### 3. Expressions
**Pattern**: Complex transformations with JavaScript expressions

#### Substring Example:
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,Name,expression,products,Name,substring(0;150)
```
**Output**:
```json
"Name": {
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Name",
  "expression": "value ? value.substring(0, 150) : null"
}
```

#### Boolean Inversion:
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
2,projectlocalization,DisplayInSite,expression,products,Hide,Hide=0
```
**Output**:
```json
"DisplayInSite": {
  "convertType": "expression",
  "oldTable": "products",
  "oldColumn": "Hide",
  "expression": "row.Hide ? 0 : 1"
}
```

### 4. Foreign Keys
**Pattern**: FK relationships with value translation
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,TerminalId,FK,products,Terminal,FK to terminals
```
**Output**:
```json
"TerminalId": {
  "convertType": "direct",
  "oldTable": "products",
  "oldColumn": "Terminal",
  "defaultValue": "1",
  "useFkMapping": true
}
```

### 5. Auto-Generated Values
**Pattern**: System-generated values
```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
1,project,CreatedAt,auto,,,GETDATE()
```
**Output**:
```json
"CreatedAt": {
  "convertType": "const",
  "value": "GETDATE()"
}
```

## Complex Patterns

### Localization Pattern
For tables with language variants (_en, _fr):

```csv
Step,New Table,New Column,Convert Type,Old Table,Old Column,Comments
2,projectlocalization,Title,direct,products,Name,Hebrew
2,projectlocalization,Title,direct,products,Name_en,English
2,projectlocalization,Title,direct,products,Name_fr,French
```

**Output Structure**:
```json
{
  "localizationMappings": {
    "Title": {
      "hebrew": {
        "convertType": "direct",
        "oldTable": "products",
        "oldColumn": "Name"
      },
      "english": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name_en",
        "expression": "value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : 'No Translation')",
        "defaultValue": "No Translation"
      },
      "french": {
        "convertType": "expression",
        "oldTable": "products",
        "oldColumn": "Name_fr",
        "expression": "value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : 'No Translation')",
        "defaultValue": "No Translation"
      }
    }
  }
}
```

### ProjectItem Pattern
Different structure for Funds vs Collections:

**Funds (ProjectType=1) - One item**:
```json
{
  "projectItemMappings": {
    "funds": {
      "ItemName": { ... },
      "ItemType": { "convertType": "const", "value": "5" },
      "PriceType": { "convertType": "const", "value": "2" }
    }
  }
}
```

**Collections (ProjectType=2) - Two items**:
```json
{
  "projectItemMappings": {
    "collections": {
      "certificate": {
        "ItemName": { ... },
        "ItemType": { "convertType": "const", "value": "2" },
        "HasEngravingName": { "convertType": "const", "value": "1" }
      },
      "donation": {
        "ItemName": { ... },
        "ItemType": { "convertType": "const", "value": "4" },
        "HasEngravingName": { "convertType": "const", "value": "0" }
      }
    }
  }
}
```

## Comment Column Patterns

### Pattern Recognition in Comments (Column K)

| Comment Pattern | Meaning | Resulting Mapping |
|-----------------|---------|-------------------|
| "1", "2", "-1" | Constant value | `{"convertType": "const", "value": "X"}` |
| "GETDATE()" | Current timestamp | `{"convertType": "const", "value": "GETDATE()"}` |
| "substring(0;150)" | Text truncation | Expression with substring |
| "Hide=0" | Boolean condition | Expression with inversion |
| "default 0" | Default value | Add `"defaultValue": "0"` |
| "FK to X" | Foreign key | Add `"useFkMapping": true` |
| "Hebrew"/"English"/"French" | Language indicator | Group in localizationMappings |

## NULL Handling Rules

### Always Add Fallback for:
1. **Title/Name fields**: `'No Translation'` or original Hebrew value
2. **Description fields**: Empty string `''`
3. **Boolean fields**: `0` (never NULL)
4. **Numeric fields**: `0` or keep NULL based on business logic

### Expression Template for NULL Safety:
```javascript
// Basic NULL check
"expression": "value ? value : defaultValue"

// With transformation
"expression": "value ? value.substring(0, 150) : null"

// With fallback to another field
"expression": "value ? value : (row.OtherField ? row.OtherField : 'Default')"

// Boolean conversion
"expression": "value ? 1 : 0"
```

## Validation Checklist

Before outputting mapping, verify:
- [ ] All required fields have mappings
- [ ] No nullable issues (check NOT NULL columns)
- [ ] Expressions have proper NULL handling
- [ ] Boolean fields return 0/1, not NULL
- [ ] FK mappings have defaultValue
- [ ] Localization has all 3 languages
- [ ] ProjectItem has correct cardinality
- [ ] Date fields use GETDATE() where appropriate
- [ ] User tracking fields have -1 for system operations

## Common Mistakes to Avoid

1. ❌ Using `||` operator for NULL checks (returns NULL if first operand is NULL)
   ✅ Use ternary operator: `value ? value : 0`

2. ❌ Missing defaultValue for FK fields
   ✅ Always add: `"defaultValue": "1"`

3. ❌ Forgetting language fallback in localization
   ✅ English/French should fallback to Hebrew if NULL

4. ❌ Not handling 0 values in price fields
   ✅ Convert 0 to NULL: `(value === 0 || value === null) ? null : value`

5. ❌ Missing WHERE clause for filtered migrations
   ✅ Add WHERE clause when Comments indicate conditions

## Testing Your Mapping

Quick validation steps:
1. Parse as JSON - must be valid
2. Check all fields from CSV are included
3. Verify expressions are syntactically correct
4. Ensure no hardcoded values that should be dynamic
5. Test NULL scenarios mentally