import React, { useState } from 'react'

export default function ProfileSetup({ onSave, onBack, ctaLabel = 'Continue', initialNickname = '', initialBio = '' }) {
  const [nickname, setNickname] = useState(initialNickname || localStorage.getItem('anon_nickname') || '')
  const [bio, setBio] = useState(initialBio || localStorage.getItem('anon_bio') || '')

  function save() {
    if (!nickname.trim()) {
      alert('Please enter a nickname')
      return
    }
    localStorage.setItem('anon_nickname', nickname.trim())
    localStorage.setItem('anon_bio', bio.trim())
    onSave && onSave({ nickname: nickname.trim(), bio: bio.trim() })
  }

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 style={{ marginTop: 0 }}>Profile Setup</h3>
      <p className="muted" style={{ marginTop: 6 }}>Nickname and bio are optional and never linked to your real identity.</p>
      <div className="profile-setup">
        <label>
          <div style={{ fontSize: 12, color: '#9aa4b2', marginBottom: 4 }}>Nickname *</div>
          <input
            type="text"
            className="input"
            placeholder="Your anonymous name"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
          />
        </label>
        <label>
          <div style={{ fontSize: 12, color: '#9aa4b2', marginBottom: 4 }}>Bio (optional)</div>
          <textarea
            className="input"
            placeholder="Tell others about yourself (max 120 chars)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={120}
            rows={3}
            style={{ resize: 'none' }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {onBack && (
            <button className="btn ghost" onClick={onBack} style={{ width: '40%' }}>
              Back
            </button>
          )}
          <button className="btn" onClick={save} style={{ width: onBack ? '60%' : '100%' }}>
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
