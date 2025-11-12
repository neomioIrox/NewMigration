# Database Migration Helper

This tool helps visualize and manage the migration from SQL Server to MySQL, focusing on the Project table and its relationships.

**🚀 For AI-assisted development**: See [PROMPT.md](PROMPT.md) for the master prompt system and detailed mapping documentation.

## Quick Start

The server is currently running at: **http://localhost:3000**

Open this URL in your web browser to see:
- All tables connected to the Project table in the new MySQL database
- Corresponding tables from the old SQL Server database
- Field-by-field mapping details from your Mapping.csv file

## What You'll See

### Left Panel - New DB (MySQL)
- **Project table** - Main table structure with all columns
- **Tables that reference Project** - All tables with foreign keys to Project (like ProjectItem, ProjectLocalization, Recruiter, etc.)
- **Tables referenced by Project** - Lookup tables used by Project (like lutprojecttype, terminal, user, media, etc.)

### Right Panel - Old DB (SQL Server)
- **Products table** - The main source table from the old database
- Related old tables based on your mapping definitions

### Bottom Panel - Field Mappings
- Detailed conversion rules for each field
- Color-coded conversion types:
  - **Green (direct)** - Direct field mapping
  - **Blue (auto)** - Auto-generated values
  - **Gray (const)** - Constant values
  - **Orange (expression)** - Calculated/expression values
  - **Red (FK)** - Foreign key relationships

## Key Findings - Project Table

### New DB Structure (project table)
The project table in MySQL has these key relationships:

**Tables that reference Project (child tables):**
- ProjectItem - Items within projects
- ProjectLocalization - Multi-language content
- Lead - Project leads
- LinkSetting - Link configurations
- MoreItemLink - Additional item links
- Recruiter - Project recruiters
- RecruitersGroup - Recruiter groups
- FundCategory - Fund categories

**Tables referenced by Project (parent/lookup tables):**
- lutprojecttype - Project types (Fund=1, Collection=2)
- terminal - Credit card terminals
- user - User information (created/updated by)
- media - Media files (images, videos)
- lutrecordstatus - Record status values

### Old DB Mapping
- **Main source:** Products table
- **Project Types:** Created from Products with different filters
  - Step 1: Products → Project (Type=Fund)
  - Step 1.1: Products → Project (Type=Collection)

## Server Management

To stop the server, use this command:
```bash
# Find the process
ps aux | grep "node server.js"

# Kill it (replace PID with actual process ID)
kill <PID>
```

To start the server again:
```bash
npm start
```

## Files Created

- `server.js` - Node.js Express server with SQL parser
- `public/index.html` - Web interface
- `package.json` - Node.js dependencies

## Next Steps

This tool will help you and Claude to:
1. Understand the complex relationships between tables
2. Plan the migration order (parent tables before child tables)
3. Verify all field mappings are complete
4. Track migration progress for each table
