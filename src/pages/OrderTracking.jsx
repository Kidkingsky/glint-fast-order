import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const STEPS = [
  { key: 'pending_payment', label: '待匯款' },
  { key: 'confirming',      label: '確認中' },
  { key: 'processing',      label: '製作中' },
  { key: 'completed',       label: '已完成' },
]

const STATUS_MAP = {
  pending_payment: { label: '待匯款', cls: 'pending',    icon: '◈' },
  confirming:      { label: '確認中', cls: 'confirming', icon: '◉' },
  processing:      { label: '製作中', cls: 'processing', icon: '◆' },
  completed:       { label: '已完成', cls: 'completed',  icon: '✦' },
}

const SEVEN_ELEVEN_URL = 'https://emap.pcsc.com.tw/'

export default function OrderTracking() {
  const [order, setOrder]               = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [submitting, setSubmitting]     = useState(false)

  // Payment form fields
  const [lastFive, setLastFive]         = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [phone, setPhone]               = useState('')
  const [storeName, setStoreName]       = useState('')

  const params  = new URLSearchParams(window.location.search)
  const orderId = params.get('orderId') || params.get('orderid') || params.get('orderID')

  useEffect(() => {
    if (!orderId) {
      setError('❌ 找不到訂單編號，請確認連結。')
      setLoading(false)
      return
    }
    loadOrder()
  }, [orderId])

  async function loadOrder() {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'orders', orderId))
      if (snap.exists()) {
        setOrder(snap.data())
      } else {
        setError('找不到此訂單，請確認連結是否正確。')
      }
    } catch (err) {
      setError(`連線錯誤：${err.message}`)
    }
    setLoading(false)
  }

  async function submitPayment() {
    // Validation
    if (lastFive.replace(/\D/g, '').length !== 5) {
      alert('請輸入正確的 5 位數字後五碼。')
      return
    }
    if (!recipientName.trim()) {
      alert('請輸入收件姓名。')
      return
    }
    const phoneClean = phone.replace(/\D/g, '')
    if (!/^09\d{8}$/.test(phoneClean)) {
      alert('請輸入正確的手機號碼（格式：09xxxxxxxx）。')
      return
    }
    if (!storeName.trim()) {
      alert('請輸入 7-11 門市名稱。')
      return
    }
    if (!confirm('確定送出嗎？送出後將無法修改。')) return

    setSubmitting(true)
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        bankLastFive:  lastFive.replace(/\D/g, ''),
        recipientName: recipientName.trim(),
        phone:         phoneClean,
        storeName:     storeName.trim(),
        status:        'confirming',
        lastUpdated:   serverTimestamp(),
      })
      loadOrder()
    } catch (err) {
      alert(`送出失敗：${err.message}`)
    }
    setSubmitting(false)
  }

  const currentStep = order ? STEPS.findIndex(s => s.key === order.status) : -1
  const status      = order ? STATUS_MAP[order.status] : null

  return (
    <div className="ot-page">
      {/* Logo */}
      <div className="ot-logo-wrap">
        <img src="/logo-banner.png" className="ot-logo-banner" alt="老范四驅車工坊" />
        <div className="ot-brand">老范四驅車工坊</div>
        <div className="ot-subtitle">Order Tracking System</div>
      </div>

      {/* Card */}
      <div className="ot-card">
        <div className="ot-corner-bl" />

        {loading && (
          <div className="ot-loading">
            <div className="ot-spinner" />
            <span>正在讀取訂單資料...</span>
          </div>
        )}

        {error && !loading && (
          <div className="ot-error">{error}</div>
        )}

        {order && !loading && (
          <>
            {/* Step Progress */}
            <div className="ot-progress">
              {STEPS.map((step, i) => {
                const isDone   = i < currentStep
                const isActive = i === currentStep
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div className={`ot-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`} style={{ flex: 1 }}>
                      <div className={`ot-step-dot ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                        {isDone ? '✓' : i + 1}
                      </div>
                      <div className="ot-step-label">{step.label}</div>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`ot-step-line ${isDone ? 'done' : ''}`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Status Badge */}
            <div className={`ot-status ${status?.cls}`}>
              <span className="ot-dot" />
              {status?.icon} &nbsp; {status?.label}
            </div>

            <div className="ot-divider" />

            {/* Info Rows */}
            <div className="ot-row">
              <span className="ot-label">訂單編號</span>
              <span className="ot-value" style={{ fontFamily: 'Orbitron', fontSize: 13, letterSpacing: 2 }}>
                {order.orderNumber}
              </span>
            </div>
            <div className="ot-row">
              <span className="ot-label">訂購人</span>
              <span className="ot-value">{order.customerName}</span>
            </div>
            <div className="ot-row">
              <span className="ot-label">品項</span>
              <span className="ot-value">{order.items}</span>
            </div>
            <div className="ot-row">
              <span className="ot-label">應付總額</span>
              <span className="ot-value amount">
                NT$ {(Number(order.totalAmount) || 0).toLocaleString()}
              </span>
            </div>

            {/* ── 待匯款：填寫完整收件 + 匯款資訊 ── */}
            {order.status === 'pending_payment' && (
              <div className="ot-payment">
                <div className="ot-payment-label">匯款 &amp; 收件資訊</div>

                {/* 後五碼 */}
                <label className="ot-field-label">銀行匯款後五碼</label>
                <input
                  className="ot-input"
                  type="number"
                  value={lastFive}
                  onChange={e => setLastFive(e.target.value.slice(0, 5))}
                  placeholder="— — — — —"
                  maxLength={5}
                />

                {/* 收件姓名 */}
                <label className="ot-field-label">收件姓名</label>
                <input
                  className="ot-input ot-input-sm"
                  type="text"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  placeholder="請輸入收件人姓名"
                />

                {/* 手機號碼 */}
                <label className="ot-field-label">聯絡手機號碼</label>
                <input
                  className="ot-input ot-input-sm"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="09xxxxxxxx"
                  maxLength={10}
                />

                {/* 7-11 門市 */}
                <div className="ot-store-row">
                  <label className="ot-field-label" style={{ marginBottom: 0 }}>7-11 門市名稱</label>
                  <a
                    className="ot-store-link"
                    href={SEVEN_ELEVEN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🔍 查詢門市
                  </a>
                </div>
                <input
                  className="ot-input ot-input-sm"
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder="請輸入門市名稱（例：台北信義店）"
                />

                <button className="ot-btn" onClick={submitPayment} disabled={submitting}>
                  {submitting ? '送出中...' : '▶ \u00a0 送出並開始對帳'}
                </button>
              </div>
            )}

            {/* ── 已完成 ── */}
            {order.status === 'completed' && (
              <div className="ot-payment">
                <div className="ot-success ot-success-complete">
                  ✦ &nbsp; 您的訂單已完成，感謝您的支持！
                </div>
                <div className="ot-confirmed-grid" style={{ marginTop: 14 }}>
                  <div className="ot-confirmed-item">
                    <span className="ot-label">收件人</span>
                    <span className="ot-value">{order.recipientName || '—'}</span>
                  </div>
                  <div className="ot-confirmed-item">
                    <span className="ot-label">手機</span>
                    <span className="ot-value">{order.phone || '—'}</span>
                  </div>
                  <div className="ot-confirmed-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="ot-label">取貨門市</span>
                    <span className="ot-value">{order.storeName || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 確認中：顯示已填資訊 ── */}
            {order.status === 'confirming' && (
              <div className="ot-payment">
                <div className="ot-payment-label">已回報資訊</div>

                <label className="ot-field-label">銀行後五碼</label>
                <input className="ot-input" type="text" value={order.bankLastFive || ''} disabled />

                <div className="ot-confirmed-grid">
                  <div className="ot-confirmed-item">
                    <span className="ot-label">收件人</span>
                    <span className="ot-value">{order.recipientName || '—'}</span>
                  </div>
                  <div className="ot-confirmed-item">
                    <span className="ot-label">手機</span>
                    <span className="ot-value">{order.phone || '—'}</span>
                  </div>
                  <div className="ot-confirmed-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="ot-label">取貨門市</span>
                    <span className="ot-value">{order.storeName || '—'}</span>
                  </div>
                </div>

                <div className="ot-success">
                  ✦ &nbsp; 已成功收到回報，正在為您核對款項！
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="ot-footer">
        Powered by <span>Chiyou-AI</span> &nbsp;|&nbsp; Antigravity &nbsp;🪐
      </div>
    </div>
  )
}
