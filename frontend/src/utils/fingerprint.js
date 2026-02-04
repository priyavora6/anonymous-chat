export function getOrCreateDeviceId(){
  let id = localStorage.getItem('device_id')
  if(!id){
    id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    localStorage.setItem('device_id', id)
  }
  return id
}
