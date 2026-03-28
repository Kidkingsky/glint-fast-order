import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

const ADMIN_USER = 'admin'
const ADMIN_PASS = '12341234'

const STATUS = {
  pending_payment: { label: '待匯款', cls: 'pending' },
  confirming:      { label: '確認中', cls: 'confirm' },
  processing:      { label: '製作中', cls: 'process' },
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
  const [authed, setAuthed]     = useState(false)
  const [orders, setOrders]     = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [spinning, setSpinning] = useState(false)

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

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  const filtered = orders.filter(o =>
    (o.customerName || '').includes(search) ||
    (o.orderNumber  || '').includes(search)
  )

  const stats = {
    total:      orders.length,
    pending:    orders.filter(o => o.status === 'pending_payment').length,
    confirming: orders.filter(o => o.status === 'confirming').length,
    processing: orders.filter(o => o.status === 'processing').length,
  }
  const totalRevenue = orders
    .filter(o => o.status === 'processing')
    .reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0)

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

        {/* Search */}
        <div className="ad-toolbar">
          <input
            className="ad-search"
            type="text"
            placeholder="🔍 搜尋客戶姓名或訂單號..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
                        {order.status === 'confirming' ? (
                          <button className="ad-confirm-btn" onClick={() => confirmOrder(order.id)}>
                            ✓ 確認入帳
                          </button>
                        ) : (
                          <span style={{ color: '#ccc', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="ad-empty">
                        {search ? `找不到「${search}」的相關訂單` : '尚無訂單資料'}
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
