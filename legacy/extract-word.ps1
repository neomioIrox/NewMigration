$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Open("C:\Users\NeomiOs\Documents\NewMigration\NewDB.docx")
$text = $doc.Content.Text
$text | Out-File -FilePath "C:\Users\NeomiOs\Documents\NewMigration\temp_newdb.txt" -Encoding UTF8
$doc.Close()
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Host "Document extracted successfully"
