/**
 * Dump LinkSetting reference data for comparison
 *
 * Compares a reference project (manually created, not from migration)
 * against a migrated project to find discrepancies in LinkSetting configuration.
 *
 * Usage: node scripts/checks/dump-linksetting-reference.js [referenceId] [migratedId]
 * Defaults: referenceId=4, migratedId=auto-detect first migrated project
 */
const mysql = require('mysql2/promise');
const { mysqlConfig } = require('../../legacy/config/database');

const REFERENCE_ID = process.argv[2] ? parseInt(process.argv[2]) : 4;
const MIGRATED_ID = process.argv[3] ? parseInt(process.argv[3]) : null;

const LANG_NAMES = { 1: 'Hebrew', 2: 'English', 3: 'French' };

async function run() {
  const conn = await mysql.createConnection(mysqlConfig);

  try {
    // Auto-detect migrated project if not specified
    let migratedId = MIGRATED_ID;
    if (!migratedId) {
      const [rows] = await conn.execute(`
        SELECT p.Id FROM project p
        WHERE p.Id != ? AND p.CreatedBy = -1
        ORDER BY p.Id ASC LIMIT 1
      `, [REFERENCE_ID]);
      if (rows.length > 0) {
        migratedId = rows[0].Id;
      } else {
        console.log('No migrated project found (CreatedBy=-1). Showing reference only.');
      }
    }

    console.log('='.repeat(80));
    console.log('  LinkSetting Reference Comparison');
    console.log('  Reference Project: ' + REFERENCE_ID);
    console.log('  Migrated Project:  ' + (migratedId || 'NONE'));
    console.log('='.repeat(80));

    const projectIds = [REFERENCE_ID];
    if (migratedId) projectIds.push(migratedId);

    for (const projectId of projectIds) {
      const isRef = projectId === REFERENCE_ID;
      const label = isRef ? 'REFERENCE' : 'MIGRATED';

      console.log('\n' + '#'.repeat(80));
      console.log('  ' + label + ' - Project ID: ' + projectId);
      console.log('#'.repeat(80));

      // 1. Project basic info
      const [projectRows] = await conn.execute(`
        SELECT Id, Name, ProjectType, RecordStatus, CreatedAt, CreatedBy, UpdatedBy
        FROM project WHERE Id = ?
      `, [projectId]);

      if (projectRows.length === 0) {
        console.log('\n  PROJECT NOT FOUND!\n');
        continue;
      }

      const proj = projectRows[0];
      console.log('\n--- Project Info ---');
      console.log('  Id:           ' + proj.Id);
      console.log('  Name:         ' + proj.Name);
      console.log('  ProjectType:  ' + proj.ProjectType);
      console.log('  RecordStatus: ' + proj.RecordStatus);
      console.log('  CreatedBy:    ' + proj.CreatedBy);

      // 2. All LinkSetting records (ALL columns)
      const [lsRows] = await conn.execute(`
        SELECT
          ls.*,
          llt.Description as LinkTypeName,
          lltt.Description as LinkTargetTypeName
        FROM linksetting ls
        LEFT JOIN lutlinktype llt ON ls.LinkType = llt.Id
        LEFT JOIN lutlinktargettype lltt ON ls.LinkTargetType = lltt.Id
        WHERE ls.ProjectId = ?
        ORDER BY ls.Id
      `, [projectId]);

      console.log('\n--- LinkSetting Records (' + lsRows.length + ' total) ---');
      if (lsRows.length === 0) {
        console.log('  NO LINKSETTING RECORDS!');
      } else {
        for (const ls of lsRows) {
          console.log('  LS ID: ' + ls.Id);
          console.log('    LinkType:           ' + ls.LinkType + ' (' + (ls.LinkTypeName || '?') + ')');
          console.log('    LinkTargetType:     ' + ls.LinkTargetType + ' (' + (ls.LinkTargetTypeName || '?') + ')');
          console.log('    ProjectId:          ' + ls.ProjectId);
          console.log('    ItemId:             ' + (ls.ItemId !== null ? ls.ItemId : 'NULL'));
          console.log('    LinkText:           ' + (ls.LinkText !== null ? '"' + ls.LinkText + '"' : 'NULL'));
          console.log('    MediaId:            ' + (ls.MediaId !== null ? ls.MediaId : 'NULL'));
          console.log('    MobileMediaId:      ' + (ls.MobileMediaId !== null ? ls.MobileMediaId : 'NULL'));
          console.log('    Description:        ' + (ls.Description !== null ? '"' + ls.Description + '"' : 'NULL'));
          console.log('    DonationPagePaymentType:  ' + (ls.DonationPagePaymentType !== null ? ls.DonationPagePaymentType : 'NULL'));
          console.log('    DonationPagePaymentSum:   ' + (ls.DonationPagePaymentSum !== null ? ls.DonationPagePaymentSum : 'NULL'));
          console.log('    DonationPagePaymentCount: ' + (ls.DonationPagePaymentCount !== null ? ls.DonationPagePaymentCount : 'NULL'));
          console.log('    CreatedBy:          ' + ls.CreatedBy);
          console.log('');
        }
      }

      // 3. ProjectLocalization with ALL LinkSetting FK columns
      const [plRows] = await conn.execute(`
        SELECT
          pl.Id, pl.ProjectId, pl.Language,
          pl.Title,
          pl.MainLinkButtonSettingId,
          pl.LinkSettingIdInListView,
          pl.LinkSettingIdInButtonListView,
          pl.ContentId, pl.MainMedia, pl.ImageForListsView
        FROM projectlocalization pl
        WHERE pl.ProjectId = ?
        ORDER BY pl.Language
      `, [projectId]);

      console.log('--- ProjectLocalization (' + plRows.length + ' rows) ---');
      for (const pl of plRows) {
        var langName = LANG_NAMES[pl.Language] || 'Unknown(' + pl.Language + ')';
        console.log('  Language: ' + langName + ' (' + pl.Language + ')');
        console.log('    Title:                        ' + (pl.Title || 'NULL'));
        console.log('    MainLinkButtonSettingId:       ' + (pl.MainLinkButtonSettingId !== null ? pl.MainLinkButtonSettingId : 'NULL'));
        console.log('    LinkSettingIdInListView:       ' + (pl.LinkSettingIdInListView !== null ? pl.LinkSettingIdInListView : 'NULL'));
        console.log('    LinkSettingIdInButtonListView: ' + (pl.LinkSettingIdInButtonListView !== null ? pl.LinkSettingIdInButtonListView : 'NULL'));
        console.log('    MainMedia:                    ' + (pl.MainMedia !== null ? pl.MainMedia : 'NULL'));
        console.log('    ContentId:                    ' + (pl.ContentId !== null ? pl.ContentId : 'NULL'));
        console.log('');
      }

      // 4. Cross-reference: show what each referenced LinkSetting looks like
      console.log('--- Cross-Reference: Referenced LinkSettings from ProjectLocalization ---');
      for (const pl of plRows) {
        var langName = LANG_NAMES[pl.Language] || '?';
        var refIds = [
          { name: 'MainLinkButtonSettingId', id: pl.MainLinkButtonSettingId },
          { name: 'LinkSettingIdInListView', id: pl.LinkSettingIdInListView },
          { name: 'LinkSettingIdInButtonListView', id: pl.LinkSettingIdInButtonListView }
        ];
        for (const ref of refIds) {
          if (ref.id !== null && ref.id !== undefined) {
            const [refLs] = await conn.execute('SELECT * FROM linksetting WHERE Id = ?', [ref.id]);
            if (refLs.length > 0) {
              var r = refLs[0];
              console.log('  ' + langName + ' -> ' + ref.name + ' = LS#' + r.Id +
                ' (Type=' + r.LinkType + ', Target=' + r.LinkTargetType +
                ', ItemId=' + (r.ItemId !== null ? r.ItemId : 'NULL') +
                ', Text="' + (r.LinkText || '') + '")');
            } else {
              console.log('  ' + langName + ' -> ' + ref.name + ' = ' + ref.id + ' [NOT FOUND!]');
            }
          } else {
            console.log('  ' + langName + ' -> ' + ref.name + ' = NULL');
          }
        }
      }

      // 5. ProjectItem records
      const [piRows] = await conn.execute(`
        SELECT pi.Id, pi.ProjectId, pi.ItemType, pi.ItemName, pi.PriceType
        FROM projectitem pi
        WHERE pi.ProjectId = ?
        ORDER BY pi.Id
      `, [projectId]);

      console.log('\n--- ProjectItem (' + piRows.length + ' rows) ---');
      for (const pi of piRows) {
        console.log('  Item ID: ' + pi.Id + ', ItemType: ' + pi.ItemType +
          ', Name: "' + (pi.ItemName || '') + '", PriceType: ' + pi.PriceType);
      }

      // 6. ProjectItemLocalization with ALL LinkSetting FK columns
      const [pilRows] = await conn.execute(`
        SELECT
          pil.Id, pil.ItemId, pil.Language,
          pil.Title,
          pil.MainButtonLinkSettingId,
          pil.ItemsViewLinkSettingId,
          pil.ProjectFooterLinkSettingId
        FROM projectitemlocalization pil
        JOIN projectitem pi ON pil.ItemId = pi.Id
        WHERE pi.ProjectId = ?
        ORDER BY pil.ItemId, pil.Language
      `, [projectId]);

      console.log('\n--- ProjectItemLocalization (' + pilRows.length + ' rows) ---');
      for (const pil of pilRows) {
        var langName = LANG_NAMES[pil.Language] || '?';
        console.log('  Item ' + pil.ItemId + ', ' + langName + ':');
        console.log('    Title:                      ' + (pil.Title || 'NULL'));
        console.log('    MainButtonLinkSettingId:     ' + (pil.MainButtonLinkSettingId !== null ? pil.MainButtonLinkSettingId : 'NULL'));
        console.log('    ItemsViewLinkSettingId:      ' + (pil.ItemsViewLinkSettingId !== null ? pil.ItemsViewLinkSettingId : 'NULL'));
        console.log('    ProjectFooterLinkSettingId:  ' + (pil.ProjectFooterLinkSettingId !== null ? pil.ProjectFooterLinkSettingId : 'NULL'));
      }

      // 7. Cross-reference: show what each referenced LinkSetting from PIL looks like
      console.log('\n--- Cross-Reference: Referenced LinkSettings from ProjectItemLocalization ---');
      for (const pil of pilRows) {
        var langName = LANG_NAMES[pil.Language] || '?';
        var refIds = [
          { name: 'MainButtonLinkSettingId', id: pil.MainButtonLinkSettingId },
          { name: 'ItemsViewLinkSettingId', id: pil.ItemsViewLinkSettingId },
          { name: 'ProjectFooterLinkSettingId', id: pil.ProjectFooterLinkSettingId }
        ];
        for (const ref of refIds) {
          if (ref.id !== null && ref.id !== undefined) {
            const [refLs] = await conn.execute('SELECT * FROM linksetting WHERE Id = ?', [ref.id]);
            if (refLs.length > 0) {
              var r = refLs[0];
              console.log('  Item ' + pil.ItemId + ' ' + langName + ' -> ' + ref.name + ' = LS#' + r.Id +
                ' (Type=' + r.LinkType + ', Target=' + r.LinkTargetType +
                ', ItemId=' + (r.ItemId !== null ? r.ItemId : 'NULL') +
                ', Text="' + (r.LinkText || '') + '")');
            } else {
              console.log('  Item ' + pil.ItemId + ' ' + langName + ' -> ' + ref.name + ' = ' + ref.id + ' [NOT FOUND!]');
            }
          } else {
            console.log('  Item ' + pil.ItemId + ' ' + langName + ' -> ' + ref.name + ' = NULL');
          }
        }
      }
    }

    // Summary comparison
    if (migratedId) {
      console.log('\n' + '='.repeat(80));
      console.log('  COMPARISON SUMMARY');
      console.log('='.repeat(80));

      const [refLS] = await conn.execute('SELECT COUNT(*) as cnt FROM linksetting WHERE ProjectId = ?', [REFERENCE_ID]);
      const [migLS] = await conn.execute('SELECT COUNT(*) as cnt FROM linksetting WHERE ProjectId = ?', [migratedId]);
      console.log('\n  LinkSetting count:  Reference=' + refLS[0].cnt + '  Migrated=' + migLS[0].cnt);

      // Compare LinkSetting type distribution
      const [refTypes] = await conn.execute(`
        SELECT LinkType, LinkTargetType, COUNT(*) as cnt,
          SUM(CASE WHEN ItemId IS NOT NULL THEN 1 ELSE 0 END) as withItem,
          SUM(CASE WHEN ItemId IS NULL THEN 1 ELSE 0 END) as withoutItem
        FROM linksetting WHERE ProjectId = ?
        GROUP BY LinkType, LinkTargetType ORDER BY LinkType, LinkTargetType
      `, [REFERENCE_ID]);

      const [migTypes] = await conn.execute(`
        SELECT LinkType, LinkTargetType, COUNT(*) as cnt,
          SUM(CASE WHEN ItemId IS NOT NULL THEN 1 ELSE 0 END) as withItem,
          SUM(CASE WHEN ItemId IS NULL THEN 1 ELSE 0 END) as withoutItem
        FROM linksetting WHERE ProjectId = ?
        GROUP BY LinkType, LinkTargetType ORDER BY LinkType, LinkTargetType
      `, [migratedId]);

      console.log('\n  Reference LinkSetting Types:');
      for (const t of refTypes) {
        console.log('    LinkType=' + t.LinkType + ', TargetType=' + t.LinkTargetType +
          ': ' + t.cnt + ' (withItem=' + t.withItem + ', withoutItem=' + t.withoutItem + ')');
      }

      console.log('\n  Migrated LinkSetting Types:');
      for (const t of migTypes) {
        console.log('    LinkType=' + t.LinkType + ', TargetType=' + t.LinkTargetType +
          ': ' + t.cnt + ' (withItem=' + t.withItem + ', withoutItem=' + t.withoutItem + ')');
      }

      // Compare ProjectLocalization FK columns
      const [refPL] = await conn.execute(`
        SELECT Language,
          MainLinkButtonSettingId IS NOT NULL as hasMain,
          LinkSettingIdInListView IS NOT NULL as hasListView,
          LinkSettingIdInButtonListView IS NOT NULL as hasButtonListView
        FROM projectlocalization WHERE ProjectId = ? ORDER BY Language
      `, [REFERENCE_ID]);

      const [migPL] = await conn.execute(`
        SELECT Language,
          MainLinkButtonSettingId IS NOT NULL as hasMain,
          LinkSettingIdInListView IS NOT NULL as hasListView,
          LinkSettingIdInButtonListView IS NOT NULL as hasButtonListView
        FROM projectlocalization WHERE ProjectId = ? ORDER BY Language
      `, [migratedId]);

      console.log('\n  ProjectLocalization FK Status:');
      console.log('  Reference:');
      for (const r of refPL) {
        console.log('    ' + (LANG_NAMES[r.Language] || '?') +
          ': Main=' + (r.hasMain ? 'SET' : 'NULL') +
          ', ListView=' + (r.hasListView ? 'SET' : 'NULL') +
          ', ButtonListView=' + (r.hasButtonListView ? 'SET' : 'NULL'));
      }
      console.log('  Migrated:');
      for (const r of migPL) {
        console.log('    ' + (LANG_NAMES[r.Language] || '?') +
          ': Main=' + (r.hasMain ? 'SET' : 'NULL') +
          ', ListView=' + (r.hasListView ? 'SET' : 'NULL') +
          ', ButtonListView=' + (r.hasButtonListView ? 'SET' : 'NULL'));
      }

      // Compare ProjectItemLocalization FK columns
      const [refPIL] = await conn.execute(`
        SELECT pil.Language,
          pil.MainButtonLinkSettingId IS NOT NULL as hasMain,
          pil.ItemsViewLinkSettingId IS NOT NULL as hasItemsView,
          pil.ProjectFooterLinkSettingId IS NOT NULL as hasFooter
        FROM projectitemlocalization pil
        JOIN projectitem pi ON pil.ItemId = pi.Id
        WHERE pi.ProjectId = ? ORDER BY pil.Language
      `, [REFERENCE_ID]);

      const [migPIL] = await conn.execute(`
        SELECT pil.Language,
          pil.MainButtonLinkSettingId IS NOT NULL as hasMain,
          pil.ItemsViewLinkSettingId IS NOT NULL as hasItemsView,
          pil.ProjectFooterLinkSettingId IS NOT NULL as hasFooter
        FROM projectitemlocalization pil
        JOIN projectitem pi ON pil.ItemId = pi.Id
        WHERE pi.ProjectId = ? ORDER BY pil.Language
      `, [migratedId]);

      console.log('\n  ProjectItemLocalization FK Status:');
      console.log('  Reference:');
      for (const r of refPIL) {
        console.log('    ' + (LANG_NAMES[r.Language] || '?') +
          ': MainButton=' + (r.hasMain ? 'SET' : 'NULL') +
          ', ItemsView=' + (r.hasItemsView ? 'SET' : 'NULL') +
          ', Footer=' + (r.hasFooter ? 'SET' : 'NULL'));
      }
      console.log('  Migrated:');
      for (const r of migPIL) {
        console.log('    ' + (LANG_NAMES[r.Language] || '?') +
          ': MainButton=' + (r.hasMain ? 'SET' : 'NULL') +
          ', ItemsView=' + (r.hasItemsView ? 'SET' : 'NULL') +
          ', Footer=' + (r.hasFooter ? 'SET' : 'NULL'));
      }

      // Check non-null columns on reference LinkSettings that migration leaves NULL
      const [refNonNull] = await conn.execute(`
        SELECT
          SUM(CASE WHEN MediaId IS NOT NULL THEN 1 ELSE 0 END) as hasMedia,
          SUM(CASE WHEN MobileMediaId IS NOT NULL THEN 1 ELSE 0 END) as hasMobileMedia,
          SUM(CASE WHEN Description IS NOT NULL THEN 1 ELSE 0 END) as hasDesc,
          SUM(CASE WHEN DonationPagePaymentType IS NOT NULL THEN 1 ELSE 0 END) as hasPayType,
          SUM(CASE WHEN DonationPagePaymentSum IS NOT NULL THEN 1 ELSE 0 END) as hasPaySum,
          SUM(CASE WHEN DonationPagePaymentCount IS NOT NULL THEN 1 ELSE 0 END) as hasPayCount
        FROM linksetting WHERE ProjectId = ?
      `, [REFERENCE_ID]);

      console.log('\n  Reference LinkSetting - Non-NULL optional columns:');
      var rnn = refNonNull[0];
      console.log('    MediaId:                  ' + rnn.hasMedia + ' records');
      console.log('    MobileMediaId:            ' + rnn.hasMobileMedia + ' records');
      console.log('    Description:              ' + rnn.hasDesc + ' records');
      console.log('    DonationPagePaymentType:  ' + rnn.hasPayType + ' records');
      console.log('    DonationPagePaymentSum:   ' + rnn.hasPaySum + ' records');
      console.log('    DonationPagePaymentCount: ' + rnn.hasPayCount + ' records');
    }

    await conn.end();
    console.log('\nDone.');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await conn.end();
  }
}

run();
