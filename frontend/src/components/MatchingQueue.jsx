import React from 'react'

// Reference component for queue UI
// NOTE: Queue UI is integrated into Chat.jsx sidebar
export default function MatchingQueue() {
  return (
    <div className="sidebar">
      <h3>Queue Filters</h3>
      <div style={{ marginBottom: 12 }}>
        <button className="btn">Join Any</button>
        <button className="btn" style={{ marginTop: 6 }}>Join Male</button>
        <button className="btn" style={{ marginTop: 6 }}>Join Female</button>
      </div>
    </div>
  )
}
