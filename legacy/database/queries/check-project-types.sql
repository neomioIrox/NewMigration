-- Check ProjectType distribution
SELECT
    ProjectType,
    COUNT(*) as Count
FROM project
GROUP BY ProjectType
ORDER BY ProjectType;
