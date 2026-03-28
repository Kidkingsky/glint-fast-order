import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const STEPS = [
  { key: 'pending_payment', label: '待匯款' },
  { key: 'confirming',      label: '確認中' },
  { key: 'processing',      label: '製作中' },
]

const STATUS_MAP = {
  pending_payment: { label: '待匯款', cls: 'pending',    icon: '◈' },
  confirming:      { label: '確認中', cls: 'confirming', icon: '◉' },
  processing:      { label: '製作中', cls: 'processing', icon: '◆' },
}

export default function OrderTracking() {
  const [order, setOrder]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [lastFive, setLastFive] = useState('')

  const orderId = new URLSearchParams(window.location.search).get('orderId')

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
    const snap = await getDoc(doc(db, 'orders', orderId))
    if (snap.exists()) {
      setOrder(snap.data())
    } else {
      setError('找不到此訂單，請確認連結是否正確。')
    }
    setLoading(false)
  }

  async function submitPayment() {
    if (lastFive.length !== 5) {
      alert('請輸入正確的 5 位數字後五碼。')
      return
    }
    if (!confirm('確定送出嗎？送出後將無法修改。')) return

    await updateDoc(doc(db, 'orders', orderId), {
      bankLastFive: lastFive,
      status: 'confirming',
      lastUpdated: serverTimestamp(),
    })
    loadOrder()
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

        {/* Loading */}
        {loading && (
          <div className="ot-loading">
            <div className="ot-spinner" />
            <span>正在讀取訂單資料...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="ot-error">{error}</div>
        )}

        {/* Content */}
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

            {/* Payment Section */}
            {order.status === 'pending_payment' && (
              <div className="ot-payment">
                <div className="ot-payment-label">匯款後回報銀行後五碼</div>
                <input
                  className="ot-input"
                  type="number"
                  value={lastFive}
                  onChange={e => setLastFive(e.target.value.slice(0, 5))}
                  placeholder="— — — — —"
                  maxLength={5}
                />
                <button className="ot-btn" onClick={submitPayment}>
                  ▶ &nbsp; 送出並開始對帳
                </button>
              </div>
            )}

            {order.status === 'confirming' && (
              <div className="ot-payment">
                <div className="ot-payment-label">已回報後五碼</div>
                <input
                  className="ot-input"
                  type="text"
                  value={order.bankLastFive || ''}
                  disabled
                />
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
