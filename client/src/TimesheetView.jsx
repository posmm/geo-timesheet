import React, { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

const SITES_BOARD_ID = Number(import.meta.env.VITE_SITES_BOARD_ID) || 987654321;
const DIST_THRESHOLD = 150;
const TOKEN_VALUE = "securetoken123";

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function requireToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token || token !== TOKEN_VALUE) {
    alert("Unauthorized. Please log in.");
    window.location.href = "https://po5m.com/login";
    return false;
  }
  return true;
}

export default function TimesheetView() {
  const [state,setState] = useState({
    itemId:null, siteId:null, lat:null,lng:null, dayItemId:null
  });

  /* dual‑mode context */
  useEffect(()=>{
    monday.get("context").then(res=>{
      if (res.data && res.data.itemId) {
        setState(s=>({...s, dayItemId: res.data.itemId }));
      } else {
        const p = new URLSearchParams(window.location.search);
        const id = p.get("itemId");
        if (id) setState(s=>({...s, dayItemId:id}));
      }
    });
  },[]);

  /* login + mobile check (outside monday) */
  useEffect(()=>{
    monday.get("context").then(res=>{
      if (!res.data) { // outside monday
        if (!requireToken()) return;
        if (!isMobile()) alert("Best viewed on mobile.");
      }
    });
  },[]);

  /* GPS watch */
  useEffect(()=>{
    if (!state.dayItemId) return;
    const watch = navigator.geolocation.watchPosition(async pos=>{
      const { latitude, longitude } = pos.coords;
      const nearest = await getNearestSite(latitude, longitude);
      if (!nearest) return;

      if (!state.itemId) {
        const seg = await startSegment(nearest.id, state.dayItemId);
        setState({...state,...seg,lat:latitude,lng:longitude,siteId:nearest.id});
        return;
      }
      const moved = distance(latitude,longitude,state.lat,state.lng) > DIST_THRESHOLD;
      if (nearest.id!==state.siteId && moved){
        await stopSegment(state.itemId);
        const seg = await startSegment(nearest.id, state.dayItemId);
        setState({...state,...seg,lat:latitude,lng:longitude,siteId:nearest.id});
      } else {
        setState(s=>({...s,lat:latitude,lng:longitude}));
      }
    },err=>console.error(err),{enableHighAccuracy:true,maximumAge:30000});
    return ()=>navigator.geolocation.clearWatch(watch);
  },[state.dayItemId,state.itemId,state.siteId]);

  return (
    <button
      onClick={async ()=>{
        if (state.itemId){
          await stopSegment(state.itemId);
          await closeDay(state.itemId);
          setState(s=>({...s,itemId:null}));
        }
      }}
      style={{
        padding:"1rem 2rem",
        fontSize:"1.25rem",
        borderRadius:"1rem",
        border:"none",
        boxShadow:"0 4px 8px rgba(0,0,0,0.2)"
      }}
    >
      Stop timer for today
    </button>
  );
}

/* helpers */
async function getNearestSite(lat,lng){
  const query = `query ($b:Int!){ boards(ids:[$b]){ items{ id column_values(ids:["location"]){ ... on LocationValue{ lat lng }}}}}`;
  const { data } = await monday.api(query,{variables:{b:SITES_BOARD_ID}});
  const sites = data.boards[0].items
    .map(it=>({id:it.id, ...it.column_values[0]}))
    .filter(s=>s.lat!=null);
  sites.forEach(s=>s.d=distance(lat,lng,s.lat,s.lng));
  sites.sort((a,b)=>a.d-b.d);
  return sites[0];
}
function distance(lat1,lng1,lat2,lng2){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
async function startSegment(siteId,dayItemId){
  const r=await fetch("/api/start",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({siteId,dayItemId})}).then(r=>r.json());
  return r; // {itemId}
}
async function stopSegment(itemId){
  await fetch("/api/stop",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({itemId})});
}
async function closeDay(itemId){
  await fetch("/api/close-day",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({itemId})});
}