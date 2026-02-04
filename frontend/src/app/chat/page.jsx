import React from 'react'
import dynamic from 'next/dynamic'

const CameraCapture = dynamic(() => import('../../components/CameraCapture.jsx'), { ssr: false })
const ProfileSetup = dynamic(() => import('../../components/ProfileSetup.jsx'), { ssr: false })

export default function ChatPage() {
  return (
    <main style={{padding:20}}>
      <h2>Chat Onboarding</h2>
      <div style={{display:'flex',gap:20}}>
        <CameraCapture />
        <ProfileSetup />
      </div>
    </main>
  )
}
