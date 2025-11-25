-- Alter ItemDefinition column from TEXT to LONGTEXT
-- Run this on the MySQL database: kupathairtest

ALTER TABLE entitycontentitem
MODIFY COLUMN ItemDefinition LONGTEXT COLLATE utf8mb4_general_ci;

-- Verify the change
DESCRIBE entitycontentitem;
