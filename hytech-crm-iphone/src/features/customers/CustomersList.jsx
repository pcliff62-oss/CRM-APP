import React, { useEffect, useState } from 'react';
import { getCustomers } from 'src/lib/apiClient';
export default function CustomersList({ onSelect }){
  const [state,setState]=useState({ phase:'loading', data:null, error:null });
  useEffect(()=>{ let cancelled=false; (async()=>{ try{ const data=await getCustomers(); if(!cancelled) setState({ phase:'done', data, error:null }); }catch(e){ if(!cancelled) setState({ phase:'error', data:null, error:e }); }})(); return ()=>{ cancelled=true; }; },[]);
  if(state.phase==='loading') return <div style={{padding:8}}>Loading…</div>;
  if(state.phase==='error') return <div style={{padding:8,color:'#b00'}}>Error: {String(state.error?.message||state.error)}</div>;
  if(!state.data || state.data.length===0) return <div style={{padding:8}}>No customers.</div>;
  function handleSelect(id){
    try {
      console.log('select customer', id);
      onSelect && onSelect(id);
    } catch(e){ console.error(e); }
  }
  return <ul style={{listStyle:'none',padding:8,margin:0}}>{state.data.map(c=> <li key={c.id||c.name} style={{background:'#fff',margin:'4px 0',padding:'6px 8px',border:'1px solid #ddd',borderRadius:4,cursor:'pointer'}} onClick={()=>handleSelect(c.id||c.name)}>{c.name||'(no name)'}</li>)}</ul>;
}
