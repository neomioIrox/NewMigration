// Simple script to clear projectItem table for re-migration
// This will be run via the server's API

const message = `
To clear the projectItem table and re-run migration with enhanced logging:

1. Open browser at http://localhost:3030
2. Open browser console (F12)
3. Run this command:

fetch('http://localhost:3030/api/clear-table', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tableName: 'projectItem' })
})
.then(r => r.json())
.then(d => console.log(d));

Alternatively, connect to MySQL and run:
TRUNCATE TABLE projectitem;

Then run the migration again from the web interface.
`;

console.log(message);
