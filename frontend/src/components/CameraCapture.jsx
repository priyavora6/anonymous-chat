import React, { useRef, useEffect, useState } from 'react'
import { getOrCreateDeviceId } from '../utils/fingerprint'

export default function CameraCapture({ deviceId, onVerified, includeProfileFields = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [nickname, setNickname] = useState(localStorage.getItem('anon_nickname') || '')
  const [bio, setBio] = useState(localStorage.getItem('anon_bio') || '')
  const [showProfileForm, setShowProfileForm] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [resolvedDeviceId, setResolvedDeviceId] = useState(deviceId || '')
  const [detectedGender, setDetectedGender] = useState('')

  useEffect(() => {
    if (deviceId) {
      setResolvedDeviceId(deviceId)
      return
    }
    try {
      const id = getOrCreateDeviceId()
      setResolvedDeviceId(id)
    } catch (e) {
      console.error('Device ID error:', e)
      setResolvedDeviceId('')
    }
  }, [deviceId])

  useEffect(() => {
    let mounted = true
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' },
          audio: false 
        })
        if (!mounted) return
        if (videoRef.current) videoRef.current.srcObject = s
        setStatus('ready')
      } catch (e) {
        console.error('Camera error:', e)
        setStatus('camera-error')
      }
    }
    start()
    return () => {
      mounted = false
      const s = videoRef.current && videoRef.current.srcObject
      if (s) s.getTracks().forEach(t => t.stop())
    }
  }, [])

  function sanitizeInput(input, maxLen) {
    // Remove dangerous characters and limit length
    return input.trim().slice(0, maxLen).replace(/[<>\"'&]/g, '')
  }

  function saveProfile() {
    if (!includeProfileFields) return true
    if (!nickname.trim()) {
      alert('Please enter a nickname')
      return false
    }
    if (nickname.length < 3 || nickname.length > 20) {
      alert('Nickname must be 3-20 characters')
      return false
    }
    if (bio.length > 100) {
      alert('Bio must be under 100 characters')
      return false
    }
    const sanitizedNick = sanitizeInput(nickname, 20)
    const sanitizedBio = sanitizeInput(bio, 100)
    localStorage.setItem('anon_nickname', sanitizedNick)
    localStorage.setItem('anon_bio', sanitizedBio)
    return true
  }

  async function uploadImage(blob) {
    if (!blob) {
      setErrorMessage('No image captured. Please try again.')
      setStatus('error')
      return
    }
    if (!resolvedDeviceId) {
      setErrorMessage('Device ID missing. Please refresh the page.')
      setStatus('error')
      return
    }
    setStatus('uploading')
    setErrorMessage('')
    try {
      const fd = new FormData()
      fd.append('file', blob, 'selfie.jpg')
      
      console.log('Uploading to:', `http://localhost:8000/verify?device_id=${resolvedDeviceId}`)
      
      const resp = await fetch(
        `http://localhost:8000/verify?device_id=${encodeURIComponent(resolvedDeviceId)}`,
        {
          method: 'POST',
          body: fd,
          mode: 'cors',
          credentials: 'include',
        }
      )
      
      console.log('Response status:', resp.status)
      const text = await resp.text()
      console.log('Response text:', text)

      if (!resp.ok) {
        console.error('Server error:', resp.status, text)
        let message = `Upload failed: ${resp.status}`
        try {
          const errJson = JSON.parse(text)
          message = errJson.detail || errJson.message || message
        } catch {
          if (text) message = text
        }
        setErrorMessage(message)
        setStatus('error')
        return
      }

      const data = JSON.parse(text)
      console.log('Verification result:', data)
      setDetectedGender(data.gender || 'prefer-not-to-say')
      // Store gender in localStorage
      localStorage.setItem('anon_gender', data.gender)
      setStatus('verified')
      setTimeout(() => {
        onVerified && onVerified({
          gender: data.gender,
          nickname: includeProfileFields ? nickname.trim() : '',
          bio: includeProfileFields ? bio.trim() : '',
        })
      }, 800)
    } catch (e) {
      console.error('Upload error:', e)
      setErrorMessage(e?.message || 'Unknown error')
      setStatus('error')
    }
  }

  function capture() {
    if (!saveProfile()) return
    setStatus('capturing')
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return

    c.width = v.videoWidth || 640
    c.height = v.videoHeight || 480
    const ctx = c.getContext('2d')
    ctx.drawImage(v, 0, 0, c.width, c.height)

    c.toBlob(uploadImage, 'image/jpeg', 0.9)
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!saveProfile()) return
    uploadImage(file)
  }

  function retryCapture() {
    setErrorMessage('')
    setDetectedGender('')
    setStatus('ready')
  }

  return (
    <div className="card camera-box">
      <h2>Verification</h2>
      {status === 'camera-error' && (
        <div style={{ color: '#ff6b6b', textAlign: 'center', padding: '20px' }}>
          <p>❌ Camera not available</p>
          <p style={{ fontSize: 12, color: '#9aa4b2', marginTop: 8 }}>Use file upload instead:</p>
        </div>
      )}
      {status !== 'verified' && status !== 'camera-error' && (
        <>
          <div className="video-wrap">
            {(status === 'ready' || status === 'idle' || status === 'capturing' || status === 'uploading') && status !== 'camera-error' ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9aa4b2' }}>
                {status === 'error' ? '❌ Error' : status === 'uploading' ? '⏳ Uploading...' : '✓ Verified'}
              </div>
            )}
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {includeProfileFields && (
            <div className="profile-setup">
              <label>
                <div style={{ fontSize: 12, color: '#5eead4', marginBottom: 4, fontWeight: 600 }}>👤 Nickname *</div>
                <input
                  type="text"
                  className="input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Your anonymous name"
                  maxLength={30}
                />
              </label>
              <label>
                <div style={{ fontSize: 12, color: '#5eead4', marginBottom: 4, fontWeight: 600 }}>✍️ Bio (optional)</div>
                <textarea
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself (max 120 chars)"
                  maxLength={120}
                  rows={3}
                  style={{ resize: 'none' }}
                />
              </label>
            </div>
          )}

          <div className="status" style={{ fontSize: 12, textAlign: 'center', minHeight: 28, background: 'rgba(94, 234, 212, 0.1)', color: '#5eead4' }}>
            {status === 'idle' && ''}
            {status === 'ready' && '✅ Camera ready — enter profile below'}
            {status === 'capturing' && '📸 Capturing selfie...'}
            {status === 'uploading' && '⬆️  Verifying with AI...'}
            {status === 'error' && `❌ ${errorMessage || 'Error — try again'}`}
            {includeProfileFields && '👤 Set your anonymous profile'}
            {status === 'camera-error' && '❌ Camera access denied'}
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button
              className="btn"
              onClick={capture}
              disabled={status === 'capturing' || status === 'uploading' || status === 'camera-error'}
              style={{
                opacity: status === 'capturing' || status === 'uploading' || status === 'camera-error' ? 0.6 : 1,
                cursor: status === 'capturing' || status === 'uploading' || status === 'camera-error' ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {'📸 Capture Photo'}
            </button>
            {status === 'error' && (
              <button className="btn ghost" onClick={retryCapture} style={{ width: 140 }}>
                Retry
              </button>
            )}
          </div>
        </>
      )}
      {status === 'verified' && (
        <div style={{ textAlign: 'center', color: '#5eead4' }}>
          ✓ Verified — Gender: {detectedGender || 'prefer-not-to-say'}
          <div style={{ fontSize: 12, color: '#9aa4b2', marginTop: 6 }}>Redirecting to chat...</div>
        </div>
      )}
    </div>
  )
}
