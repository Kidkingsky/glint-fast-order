import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

console.log('[Firebase] Config loaded:', {
  apiKey: firebaseConfig.apiKey ? '✅ 有值' : '❌ 缺少 VITE_FIREBASE_API_KEY',
  projectId: firebaseConfig.projectId ? `✅ ${firebaseConfig.projectId}` : '❌ 缺少 VITE_FIREBASE_PROJECT_ID',
})

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
