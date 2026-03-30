import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, getDocs, doc, updateDoc, orderBy, query,
  limit, startAfter, where, getCountFromServer,
} from 'firebase/firestore'
import { db } from '../firebase'

const ADMIN_USER = 'admin'
const ADMIN_PASS = '12341234'
const PAGE_SIZE  = 10

const STATUS = {
  pending_payment: { label: '待匯款', cls: 'pending' },
  confirming:      { label: '確認中', cls: 'confirm' },
  processing:      { label: '製作中', cls: 'process' },
  cancelled:       { label: '已取消', cls: 'cancel'  },
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/* ── Login Gate ── */
function LoginPage({ onLogin }) {
  const [user, setUser]   = useState('')
  const [pass, setPass]   = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (user === ADMIN_USER && pass === ADMIN_PASS) onLogin()
    else setError('帳號或密碼錯誤，請重新輸入。')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo-f.png" className="login-logo" alt="Logo" />
        <div className="login-title">老范四驅車工坊</div>
        <div className="login-sub">Admin Dashboard</div>
        <form onSubmit={handleSubmit}>
          <label className="login-label">帳號</label>
          <input className="login-input" type="text" autoComplete="username"
            value={user} onChange={e => setUser(e.target.value)} placeholder="admin" />
          <label className="login-label">密碼</label>
          <input className="login-input" type="password" autoComplete="current-password"
            value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" />
          <button className="login-btn" type="submit">登入後台</button>
          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </div>
  )
}

/* ── Dashboard ── */
export default function AdminDashboard() {
  const [authed, setAuthed]             = useState(false)
  const [orders, setOrders]             = useState([])
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(true)
  const [spinning, setSpinning]         = useState(false)
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // ── Pagination ───────────────────────────────────────────────────────────
  const [page, setPage]           = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  // cursorsRef[i] = last document snapshot of page i (= start-after cursor for page i+1)
  // cursorsRef[0] = null  →  page 1 always starts from the beginning
  const cursorsRef = useRef([null])

  // ── Global stats (all-time, not affected by page filters) ────────────────
  const [stats, setStats]           = useState({ total: 0, pending: 0, confirming: 0, processing: 0 })
  const [totalRevenue, setTotalRevenue] = useState(0)

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ── Build query constraints from current filter state ────────────────────
  // NOTE: status + orderBy(createdAt) requires a Firestore composite index.
  // If you see a "missing index" error, click the link in the Firebase console to create it.
  function buildConstraints(sf = statusFilter, df = dateFrom, dt = dateTo) {
    const c = []
    if (sf !== 'all') c.push(where('status', '==', sf))
    if (df) c.push(where('createdAt', '>=', new Date(df + 'T00:00:00+08:00')))
    if (dt) c.push(where('createdAt', '<=', new Date(dt + 'T23:59:59.999+08:00')))
    c.push(orderBy('createdAt', 'desc'))
    return c
  }

  // ── Load global stats (independent of page filters) ──────────────────────
  const loadStats = useCallback(async () => {
    const col = collection(db, 'orders')
    const [totalSnap, pendingSnap, confirmSnap, processSnap, revSnap] = await Promise.all([
      getCountFromServer(query(col)),
      getCountFromServer(query(col, where('status', '==', 'pending_payment'))),
      getCountFromServer(query(col, where('status', '==', 'confirming'))),
      getCountFromServer(query(col, where('status', '==', 'processing'))),
      getDocs(query(col, where('status', '==', 'processing'))),
    ])
    setStats({
      total:      totalSnap.data().count,
      pending:    pendingSnap.data().count,
      confirming: confirmSnap.data().count,
      processing: processSnap.data().count,
    })
    setTotalRevenue(
      revSnap.docs.reduce((acc, d) => acc + (Number(d.data().totalAmount) || 0), 0)
    )
  }, [])

  // ── Load one page of orders from Firestore ───────────────────────────────
  const loadPage = useCallback(async (targetPage, sf, df, dt) => {
    setSpinning(true)
    const base = buildConstraints(sf, df, dt)

    // 1. Count matching documents (for pagination info)
    const countSnap = await getCountFromServer(query(collection(db, 'orders'), ...base))
    const count     = countSnap.data().count
    setTotalCount(count)

    // 2. Fetch exactly PAGE_SIZE docs for this page
    const pageConstraints = [...base]
    const cursor = cursorsRef.current[targetPage - 1]
    if (cursor) pageConstraints.push(startAfter(cursor))
    pageConstraints.push(limit(PAGE_SIZE))

    const snap = await getDocs(query(collection(db, 'orders'), ...pageConstraints))
    setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
    setSpinning(false)

    // Cache cursor so the NEXT page can start from here
    if (snap.docs.length > 0) {
      cursorsRef.current[targetPage] = snap.docs[snap.docs.length - 1]
    }
  }, []) // no deps — all filter values are passed as arguments

  // ── Reset pagination and reload when filters change ───────────────────────
  useEffect(() => {
    if (!authed) return
    cursorsRef.current = [null]
    setPage(1)
    loadStats()
    loadPage(1, statusFilter, dateFrom, dateTo)
  }, [authed, statusFilter, dateFrom, dateTo, loadStats, loadPage])

  // ── Load a new page when page number changes (but NOT on filter change,
  //    since filter change already resets to page 1 above) ──────────────────
  const prevPageRef = useRef(1)
  useEffect(() => {
    if (!authed || page === prevPageRef.current) return
    prevPageRef.current = page
    loadPage(page, statusFilter, dateFrom, dateTo)
  }, [page]) // intentionally minimal — filter changes are handled above

  // ── Actions ──────────────────────────────────────────────────────────────
  async function confirmOrder(id) {
    if (!confirm('確定要確認此筆入帳嗎？')) return
    await updateDoc(doc(db, 'orders', id), { status: 'processing' })
    loadStats()
    loadPage(page, statusFilter, dateFrom, dateTo)
  }

  async function cancelOrder(id) {
    if (!confirm('確定要取消此筆訂單嗎？取消後無法復原。')) return
    await updateDoc(doc(db, 'orders', id), { status: 'cancelled' })
    loadStats()
    loadPage(page, statusFilter, dateFrom, dateTo)
  }

  function refresh() {
    cursorsRef.current = [null]
    setPage(1)
    prevPageRef.current = 1
    loadStats()
    loadPage(1, statusFilter, dateFrom, dateTo)
  }

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setStatusFilter('all')
    // filter useEffect will trigger a fresh load
  }

  // ── Excel export (current page only) ────────────────────────────────────
  function exportExcel() {
    const BOM     = '\uFEFF'
    const headers = ['訂單號', '客戶姓名', '品項', '金額', '後五碼', '狀態', '訂購日期']
    const rows    = orders.map(o => [
      o.orderNumber  || '',
      o.customerName || '',
      o.items        || '',
      o.totalAmount  || 0,
      o.bankLastFive || '',
      STATUS[o.status]?.label || o.status || '',
      formatDate(o.createdAt),
    ])
    const csv  = BOM + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `orders_p${page}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Page navigation ───────────────────────────────────────────────────────
  function goToPage(p) {
    if (p < 1 || p > totalPages || p === page || spinning) return
    // Can only jump to pages whose cursor is already cached (or page 1)
    if (p > 1 && !cursorsRef.current[p - 1]) return
    prevPageRef.current = page
    setPage(p)
  }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  // Search is local within the current page's results
  const displayed = search
    ? orders.filter(o =>
        (o.customerName || '').includes(search) ||
        (o.orderNumber  || '').includes(search)
      )
    : orders

  const startItem = (page - 1) * PAGE_SIZE + 1
  const endItem   = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="ad-page">
      {/* Header */}
      <header className="ad-header">
        <img src="/logo-f.png" className="ad-header-logo" alt="Logo" />
        <div className="ad-header-title">
          <h1>老范四驅車工坊</h1>
          <p>Admin Dashboard · Order Management</p>
        </div>
        <button className="ad-logout-btn" onClick={() => setAuthed(false)}>登出</button>
        <button className="ad-refresh-btn" onClick={refresh} disabled={spinning}>
          {spinning ? '更新中...' : '↻ 重新整理'}
        </button>
      </header>

      <div className="ad-body">
        {/* Stats */}
        <div className="ad-stats">
          <div className="ad-stat-card pink">
            <div className="ad-stat-num">{stats.total}</div>
            <div className="ad-stat-label">Total Orders</div>
          </div>
          <div className="ad-stat-card warn">
            <div className="ad-stat-num">{stats.pending}</div>
            <div className="ad-stat-label">待匯款</div>
          </div>
          <div className="ad-stat-card cyan">
            <div className="ad-stat-num">{stats.confirming}</div>
            <div className="ad-stat-label">確認中</div>
          </div>
          <div className="ad-stat-card green">
            <div className="ad-stat-num">{stats.processing}</div>
            <div className="ad-stat-label">製作中</div>
          </div>
        </div>

        {/* Revenue */}
        <div className="ad-revenue">
          已確認總收入：<span>NT$ {totalRevenue.toLocaleString()}</span>
        </div>

        {/* Toolbar */}
        <div className="ad-toolbar">
          <input
            className="ad-search"
            type="text"
            placeholder="🔍 搜尋（當前頁）"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="ad-filter-group">
            <span className="ad-filter-label">日期</span>
            <input className="ad-date-input" type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} title="起始日期" />
            <span className="ad-filter-sep">–</span>
            <input className="ad-date-input" type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)} title="結束日期" />
          </div>

          <select className="ad-status-select" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">全部狀態</option>
            <option value="pending_payment">待匯款</option>
            <option value="confirming">確認中</option>
            <option value="processing">製作中</option>
            <option value="cancelled">已取消</option>
          </select>

          {(dateFrom || dateTo || statusFilter !== 'all') && (
            <button className="ad-clear-btn" onClick={clearFilters}>✕ 清除篩選</button>
          )}

          <button className="ad-export-btn" onClick={exportExcel} title="匯出當前頁">
            ↓ 匯出 Excel
          </button>
        </div>

        {/* Result info */}
        <div className="ad-result-count">
          {totalCount > 0
            ? `第 ${startItem}–${endItem} 筆，共 ${totalCount} 筆`
            : '查無符合條件的訂單'}
        </div>

        {/* Table */}
        <div className="ad-table-wrap">
          {loading ? (
            <div className="ad-empty">載入中...</div>
          ) : (
            <table className="ad-table">
              <thead>
                <tr>
                  <th>訂單號</th>
                  <th>客戶</th>
                  <th>品項</th>
                  <th>金額</th>
                  <th>後五碼</th>
                  <th>狀態</th>
                  <th>訂購日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(order => {
                  const s = STATUS[order.status] || { label: order.status, cls: 'pending' }
                  return (
                    <tr key={order.id}>
                      <td><span className="ad-order-num">{order.orderNumber}</span></td>
                      <td>{order.customerName}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.items}
                      </td>
                      <td><span className="ad-amount">NT$ {(order.totalAmount || 0).toLocaleString()}</span></td>
                      <td>
                        {order.bankLastFive
                          ? <span className="ad-bank">{order.bankLastFive}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td>
                        <span className={`ad-badge ${s.cls}`}>
                          <span className="ad-badge-dot" />{s.label}
                        </span>
                      </td>
                      <td><span className="ad-date">{formatDate(order.createdAt)}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {order.status === 'confirming' && (
                            <button className="ad-confirm-btn" onClick={() => confirmOrder(order.id)}>
                              ✓ 確認入帳
                            </button>
                          )}
                          {order.status === 'pending_payment' && (
                            <button className="ad-cancel-btn" onClick={() => cancelOrder(order.id)}>
                              ✕ 取消訂單
                            </button>
                          )}
                          {order.status !== 'confirming' && order.status !== 'pending_payment' && (
                            <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {displayed.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8}>
                      <div className="ad-empty">
                        {search ? `找不到「${search}」` : '查無符合條件的訂單'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="ad-pagination">
            <button
              className="ad-page-arrow"
              disabled={page === 1 || spinning}
              onClick={() => goToPage(page - 1)}
            >
              ‹ 上一頁
            </button>

            <div className="ad-page-nums">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                const hasCursor = p === 1 || !!cursorsRef.current[p - 1]
                return (
                  <button
                    key={p}
                    className={`ad-page-num ${p === page ? 'active' : ''}`}
                    disabled={spinning || !hasCursor || p === page}
                    onClick={() => goToPage(p)}
                    title={!hasCursor ? '請依序翻頁' : ''}
                  >
                    {p}
                  </button>
                )
              })}
            </div>

            <button
              className="ad-page-arrow"
              disabled={page >= totalPages || spinning}
              onClick={() => goToPage(page + 1)}
            >
              下一頁 ›
            </button>

            <span className="ad-page-info">
              第 {page} / {totalPages} 頁
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
