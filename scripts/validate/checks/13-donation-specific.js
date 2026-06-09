/**
 * Donation-Specific Checks - ID preservation, currencies, addresses
 */
module.exports = {
  id: 'donation-specific',
  name: 'Donation-Specific Validation',
  severity: 'critical',
  category: 'integrity',
  entities: ['Donation'],

  async run(ctx) {
    const results = [];

    // === ID Preservation: Donation.Id must equal Orders.OrdersId ===
    try {
      const sampleSize = ctx.options.sampleSize;
      const sourceRows = await ctx.mssql(`
        SELECT TOP ${sampleSize} OrdersId FROM Orders WITH (NOLOCK)
        WHERE ChargeStatus = 'OrderFinished'
        ORDER BY NEWID()
      `);

      if (sourceRows.length === 0) {
        results.push({ status: 'SKIP', entity: 'Donation ID Preservation', message: 'No source orders found' });
      } else {
        const ids = sourceRows.map(r => r.OrdersId);
        const placeholders = ids.map(() => '?').join(',');
        const targetRows = await ctx.target(
          `SELECT Id FROM Donation WHERE Id IN (${placeholders})`,
          ids
        );

        const found = targetRows.length;
        const missing = ids.length - found;

        results.push({
          status: missing === 0 ? 'PASS' : missing > ids.length * 0.05 ? 'FAIL' : 'WARNING',
          entity: 'Donation ID Preservation',
          message: `${found}/${ids.length} sampled OrdersIds exist as Donation.Id${missing > 0 ? ` (${missing} missing)` : ''}`,
          details: missing > 0 ? { found, total: ids.length, missing } : undefined
        });
      }
    } catch (err) {
      results.push({ status: 'SKIP', entity: 'Donation ID Preservation', message: err.message });
    }

    // === DonationCurrencyValue completeness ===
    try {
      const donationsWithout = await ctx.target(`
        SELECT COUNT(*) as cnt FROM Donation d
        LEFT JOIN DonationCurrencyValue dcv ON d.Id = dcv.DonationId
        WHERE dcv.Id IS NULL
      `);

      const totalDonations = await ctx.target('SELECT COUNT(*) as cnt FROM Donation');
      const missing = donationsWithout[0].cnt;
      const total = totalDonations[0].cnt;

      results.push({
        status: missing === 0 ? 'PASS' : missing > total * 0.01 ? 'FAIL' : 'WARNING',
        entity: 'DonationCurrencyValue completeness',
        message: missing === 0
          ? `All ${total} donations have currency values`
          : `${missing}/${total} donations without DonationCurrencyValue`,
        details: missing > 0 ? { missing, total } : undefined
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'DonationCurrencyValue', message: err.message });
      } else {
        results.push({ status: 'SKIP', entity: 'DonationCurrencyValue', message: 'Table not found' });
      }
    }

    // === Address records ===
    try {
      const donationCount = await ctx.target('SELECT COUNT(*) as cnt FROM Donation');
      const addressCount = await ctx.target('SELECT COUNT(*) as cnt FROM Address');

      const donations = donationCount[0].cnt;
      const addresses = addressCount[0].cnt;

      // Each donation should have at least 1 address (billing)
      results.push({
        status: addresses >= donations ? 'PASS' : addresses > 0 ? 'WARNING' : 'FAIL',
        entity: 'Address records',
        message: `${addresses} addresses for ${donations} donations (ratio: ${donations > 0 ? (addresses / donations).toFixed(2) : 0})`,
        details: { donations, addresses }
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'Address', message: err.message });
      } else {
        results.push({ status: 'SKIP', entity: 'Address', message: 'Table not found' });
      }
    }

    // === AUTO_INCREMENT restored on Donation table ===
    try {
      const rows = await ctx.target(`
        SELECT AUTO_INCREMENT FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Donation'
      `);

      if (rows.length > 0 && rows[0].AUTO_INCREMENT) {
        results.push({
          status: 'PASS',
          entity: 'Donation AUTO_INCREMENT',
          message: `AUTO_INCREMENT restored (next: ${rows[0].AUTO_INCREMENT})`
        });
      } else {
        results.push({
          status: 'FAIL',
          entity: 'Donation AUTO_INCREMENT',
          message: 'AUTO_INCREMENT not set on Donation table — engine may not have restored it',
          details: { tableInfo: rows[0] }
        });
      }
    } catch (err) {
      results.push({ status: 'SKIP', entity: 'Donation AUTO_INCREMENT', message: err.message });
    }

    // === ItemId resolution: how many donations have NULL ItemId ===
    try {
      const nullItem = await ctx.target(
        'SELECT COUNT(*) as cnt FROM Donation WHERE ItemId IS NULL'
      );
      const total = await ctx.target('SELECT COUNT(*) as cnt FROM Donation');

      const nullCount = nullItem[0].cnt;
      const totalCount = total[0].cnt;
      const pct = totalCount > 0 ? ((nullCount / totalCount) * 100).toFixed(1) : 0;

      results.push({
        status: nullCount === 0 ? 'PASS' : parseFloat(pct) > 5 ? 'WARNING' : 'PASS',
        entity: 'Donation.ItemId coverage',
        message: `${totalCount - nullCount}/${totalCount} donations have ItemId (${nullCount} NULL, ${pct}%)`,
        details: { withItem: totalCount - nullCount, withoutItem: nullCount, total: totalCount }
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'Donation.ItemId', message: err.message });
      }
    }

    // === DonationActionLog ===
    try {
      const logCount = await ctx.target('SELECT COUNT(*) as cnt FROM DonationActionLog');
      const donationCount = await ctx.target('SELECT COUNT(*) as cnt FROM Donation');

      results.push({
        status: logCount[0].cnt > 0 ? 'PASS' : 'WARNING',
        entity: 'DonationActionLog',
        message: `${logCount[0].cnt} action log entries for ${donationCount[0].cnt} donations`
      });
    } catch (err) {
      if (!err.message.includes("doesn't exist")) {
        results.push({ status: 'FAIL', entity: 'DonationActionLog', message: err.message });
      } else {
        results.push({ status: 'SKIP', entity: 'DonationActionLog', message: 'Table not found' });
      }
    }

    return results;
  }
};
