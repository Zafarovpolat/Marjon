$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
Set-Location c:\Users\x\Desktop\Marjon\backend
& .\.venv\Scripts\python.exe seed.py
exit $LASTEXITCODE
