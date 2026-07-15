# Restart Server and Client

Kill all running background processes, then restart the server and open the main page:

1. Kill all background shells that are running
2. Check for processes on port 3030 and kill them using PowerShell
3. Wait a moment to ensure port is released
4. Start the server in background: `npm start`
5. Wait for server to start (check logs for "Server running on port 3030")
6. Open the main page in browser: http://localhost:3030/

Use PowerShell for killing processes on Windows.
