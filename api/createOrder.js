/**
 * POST /api/createOrder
 *
 * Body (JSON):
 *   customerName  string  必填 - 客戶姓名
 *   items         string  必填 - 品項描述
 *   totalAmount   number  必填 - 訂單金額
 *   phone         string  選填 - 聯絡電話
 *   notes         string  選填 - 備註
 *
 * Response 201:
 *   { success: true, orderId: string, orderNumber: string }
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'wd-fa-2a4d7'
const API_KEY    = process.env.FIREBASE_API_KEY    || 'AIzaSyDD7prLAsXzGk6QaapylDRXF5ef7Oo12Mg'
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

function generateOrderNumber() {
  const now  = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')       // e.g. 20260330
  const rand = String(Math.floor(Math.random() * 9000) + 1000)        // 4-digit random
  return `ORD-${date}-${rand}`
}

export default async function handler(req, res) {
  // CORS headers (optional: tighten origin in production)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const { customerName, items, totalAmount, phone = '', notes = '' } = req.body ?? {}

  if (!customerName || typeof customerName !== 'string' || !customerName.trim()) {
    return res.status(400).json({ error: '缺少必填欄位: customerName' })
  }
  if (!items || typeof items !== 'string' || !items.trim()) {
    return res.status(400).json({ error: '缺少必填欄位: items' })
  }
  if (totalAmount == null || isNaN(Number(totalAmount)) || Number(totalAmount) < 0) {
    return res.status(400).json({ error: '缺少必填欄位: totalAmount (需為非負數)' })
  }

  const orderNumber = generateOrderNumber()
  const createdAt   = new Date().toISOString()

  const firestoreDoc = {
    fields: {
      orderNumber:  { stringValue: orderNumber },
      customerName: { stringValue: customerName.trim() },
      items:        { stringValue: items.trim() },
      totalAmount:  { integerValue: String(Math.round(Number(totalAmount))) },
      phone:        { stringValue: String(phone).trim() },
      notes:        { stringValue: String(notes).trim() },
      bankLastFive: { stringValue: '' },
      status:       { stringValue: 'pending_payment' },
      createdAt:    { timestampValue: createdAt },
    },
  }

  try {
    const response = await fetch(`${BASE}/orders?key=${API_KEY}`, {
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
