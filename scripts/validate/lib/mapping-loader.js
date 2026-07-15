/**
 * Loads and analyzes mapping JSON files for auto-discovery of validation checks
 */
const fs = require('fs');
const path = require('path');

const MAPPINGS_DIR = path.resolve(__dirname, '../../../server/mappings');

function loadAll() {
  const metaPath = path.join(MAPPINGS_DIR, '_meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  const mappings = {};
  const files = fs.readdirSync(MAPPINGS_DIR).filter(f => f.endsWith('.json') && f !== '_meta.json');

  for (const file of files) {
    const name = file.replace('.json', '');
    mappings[name] = JSON.parse(fs.readFileSync(path.join(MAPPINGS_DIR, file), 'utf8'));
  }

  return { meta, mappings };
}

function getEntities() {
  const { meta, mappings } = loadAll();
  const entities = [];

  for (const entry of meta.migrationOrder) {
    const m = mappings[entry.mapping];
    if (!m) continue;

    entities.push({
      entityType: entry.entityType,
      mappingName: entry.mapping,
      sourceTable: m.sourceTable,
      targetTable: m.targetTable,
      sourceIdColumn: m.sourceIdColumn,
      whereClause: m.whereClause,
      sourceQuery: m.sourceQuery,
      order: entry.order,
      dependsOn: entry.dependsOn,
      mapping: m
    });
  }

  // Add special engines not in _meta.json
  if (mappings['CustomerUserMapping']) {
    entities.push({
      entityType: 'CustomerUser',
      mappingName: 'CustomerUserMapping',
      sourceTable: mappings['CustomerUserMapping'].sourceTable,
      targetTable: mappings['CustomerUserMapping'].targetTable,
      sourceIdColumn: mappings['CustomerUserMapping'].sourceIdColumn,
      whereClause: mappings['CustomerUserMapping'].whereClause,
      sourceQuery: mappings['CustomerUserMapping'].sourceQuery,
      order: 99,
      dependsOn: [],
      mapping: mappings['CustomerUserMapping']
    });
  }

  return entities;
}

function getFKRelationships() {
  const { mappings } = loadAll();
  const fks = [];

  for (const [name, m] of Object.entries(mappings)) {
    if (!m.columnMappings) continue;

    // From columnMappings with useFkMapping
    for (const [col, def] of Object.entries(m.columnMappings)) {
      if (def.useFkMapping && m.fkMappings && m.fkMappings[col]) {
        const fkTarget = m.fkMappings[col];
        if (typeof fkTarget === 'string' && !fkTarget.endsWith('.json')) {
          fks.push({
            mappingName: name,
            targetTable: m.targetTable,
            column: col,
            referencedEntityType: fkTarget.replace('Mapping', ''),
            sourceColumn: def.oldColumn || col,
            type: 'fkMapping'
          });
        }
      }
    }

    // From fkMappings directly
    if (m.fkMappings) {
      for (const [col, target] of Object.entries(m.fkMappings)) {
        if (typeof target === 'string' && target.endsWith('Mapping')) {
          const entityType = target.replace('Mapping', '');
          if (!fks.find(f => f.mappingName === name && f.column === col)) {
            fks.push({
              mappingName: name,
              targetTable: m.targetTable,
              column: col,
              referencedEntityType: entityType,
              type: 'fkMapping'
            });
          }
        }
      }
    }
  }

  return fks;
}

function getExpressions() {
  const { mappings } = loadAll();
  const expressions = [];

  for (const [name, m] of Object.entries(mappings)) {
    // columnMappings expressions
    if (m.columnMappings) {
      for (const [col, def] of Object.entries(m.columnMappings)) {
        if (def.expression) {
          expressions.push({
            mappingName: name,
            targetTable: m.targetTable,
            field: col,
            expression: def.expression,
            sourceColumn: def.oldColumn,
            location: 'columnMappings'
          });
        }
      }
    }

    // localizationMappings expressions
    if (m.localizationMappings) {
      for (const [field, langDefs] of Object.entries(m.localizationMappings)) {
        if (typeof langDefs !== 'object' || langDefs.convertType) continue;
        for (const [lang, def] of Object.entries(langDefs)) {
          if (def && def.expression) {
            expressions.push({
              mappingName: name,
              targetTable: m.localizationMappings.targetTable || m.targetTable + 'Localization',
              field,
              language: lang,
              expression: def.expression,
              sourceColumn: def.oldColumn,
              location: 'localizationMappings'
            });
          }
        }
      }
    }

    // projectItemLocalizationMappings expressions
    if (m.projectItemLocalizationMappings) {
      for (const [lang, fields] of Object.entries(m.projectItemLocalizationMappings)) {
        if (typeof fields !== 'object') continue;
        for (const [field, def] of Object.entries(fields)) {
          if (def && def.expression) {
            expressions.push({
              mappingName: name,
              targetTable: 'ProjectItemLocalization',
              field,
              language: lang,
              expression: def.expression,
              sourceColumn: def.oldColumn,
              location: 'projectItemLocalizationMappings'
            });
          }
        }
      }
    }
  }

  return expressions;
}

function getStringTruncations() {
  const expressions = getExpressions();
  const truncations = [];
  const substringRegex = /\.substring\(0,\s*(\d+)\)/;

  for (const expr of expressions) {
    const match = expr.expression.match(substringRegex);
    if (match) {
      truncations.push({
        mappingName: expr.mappingName,
        targetTable: expr.targetTable,
        field: expr.field,
        maxLength: parseInt(match[1]),
        sourceColumn: expr.sourceColumn,
        language: expr.language
      });
    }
  }

  return truncations;
}

function getLocalizationConditions() {
  const { mappings } = loadAll();
  const conditions = [];

  for (const [name, m] of Object.entries(mappings)) {
    if (m.localizationConditions) {
      for (const [lang, condition] of Object.entries(m.localizationConditions)) {
        conditions.push({
          mappingName: name,
          entityType: m._meta ? m._meta.entityType : name.replace('Mapping', ''),
          language: lang,
          condition,
          hasPreloadSet: !!(m.preloadConditionSets)
        });
      }
    }
  }

  return conditions;
}

module.exports = { loadAll, getEntities, getFKRelationships, getExpressions, getStringTruncations, getLocalizationConditions, MAPPINGS_DIR };
