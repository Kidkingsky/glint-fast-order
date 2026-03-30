/**
 * POST /api/createOrder
 *
 * Body (JSON):
 *   channel       string  必填 - 來源管道 (e.g. "Line", "FB", "官網")
 *   customerName  string  必填 - 客戶姓名
 *   items         string  必填 - 品項描述
 *   orderDate     string  必填 - 訂購日期 "YYYY/MM/DD"
 *   totalAmount   number  必填 - 訂單金額
 *
 * Response 201:
 *   { success: true, orderId: string, orderNumber: string }
 *
 * Firestore document structure:
 *   orderNumber   string     GF-YYYYMMDD-XXX (自動產生)
 *   channel       string
 *   customerName  string
 *   items         string
 *   orderDate     string     "YYYY/MM/DD"
 *   totalAmount   integer
 *   bankLastFive  string     "" (初始空白)
 *   status        string     "pending_payment"
 *   createdAt     timestamp
 *   lastUpdated   timestamp
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'wd-fa-2a4d7'
const API_KEY    = process.env.FIREBASE_API_KEY    || 'AIzaSyDD7prLAsXzGk6QaapylDRXF5ef7Oo12Mg'
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

/** 產生訂單號：GF-YYYYMMDD-XXX (3位隨機數 100-999) */
function generateOrderNumber(orderDate) {
  // 從 orderDate "YYYY/MM/DD" 取日期部分，移除斜線
  const datePart = orderDate
    ? orderDate.replace(/\//g, '')          // "20260328"
    : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = String(Math.floor(Math.random() * 900) + 100)  // 100–999
  return `GF-${datePart}-${rand}`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const { channel, customerName, items, orderDate, totalAmount } = req.body ?? {}

  // ── 驗證必填欄位 ──────────────────────────────
  if (!channel || typeof channel !== 'string' || !channel.trim()) {
    return res.status(400).json({ error: '缺少必填欄位: channel' })
  }
  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return res.status(400).json({ error: '缺少必填欄位: customerName' })
  }
  if (!items || typeof items !== 'string' || !items.trim()) {
    return res.status(400).json({ error: '缺少必填欄位: items' })
  }
  if (!orderDate || typeof orderDate !== 'string' || !/^\d{4}\/\d{2}\/\d{2}$/.test(orderDate.trim())) {
    return res.status(400).json({ error: '缺少必填欄位: orderDate，格式需為 YYYY/MM/DD' })
  }
  if (totalAmount == null || isNaN(Number(totalAmount)) || Number(totalAmount) < 0) {
    return res.status(400).json({ error: '缺少必填欄位: totalAmount (需為非負數)' })
  }

  const now         = new Date().toISOString()
  const orderNumber = generateOrderNumber(orderDate.trim())

  const firestoreDoc = {
    fields: {
      orderNumber:  { stringValue: orderNumber },
      channel:      { stringValue: channel.trim() },
      customerName: { stringValue: customerName.trim() },
      items:        { stringValue: items.trim() },
      orderDate:    { stringValue: orderDate.trim() },
      totalAmount:  { integerValue: String(Math.round(Number(totalAmount))) },
      bankLastFive: { stringValue: '' },
      status:       { stringValue: 'pending_payment' },
      createdAt:    { timestampValue: now },
      lastUpdated:  { timestampValue: now },
    },
  }

  try {
    const response = await fetch(`${BASE}/orders?documentId=${orderNumber}&key=${API_KEY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(firestoreDoc),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.error('[createOrder] Firestore error:', err)
      return res.status(502).json({ error: '寫入 Firebase 失敗', detail: err?.error?.message ?? '' })
    }

    const data    = await response.json()
    const orderId = data.name.split('/').pop()

    return res.status(201).json({ success: true, orderId, orderNumber })
  } catch (err) {
    console.error('[createOrder] Unexpected error:', err)
    return res.status(500).json({ error: '伺服器錯誤', detail: err.message })
  }
}
