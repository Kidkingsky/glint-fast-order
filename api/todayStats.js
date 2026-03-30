/**
 * GET /api/todayStats
 *
 * Response 200:
 *   {
 *     todayNewOrders:      number,   // 今日新增訂單數
 *     todayPaid:           number,   // 今日已匯款訂單數 (status = confirming | processing)
 *     totalPendingPayment: number,   // 全部訂單中尚未填入匯款資訊的數量 (status = pending_payment)
 *   }
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'wd-fa-2a4d7'
const API_KEY    = process.env.FIREBASE_API_KEY    || 'AIzaSyDD7prLAsXzGk6QaapylDRXF5ef7Oo12Mg'
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

/** Firestore runQuery - returns array of matched document wrappers */
async function runQuery(structuredQuery) {
  const res = await fetch(`${BASE}:runQuery?key=${API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ structuredQuery }),
  })
  if (!res.ok) throw new Error(`Firestore runQuery failed: ${res.status}`)
  const rows = await res.json()
  return rows.filter(r => r.document)   // discard empty sentinel row
}

/** Firestore runAggregationQuery - returns a single count number */
async function countQuery(structuredQuery) {
  const res = await fetch(`${BASE}:runAggregationQuery?key=${API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery,
        aggregations: [{ count: {}, alias: 'count' }],
      },
    }),
  })
  if (!res.ok) throw new Error(`Firestore runAggregationQuery failed: ${res.status}`)
  const rows = await res.json()
  return Number(rows[0]?.result?.aggregateFields?.count?.integerValue ?? 0)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' })

  // 今日時間範圍 (UTC+8 台灣時區)
  const now        = new Date()
  const tzOffset   = 8 * 60 * 60 * 1000           // UTC+8
  const localNow   = new Date(now.getTime() + tzOffset)
  const localToday = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())
  )
  const todayStart    = new Date(localToday.getTime() - tzOffset)   // UTC 00:00 台北時間 00:00
  const tomorrowStart = new Date(todayStart.getTime() + 86400000)

  const dateFilters = [
    {
      fieldFilter: {
        field: { fieldPath: 'createdAt' },
        op:    'GREATER_THAN_OR_EQUAL',
        value: { timestampValue: todayStart.toISOString() },
      },
    },
    {
      fieldFilter: {
        field: { fieldPath: 'createdAt' },
        op:    'LESS_THAN',
        value: { timestampValue: tomorrowStart.toISOString() },
      },
    },
  ]

  try {
    // ① 今日所有訂單 (fetch then group by status in JS to avoid composite index)
    const todayDocs = await runQuery({
      from: [{ collectionId: 'orders' }],
      where: {
        compositeFilter: {
          op:      'AND',
          filters: dateFilters,
        },
      },
    })

    const todayNewOrders = todayDocs.length
    const todayPaid      = todayDocs.filter(d => {
      const status = d.document.fields?.status?.stringValue
      return status === 'confirming' || status === 'processing'
    }).length

    // ② 全部訂單中 pending_payment 的數量
    const totalPendingPayment = await countQuery({
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'status' },
          op:    'EQUAL',
          value: { stringValue: 'pending_payment' },
        },
      },
    })

    return res.status(200).json({
      todayNewOrders,
      todayPaid,
      totalPendingPayment,
    })
  } catch (err) {
    console.error('[todayStats] Error:', err)
    return res.status(500).json({ error: '伺服器錯誤', detail: err.message })
  }
}
