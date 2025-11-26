/**
 * ProjectItemLocalization Migration Script
 * Creates localization records for all projectitem rows that don't have them
 */

const mysql = require('mysql2/promise');
const sql = require('mssql');

// Mapping configuration
const projectItemLocMappings = {
  hebrew: {
    DisplayInSite: {
      convertType: "expression",
      oldColumn: "Hide",
      expression: "(!row.Hide && row.ShowMainPage) ? 1 : 0"
    },
    Title: {
      convertType: "expression",
      oldColumn: "ProjectNameForDonationPage",
      expression: "(value && value !== row.Name) ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null)"
    },
    PaymentSum: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed",
      expression: "row.DefaultDonationSumFixed > 0 ? (row.DefaultDonationSumFixed * (row.DefaultPaymentsNumFixed || 1)) : row.DefaultDonationsSum"
    },
    DefaultPaymentType: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed",
      expression: "row.DefaultDonationSumFixed > 0 ? 1 : 2"
    },
    DefaultPaymentsCount: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed",
      expression: "row.DefaultDonationSumFixed > 0 ? row.DefaultPaymentsNumFixed : row.DefaultPaymentsNumber"
    },
    NameForReceipt: {
      convertType: "expression",
      oldColumn: "ProjectNameForInvoice",
      expression: "value ? value.substring(0, 150) : null"
    },
    OrderInItemsPageView: {
      convertType: "expression",
      oldColumn: "Sort",
      expression: "(value && value <= 30) ? value : null"
    },
    OrderInProjectPageFooter: { convertType: "const", value: "1" },
    CreatedAt: { convertType: "const", value: "GETDATE()" },
    CreatedBy: { convertType: "const", value: "-1" },
    UpdatedAt: { convertType: "const", value: "GETDATE()" },
    UpdatedBy: { convertType: "const", value: "-1" }
  },
  english: {
    DisplayInSite: {
      convertType: "expression",
      oldColumn: "Hide_en",
      expression: "(!row.Hide_en && row.ShowMainPage) ? 1 : 0"
    },
    Title: {
      convertType: "expression",
      oldColumn: "Name_en",
      expression: "value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null)"
    },
    PaymentSum: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed_en",
      expression: "row.DefaultDonationSumFixed_en > 0 ? (row.DefaultDonationSumFixed_en * (row.DefaultPaymentsNumFixed_en || 1)) : row.DefaultDonationsSum_en"
    },
    DefaultPaymentType: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed_en",
      expression: "row.DefaultDonationSumFixed_en > 0 ? 1 : 2"
    },
    DefaultPaymentsCount: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed_en",
      expression: "row.DefaultDonationSumFixed_en > 0 ? row.DefaultPaymentsNumFixed_en : row.DefaultPaymentsNumber_en"
    },
    NameForReceipt: {
      convertType: "expression",
      oldColumn: "ProjectNameForInvoice_en",
      expression: "value ? value.substring(0, 150) : null"
    },
    OrderInItemsPageView: {
      convertType: "expression",
      oldColumn: "Sort",
      expression: "(value && value <= 30) ? value : null"
    },
    OrderInProjectPageFooter: { convertType: "const", value: "1" },
    CreatedAt: { convertType: "const", value: "GETDATE()" },
    CreatedBy: { convertType: "const", value: "-1" },
    UpdatedAt: { convertType: "const", value: "GETDATE()" },
    UpdatedBy: { convertType: "const", value: "-1" }
  },
  french: {
    DisplayInSite: {
      convertType: "expression",
      oldColumn: "Hide_fr",
      expression: "(!row.Hide_fr && row.ShowMainPage) ? 1 : 0"
    },
    Title: {
      convertType: "expression",
      oldColumn: "Name_fr",
      expression: "value ? value.substring(0, 150) : (row.Name ? row.Name.substring(0, 150) : null)"
    },
    PaymentSum: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed_fr",
      expression: "row.DefaultDonationSumFixed_fr > 0 ? (row.DefaultDonationSumFixed_fr * (row.DefaultPaymentsNumFixed_fr || 1)) : row.DefaultDonationsSum_fr"
    },
    DefaultPaymentType: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed_fr",
      expression: "row.DefaultDonationSumFixed_fr > 0 ? 1 : 2"
    },
    DefaultPaymentsCount: {
      convertType: "expression",
      oldColumn: "DefaultDonationSumFixed_fr",
      expression: "row.DefaultDonationSumFixed_fr > 0 ? row.DefaultPaymentsNumFixed_fr : row.DefaultPaymentsNumber_fr"
    },
    NameForReceipt: {
      convertType: "expression",
      oldColumn: "ProjectNameForInvoice_fr",
      expression: "value ? value.substring(0, 150) : null"
    },
    OrderInItemsPageView: {
      convertType: "expression",
      oldColumn: "Sort",
      expression: "(value && value <= 30) ? value : null"
    },
    OrderInProjectPageFooter: { convertType: "const", value: "1" },
    CreatedAt: { convertType: "const", value: "GETDATE()" },
    CreatedBy: { convertType: "const", value: "-1" },
    UpdatedAt: { convertType: "const", value: "GETDATE()" },
    UpdatedBy: { convertType: "const", value: "-1" }
  }
};

const languages = {
  hebrew: 1,
  english: 2,
  french: 3
};

async function runMigration() {
  console.log('='.repeat(60));
  console.log('ProjectItemLocalization Migration');
  console.log('='.repeat(60));

  // Connect to MySQL
  const mysqlConn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'kupathairnew'
  });

  // Connect to MSSQL
  const mssqlConfig = {
    server: 'localhost\\SQLEXPRESS',
    database: 'KupatHair',
    options: {
      trustServerCertificate: true,
      trustedConnection: true
    }
  };

  await sql.connect(mssqlConfig);

  try {
    // 1. Get all projectitems without localization
    const [missingItems] = await mysqlConn.execute(`
      SELECT pi.Id as ItemId, pi.ProjectId, pi.ItemName, p.KupatFundNo
      FROM projectitem pi
      JOIN project p ON pi.ProjectId = p.Id
      LEFT JOIN projectitemlocalization pil ON pi.Id = pil.ItemId
      WHERE pil.Id IS NULL
      ORDER BY pi.Id
    `);

    console.log(`\nFound ${missingItems.length} projectitems without localization`);

    if (missingItems.length === 0) {
      console.log('Nothing to migrate!');
      return;
    }

    // 2. Get source data from MSSQL
    const kupatFundNos = [...new Set(missingItems.map(item => item.KupatFundNo))];
    console.log(`Fetching source data for ${kupatFundNos.length} products...`);

    const sourceResult = await sql.query`
      SELECT
        productsid, ProjectNumber, Name,
        ProjectNameForDonationPage, ProjectNameForInvoice,
        Hide, ShowMainPage,
        DefaultDonationSumFixed, DefaultPaymentsNumFixed, DefaultDonationsSum, DefaultPaymentsNumber,
        Sort,
        Name_en, Hide_en, ProjectNameForInvoice_en,
        DefaultDonationSumFixed_en, DefaultPaymentsNumFixed_en, DefaultDonationsSum_en, DefaultPaymentsNumber_en,
        Name_fr, Hide_fr, ProjectNameForInvoice_fr,
        DefaultDonationSumFixed_fr, DefaultPaymentsNumFixed_fr, DefaultDonationsSum_fr, DefaultPaymentsNumber_fr
      FROM products
      WHERE ProjectNumber IN (${kupatFundNos.join(',')})
    `;

    // Build lookup by ProjectNumber
    const sourceByFundNo = {};
    for (const row of sourceResult.recordset) {
      sourceByFundNo[row.ProjectNumber] = row;
    }

    console.log(`Found ${sourceResult.recordset.length} source products`);

    // 3. Migrate each item
    let insertedCount = 0;
    let errorCount = 0;

    for (const item of missingItems) {
      const row = sourceByFundNo[item.KupatFundNo];

      if (!row) {
        console.log(`  Warning: No source found for KupatFundNo ${item.KupatFundNo}`);
        errorCount++;
        continue;
      }

      // Create localization for each language
      for (const [langName, langId] of Object.entries(languages)) {
        const langMapping = projectItemLocMappings[langName];

        try {
          const locData = {
            ItemId: item.ItemId,
            Language: langId
          };

          // Apply mappings
          for (const [fieldName, mapping] of Object.entries(langMapping)) {
            let value = null;

            if (mapping.convertType === 'const') {
              value = mapping.value;
              if (value === 'GETDATE()' || value === 'NOW()') {
                value = new Date();
              } else if (typeof value === 'string' && /^\d+$/.test(value)) {
                value = parseInt(value, 10);
              }
            } else if (mapping.convertType === 'direct' && mapping.oldColumn) {
              value = row[mapping.oldColumn];
            } else if (mapping.convertType === 'expression') {
              if (mapping.oldColumn) {
                value = row[mapping.oldColumn];
              }

              if (mapping.expression) {
                try {
                  const expressionFunc = new Function('value', 'row', `return ${mapping.expression}`);
                  value = expressionFunc(value, row);
                } catch (exprErr) {
                  console.log(`    Expression error for ${fieldName}: ${exprErr.message}`);
                }
              }
            }

            // Convert undefined to null
            if (value === undefined) {
              value = null;
            } else if (typeof value === 'string' && /^\d+$/.test(value)) {
              value = parseInt(value, 10);
            }

            // Truncate strings
            if (fieldName === 'Title' && typeof value === 'string' && value.length > 150) {
              value = value.substring(0, 150);
            }
            if (fieldName === 'NameForReceipt' && typeof value === 'string' && value.length > 150) {
              value = value.substring(0, 150);
            }

            locData[fieldName] = value;
          }

          // Insert
          const columns = Object.keys(locData).join(', ');
          const placeholders = Object.keys(locData).map(() => '?').join(', ');
          const values = Object.values(locData).map(v => v === undefined ? null : v);

          await mysqlConn.execute(
            `INSERT INTO projectitemlocalization (${columns}) VALUES (${placeholders})`,
            values
          );

          insertedCount++;

        } catch (err) {
          console.log(`  Error for ItemId ${item.ItemId}, ${langName}: ${err.message}`);
          errorCount++;
        }
      }

      // Progress
      if (insertedCount % 300 === 0) {
        console.log(`  Progress: ${insertedCount} rows inserted...`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration Complete!');
    console.log(`  Inserted: ${insertedCount} rows`);
    console.log(`  Errors: ${errorCount}`);
    console.log('='.repeat(60));

  } finally {
    await mysqlConn.end();
    await sql.close();
  }
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
