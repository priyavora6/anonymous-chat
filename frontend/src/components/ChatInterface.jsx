import React from 'react'

// Reference component for chat UI
// NOTE: Full implementation is in ../Chat.jsx
export default function ChatInterface() {
  return (
    <div className="chat-area">
      <div className="chat-header">Chat</div>
      <div className="messages">Messages will appear here</div>
      <div className="chat-controls">
        <input placeholder="Type a message" />
        <button className="btn">Send</button>
      </div>
    </div>
  )
}
