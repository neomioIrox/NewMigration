# Case Sensitivity Fix for AWS MySQL

## Problem
AWS MySQL (and Linux-based MySQL) is **case-sensitive** for table names, unlike Windows MySQL which is case-insensitive.

The migration was failing with errors like:
```
Table 'kupathairnew.projectitemlocalization' doesn't exist
```

Because the actual table name is `ProjectItemLocalization` (PascalCase), not `projectitemlocalization` (lowercase).

## Solution
Updated all SQL queries to use **PascalCase** table names to match the schema.

## Files Changed

### 1. Server ([src/server.js](../src/server.js))

**Already had TABLE_NAME_MAPPING** (lines 15-33):
```javascript
const TABLE_NAME_MAPPING = {
  'project': 'Project',
  'projectlocalization': 'ProjectLocalization',
  'projectitem': 'ProjectItem',
  'projectitemlocalization': 'ProjectItemLocalization',
  'media': 'Media',
  'gallery': 'Gallery',
  'linksetting': 'LinkSetting',
  'entitycontent': 'EntityContent',
  'entitycontentitem': 'EntityContentItem',
  'recruiter': 'Recruiter',
  'recruitersgroup': 'RecruitersGroup',
  'recruitersgrouplanguage': 'RecruitersGroupLanguage',
  'recruiterlocalization': 'RecruiterLocalization',
  'donation': 'Donation',
  'prayer': 'Prayer',
  'address': 'Address',
  'donationcurrencyvalue': 'DonationCurrencyValue'
};
```

**Fixed all hardcoded table names**:
- Line 495: `FROM RecruitersGroup` (was `recruitersgroup`)
- Line 794: `SHOW COLUMNS FROM RecruitersGroup`
- Line 834: `SELECT Id, Name FROM RecruitersGroup`
- Line 891: `SELECT Id, Name, ProjectId FROM RecruitersGroup`
- Line 1042: `SELECT Id, Name, RecruiterGroupId FROM Recruiter`
- Line 1078: `SELECT Id, Name FROM Recruiter`
- Line 1118: `INSERT INTO RecruiterLocalization`
- Line 1267: `FROM RecruitersGroup`
- Line 1280: `FROM Recruiter`
- Line 1289: `UPDATE RecruitersGroup`
- Line 2535: `UPDATE Project SET MainMedia`
- Line 2578: `UPDATE ProjectLocalization SET MainMedia` (Hebrew)
- Line 2607: `UPDATE ProjectLocalization SET MainMedia` (English)
- Line 2636: `UPDATE ProjectLocalization SET MainMedia` (French)
- Line 2685: `UPDATE ProjectItem SET MainMedia`
- Line 2735: `UPDATE ProjectItemLocalization SET MainMedia` (Hebrew)
- Line 2766: `UPDATE ProjectItemLocalization SET MainMedia` (English)
- Line 2797: `UPDATE ProjectItemLocalization SET MainMedia` (French)
- Line 2844: `UPDATE ProjectItemLocalization SET ImageForListsView` (Hebrew)
- Line 2868: `UPDATE ProjectItemLocalization SET ImageForListsView` (English)
- Line 2892: `UPDATE ProjectItemLocalization SET ImageForListsView` (French)
- Line 3005: `UPDATE ProjectLocalization SET MainLinkButtonSettingId`
- Line 3104: `UPDATE ProjectLocalization SET LinkSettingIdInListView`
- Line 3254: `UPDATE ProjectLocalization SET ContentId`
- Line 3641: `FROM ProjectItem`
- Line 3649: `FROM ProjectItem`
- Line 3659: `FROM ProjectItem`

### 2. Campaign Type 3 Migration ([scripts/migration/migrate-campaign-type3.js](../scripts/migration/migrate-campaign-type3.js))

**Fixed**:
- Line 77: `SELECT Id, ProjectType FROM Project`
- Line 108: `INSERT INTO Project`
- Line 174: `SELECT Id FROM ProjectLocalization`
- Line 189: `INSERT INTO ProjectLocalization`
- Line 254: `SELECT Id FROM ProjectItem`
- Line 265: `INSERT INTO ProjectItem`
- Line 327: `SELECT Id FROM ProjectItem`
- Line 338: `INSERT INTO ProjectItem`
- Line 391: `FROM ProjectItem pi JOIN Project p`
- Line 412: `SELECT Id FROM ProjectItemLocalization`
- Line 427: `INSERT INTO ProjectItemLocalization`

### 3. Donation Migration ([scripts/migration/migrate-donations.js](../scripts/migration/migrate-donations.js))

**Fixed**:
- Line 333: `SELECT Id FROM Donation WHERE ReferenceNum`

**Note**: This file already had TABLE_NAME_MAPPING (lines 10-16)

### 4. Recruiter Localization ([scripts/migration/migrate-recruiter-localization-simple.js](../scripts/migration/migrate-recruiter-localization-simple.js))

**Fixed**:
- Line 34: `SELECT Id, Name FROM Recruiter`
- Lines 73, 90, 108: `INSERT INTO RecruiterLocalization` (3 occurrences)

### 5. RecruitersGroup Localization ([scripts/migration/migrate-recruitersgroup-localization-simple.js](../scripts/migration/migrate-recruitersgroup-localization-simple.js))

**Fixed**:
- Line 25: `SELECT Id, Name FROM RecruitersGroup`
- Lines 38, 53, 68: `INSERT INTO RecruitersGroupLanguage` (3 occurrences)

### 6. ProjectItemLocalization Migration ([scripts/migration/run-projectitemlocalization-migration.js](../scripts/migration/run-projectitemlocalization-migration.js))

**Fixed**:
- Lines 174-176: `FROM ProjectItem pi JOIN Project p LEFT JOIN ProjectItemLocalization pil`
- Line 290: `INSERT INTO ProjectItemLocalization`

## Table Name Reference

| Lowercase (Windows) | PascalCase (AWS/Linux) |
|---------------------|------------------------|
| `project` | `Project` |
| `projectlocalization` | `ProjectLocalization` |
| `projectitem` | `ProjectItem` |
| `projectitemlocalization` | `ProjectItemLocalization` |
| `media` | `Media` |
| `gallery` | `Gallery` |
| `linksetting` | `LinkSetting` |
| `entitycontent` | `EntityContent` |
| `entitycontentitem` | `EntityContentItem` |
| `recruitersgroup` | `RecruitersGroup` |
| `recruitersgrouplanguage` | `RecruitersGroupLanguage` |
| `recruiter` | `Recruiter` |
| `recruiterlocalization` | `RecruiterLocalization` |
| `affiliate` | `Affiliate` |
| `source` | `Source` |
| `donation` | `Donation` |
| `donationcurrencyvalue` | `DonationCurrencyValue` |
| `address` | `Address` |
| `prayer` | `Prayer` |

## Testing

### ✅ Files to Test

1. **UI Migration** (http://localhost:3030):
   - Run Project migration (Funds/Collections)
   - Run ProjectItem migration
   - Run Media migration
   - Verify all table names work correctly

2. **Script-based Migration**:
   ```bash
   node scripts/run-full-migration.js
   node scripts/migration/migrate-campaign-type3.js
   node scripts/migration/migrate-donations.js
   ```

3. **Recruiter Migration**:
   ```bash
   node scripts/migration/migrate-recruiter-localization-simple.js
   node scripts/migration/migrate-recruitersgroup-localization-simple.js
   ```

## Impact

- ✅ All migrations will now work on AWS MySQL (case-sensitive)
- ✅ Still compatible with Windows MySQL (case-insensitive)
- ✅ No breaking changes to existing functionality
- ✅ UI-based migrations will work correctly

## Date Fixed
January 5, 2026
