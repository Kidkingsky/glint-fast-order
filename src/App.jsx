import { Routes, Route } from 'react-router-dom'
import OrderTracking from './pages/OrderTracking'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<OrderTracking />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  )
}
