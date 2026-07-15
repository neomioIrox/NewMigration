// Read-only: investigate amount semantics for QA donations 1834502 (fr recurring),
// 1834632 (IL installments), 1833484 (Asakim recurring) + a France one-time for coverage.
const targetDb = require('../src/db/mysql-target');
const mssqlDb = require('../src/db/mssql');

const IDS = [1834502, 1834632, 1833484];

async function main() {
  try {
    for (const id of IDS) {
      console.log('\n========== Order ' + id + ' ==========');
      const src = await mssqlDb.query(
        "SELECT OrdersId, DonationType, PaymentMethod, ClearingProvider, OrderLaguage, Payments, Total, ChargeTotal, Currency, ChargeCurrency, TotalInILS, TotalInUSD, TotalInEUR, USDRate, EURRate, FirstPayment, ConstPayment, isCharged, ChargeStatus, AsakimID FROM Orders WITH (NOLOCK) WHERE OrdersId=" + id);
      console.log('SOURCE: ' + JSON.stringify(src.recordset[0], null, 1));
      const [d] = await targetDb.query(
        'SELECT Id, PaymentType, PaymentsCount, MonthlySum, DisplayMonthlySum, Currency, DisplayCurrency, ClearingMethodAreaId, SourceApp FROM Donation WHERE Id=?', [id]);
      console.log('TARGET Donation: ' + JSON.stringify(d[0] || null, null, 1));
      const [cv] = await targetDb.query('SELECT Currency, RateInILS, TotalSum FROM DonationCurrencyValue WHERE DonationId=?', [id]);
      console.log('TARGET CurrencyValues: ' + JSON.stringify(cv));
    }

    // Distribution: how do Total/ChargeTotal/Payments relate per DonationType (finished orders)?
    console.log('\n========== Semantics check: ChargeTotal vs Total/Payments ==========');
    const dist = await mssqlDb.query(`
      SELECT DonationType,
        COUNT(*) cnt,
        SUM(CASE WHEN Payments>1 THEN 1 ELSE 0 END) multiPay,
        SUM(CASE WHEN Payments>1 AND ChargeTotal IS NOT NULL AND ABS(ChargeTotal-(Total/NULLIF(Payments,0)))<0.02 THEN 1 ELSE 0 END) chargeIsPerInstallment,
        SUM(CASE WHEN Payments>1 AND ChargeTotal IS NOT NULL AND ABS(ChargeTotal-Total)<0.02 THEN 1 ELSE 0 END) chargeIsFullTotal
      FROM Orders WITH (NOLOCK)
      WHERE ChargeStatus='OrderFinished'
      GROUP BY DonationType`);
    console.log(JSON.stringify(dist.recordset, null, 1));

    // France recurring sample: Total vs TotalInEUR mismatch scale
    console.log('\n========== fr orders: Total vs TotalInEUR ==========');
    const fr = await mssqlDb.query(`
      SELECT TOP 5 OrdersId, DonationType, Total, ChargeTotal, Currency, ChargeCurrency, TotalInILS, TotalInEUR, EURRate
      FROM Orders WITH (NOLOCK)
      WHERE ChargeStatus='OrderFinished' AND OrderLaguage='fr' AND ClearingProvider='Stripe'
      ORDER BY OrdersId DESC`);
    console.log(JSON.stringify(fr.recordset, null, 1));
  } catch (err) {
    console.error('FATAL:', err.message);
  } finally {
    await targetDb.close(); await mssqlDb.close(); process.exit(0);
  }
}
main();
