// READ-ONLY: investigate the image linked to Project 39 and why it appears in many funds.
const targetDb = require("../../server/src/db/mysql-target");
const mssql = require("../../server/src/db/mssql");
function esc(s) { return String(s).replace(/'/g, "''"); }

(async () => {
  try {
    const [p39] = await targetDb.query("SELECT Id, MainMedia, ImageForListsView FROM Project WHERE Id=39");
    if (!p39.length) { console.log("Project 39 not found"); process.exit(0); }
    console.log("Project 39:", JSON.stringify(p39[0]));
    const mm = p39[0].MainMedia;

    const [med] = await targetDb.query(
      "SELECT Id, RelativePath, MediaType, SourceType, YearDirectory, MonthDirectory FROM Media WHERE Id=?", [mm]);
    console.log("Linked Media (MainMedia=" + mm + "):", JSON.stringify(med[0] || null));
    const rel = med[0] ? med[0].RelativePath : null;

    // How many funds share this exact media Id
    const [c1] = await targetDb.query("SELECT COUNT(*) c FROM Project WHERE ProjectType=1 AND MainMedia=?", [mm]);
    const [c2] = await targetDb.query("SELECT COUNT(*) c FROM Project WHERE ProjectType=1 AND ImageForListsView=?", [mm]);
    console.log("\nFunds (type=1) with MainMedia=" + mm + ": " + c1[0].c);
    console.log("Funds (type=1) with ImageForListsView=" + mm + ": " + c2[0].c);

    // How many Media rows share the same file path, and how many projects point at them
    if (rel) {
      const [c3] = await targetDb.query("SELECT COUNT(*) c FROM Media WHERE RelativePath=?", [rel]);
      const [c4] = await targetDb.query(
        "SELECT COUNT(*) c FROM Project WHERE MainMedia IN (SELECT Id FROM Media WHERE RelativePath=?)", [rel]);
      console.log("\nMedia rows with the same RelativePath ('" + rel + "'): " + c3[0].c);
      console.log("Projects whose MainMedia points to that RelativePath: " + c4[0].c);
    }

    // Distribution: most-shared MainMedia values among funds
    const [top] = await targetDb.query(
      "SELECT MainMedia, COUNT(*) c FROM Project WHERE ProjectType=1 GROUP BY MainMedia ORDER BY c DESC LIMIT 10");
    console.log("\nTop MainMedia values among funds (id: #funds):");
    top.forEach((t) => console.log("  " + t.MainMedia + ": " + t.c));

    // SOURCE side: products.Pic for productsid 39, and how many products share that Pic
    const s = await mssql.query("SELECT productsid, Pic FROM products WITH (NOLOCK) WHERE productsid=39");
    const pic = s.recordset.length ? s.recordset[0].Pic : null;
    console.log("\nSource products.Pic[39]: " + JSON.stringify(pic));
    if (pic) {
      const sc = await mssql.query("SELECT COUNT(*) c FROM products WITH (NOLOCK) WHERE Pic='" + esc(pic) + "'");
      console.log("Source products sharing that exact Pic value: " + sc.recordset[0].c);
    }
  } catch (e) {
    console.error("ERR", e.message);
  }
  process.exit(0);
})();
