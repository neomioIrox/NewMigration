/**
 * Pre-migration runner: seeds Project Id=1 ("קופת העיר" — the general collection bucket)
 * + ProjectItem Id=1 + LinkSetting Id=1 + 6 localization rows, exactly as they existed on
 * the reference DB (dumped 2026-07-14).
 *
 * Invoked automatically by the engine (mapping.preMigrationRunners includes "seed-project1")
 * before the main loop of every Project-producing mapping, so a fresh migration needs NO
 * manual seeding step — whichever Project mapping runs first plants the row. Idempotent:
 * skips instantly when Project 1 already exists.
 *
 * WHY Project 1 must exist before any ProjectItem insert:
 *   - PrayerMapping collapses all prayers into ProjectItems under Project Id=1 (FK).
 *   - The donation engine routes general/unresolvable donations to ItemId=1 — if some
 *     fund's item grabs auto-increment Id=1 first, that fund silently becomes the
 *     general bucket.
 *   - The video-gallery engine creates its LinkSettings under Project Id=1.
 *   - No mapping creates it: source productsid=1 is "משפחת פרץ" with Terminal=NULL,
 *     which the Terminal gate drops by design.
 *
 * FAILS LOUDLY (aborts the run) if ProjectItem 1 / LinkSetting 1 are already taken by a
 * different row — that means the DB was not cleaned properly and the general-donation
 * bucket would be silently wrong.
 */
const targetDb = require("../../db/mysql-target");
const logger = require("../../logger");

const SEED = {
  Project: {
    Id: 1, Name: "קופת העיר", ProjectType: 2, KupatFundNo: 110, TerminalId: 1,
    DisplayAsSelfView: null, MainMedia: null, ImageForListsView: null, DisplayItemsInProjectPage: null,
    RecordStatus: 2, StatusChangedBy: 1, CreatedBy: 1, UpdatedBy: 1,
  },
  ProjectItem: {
    Id: 1, ProjectId: 1, ItemName: "כ תרומה למגבית", ItemType: 4, PriceType: 2, KupatFundNo: 110,
    HasEngravingName: 1, AllowFreeAddPrayerNames: 1, AllowAddDedication: 1,
    DeliveryMethod: null, AllowSelfPickup: null, MainMedia: null, ImageForListsView: null,
    RecordStatus: 2, StatusChangedBy: 1, CreatedBy: 1, UpdatedBy: 1,
    MediaForExecutePage: null, MobileMediaForExecutePage: null,
  },
  LinkSetting: {
    Id: 1, LinkType: 1, LinkTargetType: 3, ProjectId: 1, ItemId: 1,
    LinkText: "מגבית כללית של קופת העיר", MediaId: null, MobileMediaId: null,
    Description: "תרומה כללית", DonationPagePaymentType: 2, DonationPagePaymentSum: 120,
    DonationPagePaymentCount: 1, CreatedBy: 1, UpdatedBy: 1,
  },
  ProjectLocalization: [
    { ProjectId: 1, Language: 1, DisplayInSite: 0, Title: "מגבית קופת העיר כללית",
      Description: "כל תרומה כללית נכנסת למגבית קודש זו", HideDonationsInSite: 1,
      MainLinkButtonSettingId: 1, CreatedBy: 1, UpdatedBy: 1 },
    { ProjectId: 1, Language: 2, DisplayInSite: 0, Title: "General Kupat Hair Campain",
      Description: "aaaaaaaa", HideDonationsInSite: 1,
      MainLinkButtonSettingId: 1, CreatedBy: 1, UpdatedBy: 1 },
    { ProjectId: 1, Language: 3, DisplayInSite: 0, Title: "Campagne générale Kupat Hair",
      Description: "aaaaaaaaaaaa", HideDonationsInSite: 1,
      MainLinkButtonSettingId: 1, CreatedBy: 1, UpdatedBy: 1 },
  ],
  ProjectItemLocalization: [1, 2, 3].map(function (lang) {
    return {
      ItemId: 1, Language: lang, DisplayInSite: 1, Title: "", TitleForExecutePage: "", Description: "",
      PaymentSum: 120, DefaultPaymentType: 2, DefaultPaymentsCount: 1, CreatedBy: 1, UpdatedBy: 1,
    };
  }),
};

// Tables whose rows also carry StatusChangedAt (NOT NULL) besides CreatedAt/UpdatedAt.
const HAS_STATUS_AT = { Project: true, ProjectItem: true };

async function insertSeedRow(table, row) {
  const cols = Object.keys(row);
  const dateCols = ["CreatedAt", "UpdatedAt"].concat(HAS_STATUS_AT[table] ? ["StatusChangedAt"] : []);
  const colSql = cols.concat(dateCols).map(function (c) { return "`" + c + "`"; }).join(",");
  const valSql = cols.map(function () { return "?"; }).concat(dateCols.map(function () { return "NOW()"; })).join(",");
  const vals = cols.map(function (c) { return row[c]; });
  await targetDb.query("INSERT INTO `" + table + "` (" + colSql + ") VALUES (" + valSql + ")", vals);
}

// status(): read-only probe, used by the CLI dry-run.
async function status() {
  const [proj] = await targetDb.query("SELECT Id FROM Project WHERE Id = 1");
  const [item] = await targetDb.query("SELECT Id, ProjectId FROM ProjectItem WHERE Id = 1");
  const [link] = await targetDb.query("SELECT Id, ProjectId FROM LinkSetting WHERE Id = 1");
  return { projectExists: proj.length > 0, itemTaken: item.length > 0, linkTaken: link.length > 0 };
}

async function run() {
  const st = await status();
  if (st.projectExists) {
    return { skipped: true, reason: "Project Id=1 already exists" };
  }
  if (st.itemTaken || st.linkTaken) {
    throw new Error(
      "seed-project1: ProjectItem Id=1 or LinkSetting Id=1 is already taken by another row " +
      "while Project Id=1 does not exist — the DB was not cleaned properly. The general-donation " +
      "bucket (ItemId=1) would be wrong. Clean Project/ProjectItem/LinkSetting tables and re-run.");
  }

  await insertSeedRow("Project", SEED.Project);
  await insertSeedRow("ProjectItem", SEED.ProjectItem);
  await insertSeedRow("LinkSetting", SEED.LinkSetting);
  for (const row of SEED.ProjectLocalization) await insertSeedRow("ProjectLocalization", row);
  for (const row of SEED.ProjectItemLocalization) await insertSeedRow("ProjectItemLocalization", row);

  logger.info("seed-project1: seeded Project 1 + ProjectItem 1 + LinkSetting 1 + 6 localization rows");
  return { seeded: true };
}

module.exports = { run, status, SEED };
