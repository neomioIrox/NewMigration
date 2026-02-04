-- Check failed rows from products table
SELECT
    productsid,
    Name,
    Name_en,
    Name_fr,
    ShortDescription,
    ShortDescription_en,
    ShortDescription_fr,
    Hide,
    Hide_en,
    Hide_fr,
    ShowMainPage,
    Price,
    Price_en,
    Price_fr
FROM products
WHERE productsid IN (335, 373, 1000, 1399)
ORDER BY productsid;
