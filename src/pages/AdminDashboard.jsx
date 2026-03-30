import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

const ADMIN_USER = 'admin'
const ADMIN_PASS = '12341234'

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

function toDateStr(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/* ── Login Gate ── */
function LoginPage({ onLogin }) {
  const [user, setUser]   = useState('')
  const [pass, setPass]   = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      onLogin()
    } else {
      setError('帳號或密碼錯誤，請重新輸入。')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/logo-f.png" className="login-logo" alt="Logo" />
        <div className="login-title">老范四驅車工坊</div>
        <div className="login-sub">Admin Dashboard</div>

        <form onSubmit={handleSubmit}>
          <label className="login-label">帳號</label>
          <input
            className="login-input"
            type="text"
            autoComplete="username"
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="admin"
          />
          <label className="login-label">密碼</label>
          <input
            className="login-input"
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="••••••••"
          />
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

  const loadOrders = useCallback(async () => {
    setSpinning(true)
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    setLoading(false)
    setSpinning(false)
  }, [])

  useEffect(() => { if (authed) loadOrders() }, [authed, loadOrders])

  async function confirmOrder(id) {
    if (!confirm('確定要確認此筆入帳嗎？')) return
    await updateDoc(doc(db, 'orders', id), { status: 'processing' })
    loadOrders()
  }

  async function cancelOrder(id) {
    if (!confirm('確定要取消此筆訂單嗎？取消後無法復原。')) return
    await updateDoc(doc(db, 'orders', id), { status: 'cancelled' })
    loadOrders()
  }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  const filtered = orders.filter(o => {
    const matchSearch = (o.customerName || '').includes(search) || (o.orderNumber || '').includes(search)
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    let matchDate = true
    if (dateFrom || dateTo) {
      const ds = toDateStr(o.createdAt)
      if (!ds) {
        matchDate = false
      } else {
        if (dateFrom && ds < dateFrom) matchDate = false
        if (dateTo   && ds > dateTo)   matchDate = false
      }
    }
    return matchSearch && matchStatus && matchDate
  })

  const stats = {
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending_payment').length,
    confirming: orders.filter(o => o.status === 'confirming').length,
    processing: orders.filter(o => o.status === 'processing').length,
  }
  const totalRevenue = orders
    .filter(o => o.status === 'processing')
    .reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0)

  function exportExcel() {
    const BOM = '\uFEFF'
    const headers = ['訂單號', '客戶姓名', '品項', '金額', '後五碼', '狀態', '訂購日期']
    const rows = filtered.map(o => [
      o.orderNumber  || '',
      o.customerName || '',
      o.items        || '',
      o.totalAmount  || 0,
      o.bankLastFive || '',
      STATUS[o.status]?.label || o.status || '',
      formatDate(o.createdAt),
    ])
    const csv = BOM + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <button className="ad-refresh-btn" onClick={loadOrders} disabled={spinning}>
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
            placeholder="🔍 搜尋客戶姓名或訂單號..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="ad-filter-group">
            <span className="ad-filter-label">日期</span>
            <input
              className="ad-date-input"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              title="起始日期"
            />
            <span className="ad-filter-sep">–</span>
            <input
              className="ad-date-input"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              title="結束日期"
            />
          </div>

          <select
            className="ad-status-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">全部狀態</option>
            <option value="pending_payment">待匯款</option>
            <option value="confirming">確認中</option>
            <option value="processing">製作中</option>
          </select>

          {(dateFrom || dateTo || statusFilter !== 'all') && (
            <button
              className="ad-clear-btn"
              onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter('all') }}
            >
              ✕ 清除篩選
            </button>
          )}

          <button className="ad-export-btn" onClick={exportExcel} title="匯出目前篩選結果">
            ↓ 匯出 Excel
          </button>

          <button
            className="ad-refresh-btn"
            onClick={loadOrders}
            disabled={spinning}
            title="重新整理訂單"
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.6s', transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)' }}>↻</span>
            &nbsp;{spinning ? '更新中...' : '重新整理'}
          </button>
        </div>

        {/* Result count */}
        <div className="ad-result-count">
          顯示 {filtered.length} / {orders.length} 筆訂單
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
                {filtered.map(order => {
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
                          : <span style={{ color: '#ccc' }}>—</span>
                        }
                      </td>
                      <td>
                        <span className={`ad-badge ${s.cls}`}>
                          <span className="ad-badge-dot" />{s.label}
                        </span>
                      </td>
                      <td>
                        <span className="ad-date">{formatDate(order.createdAt)}</span>
                      </td>
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
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="ad-empty">
                        {search ? `找不到「${search}」的相關訂單` : '查無符合條件的訂單'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
