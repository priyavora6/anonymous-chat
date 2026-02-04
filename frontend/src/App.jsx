import React, { useEffect, useState } from 'react'
import CameraCapture from './components/CameraCapture'
import ProfileSetup from './components/ProfileSetup'
import Chat from './Chat'

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function App() {
  const [deviceId, setDeviceId] = useState(null)
  const [verified, setVerified] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('landing') // landing | verify | profile | chat
  const [verification, setVerification] = useState(null)

  useEffect(() => {
    let id = localStorage.getItem('device_id')
    if (!id) {
      id = uuidv4()
      localStorage.setItem('device_id', id)
    }
    setDeviceId(id)
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="app-container">
        <div className="brand">
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(90deg,#60a5fa,#5eead4)' }} />
          <div>
            <h1 style={{ margin: 0 }}>Anonymous Chat</h1>
            <div className="sub">Controlled Anonymity — demo</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: '#9aa4b2', marginTop: 40 }}>
          Initializing...
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className="brand">
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(90deg,#60a5fa,#5eead4)' }} />
        <div>
          <h1 style={{ margin: 0 }}>Anonymous Chat</h1>
          <div className="sub">Controlled Anonymity — demo</div>
        </div>
      </div>

      {deviceId ? (
        step === 'landing' ? (
          <div className="landing">
            <div className="card hero">
              <h2>Private, respectful, and anonymous chat</h2>
              <p className="muted" style={{ lineHeight: 1.7 }}>
                Meet new people without sharing personal details. We verify a selfie for basic gender matching and then discard it.
              </p>
              <div className="cta-row">
                <button className="btn" onClick={() => setStep('verify')}>Start Chatting</button>
                <button className="btn ghost" onClick={() => setStep('verify')}>I agree — Continue</button>
              </div>
              <div className="privacy-note">
                🔒 Privacy: No photos are stored. Messages are ephemeral.
              </div>
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 style={{ marginTop: 0 }}>How it works</h3>
              <ul className="feature-list">
                <li>📸 Camera verification (selfie is deleted)</li>
                <li>👤 Create a nickname + bio</li>
                <li>🎯 Choose a match filter</li>
                <li>⚡ Ephemeral chat with reports & limits</li>
              </ul>
            </div>
          </div>
        ) : step === 'verify' ? (
          <div className="onboard-grid">
            <CameraCapture
              deviceId={deviceId}
              includeProfileFields={false}
              onVerified={(profile) => {
                console.log('Verified with gender:', profile.gender)
                setVerification({ gender: profile.gender })
                setStep('profile')
              }}
            />
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 style={{ marginTop: 0 }}>Verification</h3>
              <p style={{ color: '#9aa4b2', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                Align your face in good lighting. The system only classifies gender and discards the image immediately.
              </p>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                If the camera fails, allow permissions and retry.
              </div>
              {verification && (
                <div className="profile-info" style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#5eead4' }}>✓ Gender Detected:</strong>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    {verification.gender === 'male' && '👨 Male'}
                    {verification.gender === 'female' && '👩 Female'}
                    {verification.gender === 'non-binary' && '🌈 Non-binary'}
                    {verification.gender === 'prefer-not-to-say' && '❓ Prefer Not to Say'}
                  </div>
                </div>
              )}
              <button className="btn ghost" onClick={() => setStep('landing')} style={{ marginTop: 18 }}>Back to Home</button>
            </div>
          </div>
        ) : step === 'profile' ? (
          <div className="onboard-grid">
            <ProfileSetup
              ctaLabel="Continue"
              onBack={() => setStep('verify')}
              onSave={(profile) => {
                const finalProfile = { ...profile, gender: verification?.gender || 'prefer-not-to-say' }
                setVerified(finalProfile)
                setStep('chat')
              }}
            />
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <h3 style={{ marginTop: 0 }}>Your Profile</h3>
              <div className="profile-info" style={{ marginBottom: 16 }}>
                <div><strong>Gender</strong>: {verification?.gender === 'male' && '👨 Male'}
                    {verification?.gender === 'female' && '👩 Female'}
                    {verification?.gender === 'non-binary' && '🌈 Non-binary'}
                    {verification?.gender === 'prefer-not-to-say' && '❓ Prefer Not to Say'}</div>
                <div style={{ marginTop: 8 }}>Add a nickname and optional bio. You can stay anonymous.</div>
                <div style={{ fontSize: 11, marginTop: 6, color: '#9aa4b2' }}>Verified at: {new Date().toLocaleTimeString()}</div>
              </div>
            </div>
          </div>
        ) : verified ? (
          <Chat deviceId={deviceId} profile={verified} />
        ) : null
      ) : null}
    </div>
  )
}
