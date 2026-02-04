import React, { useRef, useEffect, useState } from 'react'

export default function CameraVerify({ deviceId, onVerified }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [gender, setGender] = useState(null)
  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')

  useEffect(() => {
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        // Wait for metadata then play; handle play promise rejection (AbortError from double-mount in StrictMode)
        const onLoaded = () => {
          const playPromise = videoRef.current.play()
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((err) => {
              if (err && err.name !== 'AbortError') console.error('video play error', err)
            })
          }
          videoRef.current.removeEventListener('loadedmetadata', onLoaded)
        }
        videoRef.current.addEventListener('loadedmetadata', onLoaded)
      } catch (e) {
        console.error(e)
        setStatus('error')
      }
    }
    start()
    return () => {
      const s = videoRef.current && videoRef.current.srcObject
      if (s) {
        s.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  async function captureAndVerify() {
    setStatus('capturing')
    const video = videoRef.current
    const canvas = canvasRef.current
    // ensure we have video dimensions
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg'))
    if (!blob) {
      setStatus('error')
      return
    }

    const fd = new FormData()
    fd.append('file', blob, 'selfie.jpg')
    try {
      const resp = await fetch(`http://localhost:8000/verify?device_id=${deviceId}`, {
        method: 'POST',
        body: fd,
      })
      const data = await resp.json()
      setGender(data.gender)
      setStatus('verified')
      // call parent with profile info (nickname/bio empty here)
      onVerified && onVerified({ gender: data.gender, nickname, bio })
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }

  return (
    <div className="onboard-grid">
      <div className="card camera-box">
        <div className="video-wrap">
          <video ref={videoRef} />
        </div>
        <div className="camera-actions">
          <button className="btn" onClick={captureAndVerify}>Capture (gallery disabled)</button>
          <button className="btn ghost" onClick={() => { setStatus('idle'); setGender(null); }}>Reset</button>
        </div>
        <div className="status muted">Status: {status} — Gender: {gender ?? '—'}</div>
      </div>

      <div className="card profile-setup">
        <h3 style={{margin:0}}>Profile (pseudonymous)</h3>
        <div className="sub">No PII required — only nickname & short bio.</div>
        <div style={{height:12}} />
        <input className="input small" placeholder="Nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        <textarea className="input" placeholder="Short bio (1–2 lines)" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="btn" onClick={captureAndVerify}>Verify & Continue</button>
          <button className="btn ghost" onClick={() => { localStorage.removeItem('device_id'); window.location.reload(); }}>Reset Device</button>
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
