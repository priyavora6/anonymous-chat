import React, { useEffect, useRef, useState } from 'react'
import { createSocket } from './utils/socket'
import './styles.css'

export default function Chat({ deviceId, profile }) {
  const [ws, setWs] = useState(null)
  const [state, setState] = useState('idle') // idle, queued, matched, chatting
  const [peer, setPeer] = useState(null)
  const [peerProfile, setPeerProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [dailyLimits, setDailyLimits] = useState({ male: 5, female: 5, 'non-binary': 5, 'prefer-not-to-say': 5 })
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [showConfirmModal, setShowConfirmModal] = useState(null) // 'leave', 'report', or null
  const [isTyping, setIsTyping] = useState(false) // Is peer typing
  const [lastFilter, setLastFilter] = useState(() => localStorage.getItem('last_filter') || 'any')
  const [selectedFilter, setSelectedFilter] = useState(() => localStorage.getItem('last_filter') || 'any')
  const [toast, setToast] = useState(null)
  const [bannedMessage, setBannedMessage] = useState('')
  const [wsStatus, setWsStatus] = useState('connecting') // connecting, connected, disconnected, error
  const [queueWaitTime, setQueueWaitTime] = useState(0) // seconds waiting in queue
  const [queueStartTime, setQueueStartTime] = useState(null)
  const msgRef = useRef()
  const stateRef = useRef('idle')
  const cooldownRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    cooldownRef.current = setInterval(() => {
      setCooldownSeconds(s => s - 1)
    }, 1000)
    return () => clearInterval(cooldownRef.current)
  }, [cooldownSeconds])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (state !== 'queued' || !queueStartTime) return
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - queueStartTime) / 1000)
      setQueueWaitTime(elapsed)
      if (elapsed > 60) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'leave' }))
        }
        setState('idle')
        setQueueWaitTime(0)
        setQueueStartTime(null)
        setToast({ type: 'error', message: 'No match found. Please try again.' })
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [state, queueStartTime, ws])

  useEffect(() => {
    const socket = createSocket(deviceId)
    
    socket.onopen = () => {
      console.log('Chat WebSocket connected')
      setWsStatus('connected')
      setWs(socket)
    }
    
    socket.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        console.log('Chat message:', d)
        // Apply realtime limits if server includes them on any message
        if (d.limits) {
          setDailyLimits(d.limits || {})
        }
        
        if (d.type === 'queued') {
          setState('queued')
          stateRef.current = 'queued'
          setQueueStartTime(Date.now())
          setQueueWaitTime(0)
        }
        if (d.type === 'matched') {
          setPeer(d.peer)
          setPeerProfile(d.peer_profile || { nickname: 'Stranger', gender: d.peer_gender || '?' })
          setState('chatting')
          stateRef.current = 'chatting'
          setQueueStartTime(null)
          setQueueWaitTime(0)
          // Load stored messages
          const stored = localStorage.getItem(`chat_${d.peer}`)
          if (stored) setMessages(JSON.parse(stored))
          else setMessages([])
        }
        // legacy explicit daily_limits type is still supported above
        if (d.type === 'msg') {
          setMessages((m) => {
            const updated = [...m, { from: d.from, text: d.text, time: new Date().toLocaleTimeString() }]
            // Store in localStorage
            if (peer) localStorage.setItem(`chat_${peer}`, JSON.stringify(updated))
            return updated
          })
          setIsTyping(false) // Stop showing typing indicator when message arrives
        }
        if (d.type === 'typing') {
          setIsTyping(true)
          // Stop showing typing indicator after 3 seconds of inactivity
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000)
        }
        if (d.type === 'peer_left') {
          setState('idle')
          stateRef.current = 'idle'
          setPeer(null)
          setPeerProfile(null)
          setMessages([])
        }
        if (d.type === 'error') {
          console.warn('Server error:', d.message)
          setToast({ type: 'error', message: d.message || 'Something went wrong' })
          if ((d.message || '').toLowerCase().includes('ban')) {
            setBannedMessage(d.message)
          }
        }
      } catch (err) {
        console.error('Error parsing message:', err)
      }
    }
    
    socket.onerror = (err) => {
      console.error('WebSocket error:', err)
      setWsStatus('error')
    }
    
    socket.onclose = () => {
      console.log('Chat WebSocket closed')
      setWsStatus('disconnected')
      setWs(null)
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        console.log('Attempting to reconnect...')
        setWsStatus('connecting')
        const newSocket = createSocket(deviceId)
        setWs(newSocket)
      }, 3000)
    }
    
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    }
  }, [deviceId])


  function joinQueue(filter) {
    if (cooldownSeconds > 0) {
      alert(`Please wait ${cooldownSeconds} seconds before joining again`)
      return
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert('WebSocket not connected')
      return
    }
    console.log('Joining queue with filter:', filter)
    localStorage.setItem('last_filter', filter)
    setLastFilter(filter)
    setSelectedFilter(filter)
    ws.send(JSON.stringify({ action: 'join', filter, nickname: profile.nickname }))
  }

  function leave() {
    setShowConfirmModal('leave')
  }

  function confirmLeave() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    console.log('Leaving queue')
    ws.send(JSON.stringify({ action: 'leave' }))
    setState('idle')
    stateRef.current = 'idle'
    setPeer(null)
    setPeerProfile(null)
    setMessages([])
    setCooldownSeconds(5)
    setShowConfirmModal(null)
  }

  function sendMsg() {
    const text = msgRef.current.value.trim()
    if (!text) return
    if (text.length > 500) {
      alert('Message too long (max 500 chars)')
      return
    }
    // Sanitize message
    const sanitized = text.slice(0, 500).replace(/[<>\"'&]/g, '')
    if (!ws || ws.readyState !== WebSocket.OPEN || stateRef.current !== 'chatting') return
    console.log('Sending message:', sanitized)
    ws.send(JSON.stringify({ action: 'msg', text: sanitized }))
    setMessages((m) => [...m, { from: 'me', text: sanitized, time: new Date().toLocaleTimeString() }])
    msgRef.current.value = ''
  }

  function nextMatch() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    console.log('Next match')
    ws.send(JSON.stringify({ action: 'next' }))
    setState('idle')
    stateRef.current = 'idle'
    setPeer(null)
    setPeerProfile(null)
    setMessages([])
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'join', filter: 'any', nickname: profile.nickname }))
      }
    }, 200)
  }

  function report() {
    setShowConfirmModal('report')
  }

  function confirmReport() {
    if (!ws || !peer || ws.readyState !== WebSocket.OPEN) return
    console.log('Reporting peer:', peer)
    ws.send(JSON.stringify({ action: 'report', reported: peer, reason: 'Inappropriate behavior' }))
    setShowConfirmModal(null)
    alert('Reported — thank you')
  }

  function getGenderEmoji(gender) {
    const map = {
      'male': '👨',
      'female': '👩',
      'non-binary': '🌈',
      'prefer-not-to-say': '❓',
      '?': '❓'
    }
    return map[gender] || '❓'
  }

  function remainingFor(filter) {
    if (filter === 'any') {
      return Math.min(
        dailyLimits.male ?? 5,
        dailyLimits.female ?? 5,
        dailyLimits['non-binary'] ?? 5,
        dailyLimits['prefer-not-to-say'] ?? 5
      )
    }
    return dailyLimits[filter] ?? 5
  }

  function getResetTime() {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const hoursLeft = Math.ceil((tomorrow - now) / 3600000)
    return hoursLeft
  }

  function handleInputChange(e) {
    // Send typing indicator every 1 second
    if (!typingTimeoutRef.current && ws && ws.readyState === WebSocket.OPEN) {
      const peer = active_pairs?.get?.(deviceId) || peer
      if (peer && stateRef.current === 'chatting') {
        ws.send(JSON.stringify({ action: 'typing' }))
        typingTimeoutRef.current = setTimeout(() => {
          typingTimeoutRef.current = null
        }, 1000)
      }
    }
  }

  if (bannedMessage) {
    return (
      <div className="ban-screen">
        <div className="card ban-card">
          <h2>Access Restricted</h2>
          <p className="muted">{bannedMessage}</p>
          <button className="btn ghost" onClick={() => window.location.reload()}>Appeal / Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-root">
      {toast && (
        <div className={`toast ${toast.type || 'info'}`}>
          {toast.message}
        </div>
      )}
      <div className="connection-status" style={{ display: wsStatus !== 'connected' ? 'flex' : 'none' }}>
        {wsStatus === 'connecting' && '🔄 Connecting...'}
        {wsStatus === 'disconnected' && '❌ Disconnected (reconnecting)'}
        {wsStatus === 'error' && '⚠️ Connection error'}
      </div>
      <div className="sidebar">
        <div style={{ marginBottom: 16 }}>
          <strong style={{ color: '#5eead4', fontSize: 14 }}>👤 Your Profile</strong>
          <div className="profile-info">
            <div><strong>Nickname</strong>: {profile.nickname || 'Anonymous'}</div>
            <div><strong>Gender</strong>: {getGenderEmoji(profile.gender)} {profile.gender}</div>
            <div><strong>Bio</strong>: {profile.bio || 'Not provided'}</div>
            <div style={{ fontSize: 11, color: '#5eead4', marginTop: 8 }}>Status: <span style={{ fontWeight: 600 }}>{state.toUpperCase()}</span></div>
          </div>
        </div>
        {state === 'chatting' && peerProfile && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(94, 234, 212, 0.2)' }}>
            <strong style={{ color: '#5eead4', fontSize: 14 }}>💬 Matched Peer</strong>
            <div className="profile-info">
              <div><strong>Nickname</strong>: {peerProfile.nickname}</div>
              <div><strong>Gender</strong>: {getGenderEmoji(peerProfile.gender)} {peerProfile.gender}</div>
              <div><strong>Bio</strong>: {peerProfile.bio || 'Not provided'}</div>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(94, 234, 212, 0.1)' }}>
          <strong style={{ color: '#5eead4', fontSize: 13 }}>⏰ Daily Limits</strong>
          <div className="profile-info" style={{ fontSize: 12 }}>
            <div>👨 Male: <strong>{Math.max(0, dailyLimits.male || 5)}/5</strong></div>
            <div>👩 Female: <strong>{Math.max(0, dailyLimits.female || 5)}/5</strong></div>
            <div>🌈 Non-binary: <strong>{Math.max(0, dailyLimits['non-binary'] || 5)}/5</strong></div>
            <div>❓ Prefer Not: <strong>{Math.max(0, dailyLimits['prefer-not-to-say'] || 5)}/5</strong></div>
            <div style={{ marginTop: 6, color: '#9aa4b2', fontSize: 10 }}>Resets in ~{getResetTime()}h</div>
          </div>
        </div>
        {cooldownSeconds > 0 && (
          <div style={{ marginBottom: 12, padding: '8px', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.3)', borderRadius: 8, textAlign: 'center', color: '#ff6b6b', fontSize: 12 }}>
            ⏳ Wait {cooldownSeconds}s before joining
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <button className="btn" onClick={() => joinQueue('any')} disabled={state !== 'idle'} style={{ width: '100%' }}>🔄 Join Any</button>
          <button className="btn" onClick={() => joinQueue('male')} disabled={state !== 'idle'} style={{ marginTop: 8, width: '100%' }}>👨 Join Male</button>
          <button className="btn" onClick={() => joinQueue('female')} disabled={state !== 'idle'} style={{ marginTop: 8, width: '100%' }}>👩 Join Female</button>
          <button className="btn" onClick={() => joinQueue('non-binary')} disabled={state !== 'idle'} style={{ marginTop: 8, width: '100%' }}>🌈 Join Non-binary</button>
          <button className="btn" onClick={() => joinQueue('prefer-not-to-say')} disabled={state !== 'idle'} style={{ marginTop: 8, width: '100%' }}>❓ Prefer Not to Say</button>
        </div>
        {state !== 'idle' && (
          <div style={{ marginBottom: 12 }}>
            <button className="btn ghost" onClick={leave} style={{ width: '100%' }}>❌ Leave Queue</button>
          </div>
        )}
      </div>
      <div className="chat-area">
        <div className="chat-header">
          <div>Chat — {state.toUpperCase()}</div>
          {peer && <div style={{ fontSize: 12, color: '#9aa4b2' }}>Peer: {peer.slice(0, 8)}...</div>}
        </div>
        {state !== 'chatting' && (
          <div className="match-panel">
            <div className="match-head">Match Finder</div>
            <div className="filter-row">
              {['any', 'male', 'female', 'non-binary', 'prefer-not-to-say'].map((f) => (
                <button
                  key={f}
                  className={`filter-btn ${selectedFilter === f ? 'active' : ''}`}
                  onClick={() => setSelectedFilter(f)}
                >
                  {f === 'any' ? 'Any' : f}
                </button>
              ))}
            </div>
            <div className="match-actions">
              <button className="btn" onClick={() => joinQueue(selectedFilter)} disabled={state !== 'idle'}>
                🔍 Find Match
              </button>
              {state === 'queued' && (
                <div className="searching">
                  <div className="spinner" />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div>Searching...</div>
                    <div style={{ fontSize: 10, color: '#9aa4b2' }}>{queueWaitTime}s elapsed</div>
                  </div>
                </div>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Remaining: {remainingFor(selectedFilter)}/5
            </div>
          </div>
        )}
        <div className="messages">
          {state === 'idle' && (
            <div style={{ textAlign: 'center', color: '#9aa4b2', paddingTop: 20 }}>
              Join a queue to start chatting
            </div>
          )}
        {state === 'queued' && (
            <div style={{ textAlign: 'center', color: '#5eead4', paddingTop: 20 }}>
              <div style={{ marginBottom: 8 }}>⏳ Waiting for a match...</div>
              <div style={{ fontSize: 12, color: '#9aa4b2' }}>Elapsed: {queueWaitTime}s (timeout: 60s)</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.from === 'me' ? 'me' : 'them'}`}>
              <div className="msg-meta">
                <span className="msg-from">{m.from === 'me' ? profile.nickname : (peerProfile?.nickname || 'Stranger')}</span>
                <span className="msg-time">{m.time}</span>
              </div>
              <div className="msg-text">{m.text}</div>
            </div>
          ))}
          {isTyping && state === 'chatting' && (
            <div className="msg them" style={{ marginTop: 8 }}>
              <div className="msg-meta">
                <span className="msg-from">{peerProfile?.nickname || 'Peer'}</span>
              </div>
              <div className="msg-text" style={{ fontStyle: 'italic', color: '#9aa4b2' }}>✏️ typing...</div>
            </div>
          )}
        </div>
        {state === 'chatting' && (
          <div className="chat-controls">
            <input 
              ref={msgRef} 
              placeholder="Type a message..." 
              onKeyPress={(e) => e.key === 'Enter' && sendMsg()}
              onChange={handleInputChange}
            />
            <button className="btn" onClick={sendMsg}>Send</button>
            <button className="btn ghost" onClick={nextMatch}>Next</button>
            <button className="btn ghost" onClick={report} style={{ color: '#ff6b6b', borderColor: '#ff6b6b' }}>Report</button>
            <button className="btn ghost" onClick={leave}>Leave</button>
          </div>
        )}
        {state === 'idle' && (
          <div className="chat-controls" style={{ justifyContent: 'center', color: '#9aa4b2' }}>
            Ready to chat — choose a filter above
          </div>
        )}
      </div>
      
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#0b1220',
            border: '1px solid rgba(94, 234, 212, 0.3)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            textAlign: 'center'
          }}>
            <h3 style={{ marginTop: 0, color: '#fff' }}>
              {showConfirmModal === 'leave' ? '❓ Leave Chat?' : '⚠️ Report User?'}
            </h3>
            <p style={{ color: '#9aa4b2', margin: '8px 0 20px 0' }}>
              {showConfirmModal === 'leave'
                ? 'Are you sure you want to leave? You\'ll start looking for a new match.'
                : 'Report this user for inappropriate behavior? They cannot appeal.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn ghost" onClick={() => setShowConfirmModal(null)}>Cancel</button>
              <button 
                className="btn" 
                onClick={showConfirmModal === 'leave' ? confirmLeave : confirmReport}
                style={showConfirmModal === 'report' ? { background: '#ff6b6b', borderColor: '#ff6b6b' } : {}}
              >
                {showConfirmModal === 'leave' ? 'Yes, Leave' : 'Yes, Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
