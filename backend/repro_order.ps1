$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8000/api/v1'

# 1. Логин официанта (пароль)
$loginBody = @{ phone = '998901234569'; password = 'Staff1234' } | ConvertTo-Json
try {
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -Body $loginBody -ContentType 'application/json'
} catch {
  Write-Host "LOGIN FAIL: $($_.Exception.Message)"
  $_.ErrorDetails.Message
  exit 1
}
$tok = $login.access_token
$me = Invoke-RestMethod -Uri "$base/auth/me" -Headers @{ Authorization = "Bearer $tok" }
Write-Host "LOGIN OK user=$($me.email) branch=$($me.branch_id) role-slug=$($me.role_slug)"
Write-Host "USER: $($me | ConvertTo-Json -Depth 3 -Compress)"

$H = @{ Authorization = "Bearer $tok" }

# 2. Продукт (известный id из RAW-дампа)
$prodId = '231e3526-4da1-4f53-8bae-dd7a326ae499'
Write-Host "PRODUCT $prodId (Лагман)"

# 3. Создаём заказ ровно с тем же payload, что шлёт WaiterMode
#    branch_id берём из user-объекта логина — как в десктопе
#    branch_id: в десктопе подставляется выбранный филиал (App.jsx userWithBranch)
$order = @{
  branch_id = '388f6648-3dcd-46c4-bdf9-08fb22b2bb73'
  order_type = 'dine_in'
  table_number = '3'
  guests_count = 3
  note = $null
  items = @(@{ product_id = $prodId; quantity = 3; price = 45000; note = $null; takeaway = $false })
} | ConvertTo-Json -Depth 5
Write-Host "PAYLOAD: $order"
try {
  $res = Invoke-RestMethod -Uri "$base/pos/orders" -Method Post -Body $order -ContentType 'application/json' -Headers $H
  Write-Host "ORDER OK id=$($res.id) status=$($res.status) number=$($res.order_number)"
} catch {
  Write-Host "ORDER FAIL: $($_.Exception.Message)"
  Write-Host $_.ErrorDetails.Message
}

# 4. Отчёты — как шлёт ReportsPanel
$repUrl = "$base/reports/orders?date_from=2026-08-01&date_to=2026-08-05&branch_id=388f6648-3dcd-46c4-bdf9-08fb22b2bb73"
try {
  $rep = Invoke-RestMethod -Uri $repUrl -Headers $H
  Write-Host "REPORTS OK count=$($rep.count)"
} catch {
  Write-Host "REPORTS FAIL: $($_.Exception.Message)"
  Write-Host $_.ErrorDetails.Message
}
