export function createSocket(deviceId){
  const url = `ws://localhost:8000/ws?device_id=${deviceId}`
  const ws = new WebSocket(url)
  ws.addEventListener('open', ()=>console.log('ws open'))
  ws.addEventListener('close', ()=>console.log('ws closed'))
  ws.addEventListener('error', (e)=>console.error('ws error',e))
  return ws
}
