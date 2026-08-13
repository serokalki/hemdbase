import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================================
   VNH-HaemLIS — Haematology Laboratory Information System
   Vila Central Hospital, Port Vila — Laboratory Department

   One file. Everything the bench needs: register, order, collect, result,
   validate, report, notify, QC. Data persists between sessions.
   Reference intervals are defaults and must be verified locally (ISO 15189).
   ========================================================================== */

/* ---------------------------------------------------------------- palette */
const CSS = `
:root{
  --ink:#14111C; --slate:#4A4358; --mute:#8B849B;
  --paper:#F1EFF5; --card:#FFFFFF; --line:#DDD8E6;
  --giemsa:#5B2E90; --giemsa-2:#EDE4F7; --giemsa-3:#F7F2FC;
  --eosin:#D2325C; --eosin-2:#FDECF1;
  --methylene:#1E6FB0; --methylene-2:#E7F1FA;
  --field:#26795A; --field-2:#E6F3ED;
  --amber:#9A6A00; --amber-2:#FBF2DC;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
*{box-sizing:border-box}
.lis{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100vh;font-size:14px}
.lis button{font-family:inherit;font-size:13px;cursor:pointer;border-radius:3px;border:1px solid var(--line);
  background:var(--card);color:var(--ink);padding:7px 12px}
.lis button:hover{border-color:var(--giemsa)}
.lis button:focus-visible,.lis input:focus-visible,.lis select:focus-visible,.lis textarea:focus-visible{
  outline:2px solid var(--giemsa);outline-offset:1px}
.lis input,.lis select,.lis textarea{font-family:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);
  border-radius:3px;background:var(--card);color:var(--ink);width:100%}
.btn-p{background:var(--giemsa);color:#fff;border-color:var(--giemsa)}
.btn-p:hover{background:#4A2377}
.btn-d{background:var(--eosin);color:#fff;border-color:var(--eosin)}
.hdr{background:var(--ink);color:#EFEAF6;padding:10px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.hdr h1{font-family:var(--serif);font-size:17px;margin:0;letter-spacing:.2px;font-weight:600}
.hdr .sub{font-size:11px;color:#9E93B5;letter-spacing:.09em;text-transform:uppercase}
.nav{display:flex;gap:2px;background:var(--ink);padding:0 12px;flex-wrap:wrap}
.nav button{background:none;border:none;color:#A79CBC;padding:9px 13px;border-radius:0;
  border-bottom:2px solid transparent;font-size:13px}
.nav button.on{color:#fff;border-bottom-color:var(--eosin)}
.wrap{padding:16px;max-width:1240px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:14px;margin-bottom:14px}
.card h2{font-size:13px;margin:0 0 12px;letter-spacing:.09em;text-transform:uppercase;color:var(--slate);
  font-weight:600;border-bottom:1px solid var(--line);padding-bottom:7px}
.card h3{font-size:12px;margin:14px 0 8px;letter-spacing:.06em;text-transform:uppercase;color:var(--giemsa)}
.grid{display:grid;gap:10px}
.g2{grid-template-columns:repeat(2,1fr)} .g3{grid-template-columns:repeat(3,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
@media(max-width:820px){.g2,.g3,.g4{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.g2,.g3,.g4{grid-template-columns:1fr}}
label{display:block;font-size:11px;color:var(--mute);margin-bottom:3px;letter-spacing:.04em}
.req::after{content:" *";color:var(--eosin)}
.mono{font-family:var(--mono)}
.pill{display:inline-block;padding:2px 7px;border-radius:9px;font-size:10.5px;font-weight:600;
  letter-spacing:.05em;text-transform:uppercase}
.p-routine{background:var(--giemsa-3);color:var(--slate)}
.p-urgent{background:var(--amber-2);color:var(--amber)}
.p-stat{background:var(--eosin);color:#fff}
.s-ordered{background:var(--giemsa-3);color:var(--slate)}
.s-received{background:var(--methylene-2);color:var(--methylene)}
.s-entered{background:var(--amber-2);color:var(--amber)}
.s-validated{background:var(--field-2);color:var(--field)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--mute);
  font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--paper);vertical-align:top}
tr.click:hover{background:var(--giemsa-3);cursor:pointer}
.an{display:grid;grid-template-columns:118px 92px 46px 1fr;gap:8px;align-items:center;padding:4px 0}
@media(max-width:640px){.an{grid-template-columns:1fr 84px;grid-template-areas:"n v";row-gap:2px}
  .an .u,.an .rail{display:none}}
.an .nm{font-size:12.5px}.an .nm small{color:var(--mute);display:block;font-size:10px;font-family:var(--mono)}
.an .u{font-size:10.5px;color:var(--mute);font-family:var(--mono)}
.an input{text-align:right;font-family:var(--mono);font-weight:600}
.f-H input,.f-HH input{border-color:var(--eosin);background:var(--eosin-2);color:#98213F}
.f-L input,.f-LL input{border-color:var(--methylene);background:var(--methylene-2);color:#124C7B}
.f-HH input,.f-LL input{border-width:2px}
/* signature: the interval rail */
.rail{position:relative;height:22px}
.rail .track{position:absolute;top:10px;left:0;right:0;height:2px;background:var(--line)}
.rail .in{position:absolute;top:9px;height:4px;background:var(--field-2);border-left:1px solid var(--field);
  border-right:1px solid var(--field)}
.rail .mk{position:absolute;top:4px;width:2px;height:14px;background:var(--giemsa)}
.rail .prev{position:absolute;top:7px;width:1px;height:8px;background:var(--mute)}
.rail .lab{position:absolute;top:12px;font-size:9px;color:var(--mute);font-family:var(--mono)}
.crit{background:var(--eosin-2);border:1px solid var(--eosin);border-left:4px solid var(--eosin);
  border-radius:3px;padding:10px 12px;margin-bottom:10px}
.crit b{color:#98213F}
.note{background:var(--giemsa-3);border-left:3px solid var(--giemsa);padding:9px 11px;font-size:12px;
  color:var(--slate);border-radius:0 3px 3px 0;margin-bottom:12px}
.empty{text-align:center;padding:34px 16px;color:var(--mute);font-size:13px}
.empty b{display:block;color:var(--ink);font-size:14px;margin-bottom:4px}
.rowbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.spacer{flex:1}
.chip{border:1px solid var(--line);border-radius:3px;padding:8px 10px;font-size:12.5px;cursor:pointer;
  background:var(--card);text-align:left}
.chip.on{background:var(--giemsa-2);border-color:var(--giemsa);color:#3E1E66;font-weight:600}
.chip small{display:block;color:var(--mute);font-size:10px;font-weight:400;margin-top:2px}
.rpt{background:#fff;border:1px solid var(--line);padding:26px}
.rpt .lh{border-bottom:2px solid var(--ink);padding-bottom:9px;margin-bottom:14px}
.rpt .lh h2{font-family:var(--serif);font-size:19px;margin:0;border:none;text-transform:none;
  letter-spacing:0;color:var(--ink);padding:0}
.rpt .lh div{font-size:11px;color:var(--mute);letter-spacing:.05em}
.rpt table td{font-family:var(--mono);font-size:12px}
.rpt table td:first-child{font-family:var(--sans)}
.hi{color:var(--eosin);font-weight:700} .lo{color:var(--methylene);font-weight:700}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:12px;flex-wrap:wrap}
.tabs button{border:none;background:none;padding:8px 12px;border-bottom:2px solid transparent;
  color:var(--mute);border-radius:0}
.tabs button.on{color:var(--giemsa);border-bottom-color:var(--giemsa);font-weight:600}
@media print{.hdr,.nav,.noprint{display:none!important}.wrap{padding:0;max-width:none}
  .rpt{border:none;padding:0}.lis{background:#fff}}
`;

/* ------------------------------------------------------- test dictionary */
// ri: [{sex, lo, hi (age days), l, h}] — first match wins.
const A = (code, name, unit, dp, sec, ri, crit, calc, loinc) =>
  ({ code, name, unit, dp, sec, ri: ri || [], crit: crit || {}, calc, loinc });

const ALL = 43800;
const ANALYTES = [
  // ---- FBC core
  A("WBC","White cell count","x10^9/L",1,"FBC",[
    {lo:0,hi:1,l:9,h:30},{lo:2,hi:28,l:5,h:21},{lo:29,hi:730,l:6,h:17.5},
    {lo:731,hi:4380,l:5,h:15},{lo:4381,hi:ALL,l:4,h:11}],{cl:1,ch:50},null,"6690-2"),
  A("RBC","Red cell count","x10^12/L",2,"FBC",[
    {sex:"male",lo:4381,hi:ALL,l:4.5,h:6.5},{sex:"female",lo:4381,hi:ALL,l:3.8,h:5.8},
    {lo:0,hi:4380,l:3.6,h:5.5}],{},null,"789-8"),
  A("HGB","Haemoglobin","g/L",0,"FBC",[
    {lo:0,hi:1,l:145,h:225},{lo:2,hi:14,l:135,h:215},{lo:15,hi:60,l:100,h:180},
    {lo:61,hi:365,l:95,h:130},{lo:366,hi:2190,l:105,h:135},{lo:2191,hi:4380,l:115,h:145},
    {sex:"male",lo:4381,hi:ALL,l:130,h:180},{sex:"female",lo:4381,hi:ALL,l:115,h:165}],
    {cl:70,ch:200},null,"718-7"),
  A("HCT","Haematocrit","L/L",3,"FBC",[
    {sex:"male",lo:4381,hi:ALL,l:0.40,h:0.54},{sex:"female",lo:4381,hi:ALL,l:0.36,h:0.47},
    {lo:0,hi:4380,l:0.33,h:0.45}],{cl:0.20,ch:0.60},null,"4544-3"),
  A("MCV","Mean cell volume","fL",1,"FBC",[
    {lo:0,hi:365,l:85,h:110},{lo:366,hi:4380,l:73,h:90},{lo:4381,hi:ALL,l:80,h:100}],
    {},v=>v.HCT&&v.RBC?v.HCT/v.RBC*1000:null,"787-2"),
  A("MCH","Mean cell haemoglobin","pg",1,"FBC",[{lo:4381,hi:ALL,l:27,h:32},{lo:0,hi:4380,l:24,h:30}],
    {},v=>v.HGB&&v.RBC?v.HGB/v.RBC:null,"785-6"),
  A("MCHC","Mean cell Hb concentration","g/L",0,"FBC",[{lo:0,hi:ALL,l:320,h:360}],
    {},v=>v.HGB&&v.HCT?v.HGB/v.HCT:null,"786-4"),
  A("RDW_CV","RDW-CV","%",1,"FBC",[{lo:0,hi:ALL,l:11.5,h:14.5}],{},null,"788-0"),
  A("RDW_SD","RDW-SD","fL",1,"FBC",[{lo:0,hi:ALL,l:37,h:54}],{},null,"21000-5"),
  A("PLT","Platelet count","x10^9/L",0,"FBC",[{lo:0,hi:ALL,l:150,h:400}],{cl:20,ch:1000},null,"777-3"),
  A("MPV","Mean platelet volume","fL",1,"FBC",[{lo:0,hi:ALL,l:7.5,h:11.5}],{},null,"32623-1"),
  A("PDW","Platelet distribution width","fL",1,"FBC",[{lo:0,hi:ALL,l:9,h:17}],{},null,"32207-3"),
  A("PCT","Plateletcrit","%",2,"FBC",[{lo:0,hi:ALL,l:0.17,h:0.35}],{},null,null),
  // ---- differential
  A("NEUT_PCT","Neutrophils","%",1,"DIFF",[{lo:0,hi:ALL,l:40,h:75}],{},null,"770-8"),
  A("NEUT_ABS","Neutrophils absolute","x10^9/L",2,"DIFF",[
    {lo:366,hi:4380,l:1.5,h:8.5},{lo:4381,hi:ALL,l:2.0,h:7.5}],{cl:0.5},
    v=>v.WBC&&v.NEUT_PCT!=null?v.WBC*v.NEUT_PCT/100:null,"751-8"),
  A("BAND_PCT","Band forms","%",1,"DIFF",[{lo:0,hi:ALL,l:0,h:5}],{},null,"35332-6"),
  A("LYMPH_PCT","Lymphocytes","%",1,"DIFF",[{lo:0,hi:ALL,l:20,h:45}],{},null,"736-9"),
  A("LYMPH_ABS","Lymphocytes absolute","x10^9/L",2,"DIFF",[
    {lo:366,hi:4380,l:1.5,h:9.5},{lo:4381,hi:ALL,l:1.0,h:4.0}],{},
    v=>v.WBC&&v.LYMPH_PCT!=null?v.WBC*v.LYMPH_PCT/100:null,"731-0"),
  A("MONO_PCT","Monocytes","%",1,"DIFF",[{lo:0,hi:ALL,l:2,h:10}],{},null,"5905-5"),
  A("MONO_ABS","Monocytes absolute","x10^9/L",2,"DIFF",[{lo:0,hi:ALL,l:0.2,h:0.8}],{},
    v=>v.WBC&&v.MONO_PCT!=null?v.WBC*v.MONO_PCT/100:null,"742-7"),
  A("EOS_PCT","Eosinophils","%",1,"DIFF",[{lo:0,hi:ALL,l:0,h:6}],{},null,"713-8"),
  A("EOS_ABS","Eosinophils absolute","x10^9/L",2,"DIFF",[{lo:0,hi:ALL,l:0.04,h:0.4}],{},
    v=>v.WBC&&v.EOS_PCT!=null?v.WBC*v.EOS_PCT/100:null,"711-2"),
  A("BASO_PCT","Basophils","%",1,"DIFF",[{lo:0,hi:ALL,l:0,h:2}],{},null,"706-2"),
  A("BASO_ABS","Basophils absolute","x10^9/L",2,"DIFF",[{lo:0,hi:ALL,l:0.01,h:0.10}],{},
    v=>v.WBC&&v.BASO_PCT!=null?v.WBC*v.BASO_PCT/100:null,"704-7"),
  A("IG_PCT","Immature granulocytes","%",1,"DIFF",[{lo:0,hi:ALL,l:0,h:0.6}],{},null,"71695-1"),
  A("NRBC_PCT","Nucleated RBC","/100 WBC",1,"DIFF",[{lo:29,hi:ALL,l:0,h:0}],{},null,"19048-8"),
  A("BLAST_PCT","Blasts","%",1,"DIFF",[{lo:0,hi:ALL,l:0,h:0}],{ch:1},null,null),
  A("ATYP_PCT","Atypical lymphocytes","%",1,"DIFF",[{lo:0,hi:ALL,l:0,h:0}],{},null,null),
  // ---- reticulocytes / ESR
  A("RET_PCT","Reticulocytes","%",2,"RETIC",[{lo:4381,hi:ALL,l:0.5,h:2.5},{lo:0,hi:4380,l:0.5,h:3.0}],{},null,"17849-1"),
  A("RET_ABS","Reticulocytes absolute","x10^9/L",1,"RETIC",[{lo:0,hi:ALL,l:20,h:100}],{},
    v=>v.RBC&&v.RET_PCT!=null?v.RBC*v.RET_PCT*10:null,"60474-4"),
  A("IRF","Immature retic fraction","%",1,"RETIC",[{lo:0,hi:ALL,l:2,h:12}],{},null,null),
  A("RET_HE","Retic Hb equivalent","pg",1,"RETIC",[{lo:0,hi:ALL,l:28,h:36}],{},null,null),
  A("ESR","ESR (Westergren)","mm/h",0,"ESR",[
    {sex:"male",lo:4381,hi:ALL,l:0,h:15},{sex:"female",lo:4381,hi:ALL,l:0,h:20},
    {lo:0,hi:4380,l:0,h:10}],{},null,"30341-2"),
  // ---- coagulation
  A("PT","Prothrombin time","s",1,"COAG",[{lo:0,hi:ALL,l:11,h:14}],{},null,"5902-2"),
  A("INR","INR","",2,"COAG",[{lo:0,hi:ALL,l:0.8,h:1.2}],{ch:5.0},null,"6301-6"),
  A("APTT","APTT","s",1,"COAG",[{lo:0,hi:ALL,l:25,h:38}],{ch:100},null,"14979-9"),
  A("TT","Thrombin time","s",1,"COAG",[{lo:0,hi:ALL,l:14,h:19}],{},null,"3243-3"),
  A("FIB","Fibrinogen (Clauss)","g/L",1,"COAG",[{lo:0,hi:ALL,l:2.0,h:4.0}],{cl:1.0},null,"3255-7"),
  A("DDIMER","D-dimer","mg/L FEU",2,"COAG",[{lo:0,hi:ALL,l:0,h:0.5}],{},null,"48065-7"),
  // ---- body fluid
  A("BF_TNC","Total nucleated cells","x10^6/L",1,"FLUID",[{lo:0,hi:ALL,l:0,h:5}],{},null,null),
  A("BF_RBC","Red cells","x10^6/L",0,"FLUID",[{lo:0,hi:ALL,l:0,h:0}],{},null,null),
  A("BF_PMN","Polymorphs","%",0,"FLUID",[],{},null,null),
  A("BF_MN","Mononuclears","%",0,"FLUID",[],{},null,null),
];
const AN = Object.fromEntries(ANALYTES.map(a => [a.code, a]));

const PANELS = [
  {code:"FBC",    name:"Full blood count", sec:"HAEM", tube:"EDTA (lavender)", tat:240,
   groups:["FBC","DIFF"]},
  {code:"RETIC",  name:"Reticulocyte count", sec:"HAEM", tube:"EDTA (lavender)", tat:360, groups:["RETIC"]},
  {code:"ESR",    name:"ESR", sec:"HAEM", tube:"EDTA (lavender)", tat:240, groups:["ESR"]},
  {code:"FILM",   name:"Blood film examination", sec:"MORPH", tube:"EDTA (lavender)", tat:480, form:"film"},
  {code:"MPS",    name:"Malaria parasites (film + RDT)", sec:"MALARIA", tube:"EDTA (lavender)", tat:60, form:"malaria"},
  {code:"COAG",   name:"Coagulation screen", sec:"COAG", tube:"Citrate (light blue)", tat:240, groups:["COAG"]},
  {code:"GXM",    name:"Group, screen and crossmatch", sec:"BB", tube:"EDTA (lavender) x2", tat:180, form:"bb"},
  {code:"SPECIAL",name:"Sickle screen / G6PD", sec:"HAEM", tube:"EDTA (lavender)", tat:720, form:"special"},
  {code:"FLUID",  name:"CSF / body fluid cell count", sec:"HAEM", tube:"Sterile pot or EDTA", tat:60, groups:["FLUID"]},
];
const PN = Object.fromEntries(PANELS.map(p => [p.code, p]));

const WARDS = ["Medical","Surgical","Paediatric","Maternity","Emergency","Outpatients",
               "Theatre","TB / Chest clinic","Antenatal clinic","Outer island referral"];
const ISLANDS = ["Efate","Espiritu Santo","Malekula","Tanna","Ambae","Pentecost","Ambrym","Epi",
                 "Erromango","Aneityum","Gaua","Vanua Lava","Maewo","Paama","Emae","Tongoa","Other"];
const GRADES = ["","1+","2+","3+"];

// The cell classes counted at the microscope, in the order a scientist scans them.
// analyte = where the percentage lands on the report; null = reported from the
// tally itself because there is no separate analyte for it.
const DIFF_CELLS = [
  ["neut",     "Neutrophils",           "NEUT_PCT"],
  ["band",     "Band forms",            "BAND_PCT"],
  ["lymph",    "Lymphocytes",           "LYMPH_PCT"],
  ["atyp",     "Atypical lymphocytes",  "ATYP_PCT"],
  ["mono",     "Monocytes",             "MONO_PCT"],
  ["eos",      "Eosinophils",           "EOS_PCT"],
  ["baso",     "Basophils",             "BASO_PCT"],
  ["meta",     "Metamyelocytes",        "IG_PCT"],
  ["myelo",    "Myelocytes",            "IG_PCT"],
  ["promyelo", "Promyelocytes",         "IG_PCT"],
  ["blast",    "Blasts",                "BLAST_PCT"],
  ["prolymph", "Prolymphocytes",        null],
  ["plasma",   "Plasma cells",          null],
  ["other",    "Other",                 null],
];

/* ---------------------------------------------------------------- helpers */
const pad = (n,w=4) => String(n).padStart(w,"0");
const nowISO = () => new Date().toISOString();
const fmtDT = s => s ? new Date(s).toLocaleString("en-GB",{day:"2-digit",month:"short",
  year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
const fmtD = s => s ? new Date(s).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—";

function ageDaysOf(p, at){
  if(!p) return null;
  if(p.dob) return Math.floor((new Date(at||Date.now()) - new Date(p.dob))/864e5);
  if(p.ageYears != null) return Math.round(p.ageYears*365.25);
  return null;
}
function ageLabel(d){
  if(d==null) return "age unknown";
  if(d < 31) return `${d} d`;
  if(d < 730) return `${Math.floor(d/30.4)} mo`;
  return `${Math.floor(d/365.25)} y`;
}
function getRI(code, ageD, sex){
  const a = AN[code]; if(!a) return null;
  const d = ageD == null ? 12000 : ageD;
  for(const r of a.ri){
    if(r.sex && r.sex !== sex) continue;
    if(d >= r.lo && d <= r.hi) return r;
  }
  return a.ri.find(r => !r.sex && d>=r.lo && d<=r.hi) || null;
}
function flagOf(code, val, ageD, sex){
  if(val == null || val === "") return "N";
  const a = AN[code], v = Number(val), ri = getRI(code, ageD, sex);
  if(isNaN(v)) return "N";
  if(a.crit.cl != null && v <= a.crit.cl) return "LL";
  if(a.crit.ch != null && v >= a.crit.ch) return "HH";
  if(!ri) return "N";
  if(ri.l != null && v < ri.l) return "L";
  if(ri.h != null && v > ri.h) return "H";
  return "N";
}
const isCrit = f => f === "LL" || f === "HH";
const round = (v,dp) => v==null||v===""||isNaN(Number(v)) ? "" : Number(v).toFixed(dp);

function deriveAll(vals){
  const out = {...vals};
  for(let pass=0; pass<3; pass++){
    for(const a of ANALYTES){
      if(!a.calc) continue;
      const nums = {};
      for(const k in out){ const n = Number(out[k]); if(out[k]!=="" && !isNaN(n)) nums[k]=n; }
      const r = a.calc(nums);
      if(r != null && !isNaN(r)) out[a.code] = round(r, a.dp);
    }
  }
  return out;
}

/* ------------------------------------------------------------- persistence */
const KEY = "vchhaemlis:v1";
const blank = () => ({ patients:[], requests:[], seq:{req:0, pat:0}, qc:[], audit:[] });

/* =============================================================== component */
export default function App(){
  const [db, setDb] = useState(blank());
  const [ready, setReady] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [view, setView] = useState("bench");
  const [openReq, setOpenReq] = useState(null);
  const [toast, setToast] = useState("");
  const [me] = useState({name:"Bench user", initials:"BU"});

  useEffect(() => { (async () => {
    try{ const r = await window.storage.get(KEY);
      if(r && r.value) setDb({...blank(), ...JSON.parse(r.value)});
    }catch(e){ /* first run: nothing stored yet */ }
    setReady(true);
  })(); }, []);

  const save = async next => {
    setDb(next);
    try{ await window.storage.set(KEY, JSON.stringify(next)); setSaveErr(false); }
    catch(e){ setSaveErr(true); }
  };
  const log = (entry, action, detail) =>
    ({ at: nowISO(), who: me.initials, action, entry, detail });

  const say = m => { setToast(m); setTimeout(()=>setToast(""), 2600); };

  const patientOf = id => db.patients.find(p => p.id === id);
  const req = openReq ? db.requests.find(r => r.id === openReq) : null;

  if(!ready) return <div className="lis"><style>{CSS}</style><div className="empty">Loading the bench…</div></div>;

  const tabs = [["bench","Bench"],["patients","Patients"],["new","New request"],
                ["qc","Quality control"],["dict","Test dictionary"],["audit","Audit trail"]];

  return (
    <div className="lis">
      <style>{CSS}</style>
      <div className="hdr">
        <div>
          <h1>Vila Central Hospital — Haematology</h1>
          <div className="sub">Laboratory Information System · Port Vila</div>
        </div>
        <div className="spacer" />
        <div className="sub">{me.name} · {me.initials}</div>
      </div>
      <div className="nav">
        {tabs.map(([k,l]) =>
          <button key={k} className={view===k && !req ? "on":""}
            onClick={()=>{setOpenReq(null); setView(k);}}>{l}</button>)}
      </div>

      <div className="wrap">
        {saveErr && <div className="crit noprint">Results are held in this session only — saved storage is
          unavailable. Print or export before closing the tab.</div>}
        {toast && <div className="note noprint">{toast}</div>}

        {req ? <RequestDetail req={req} patient={patientOf(req.patientId)} db={db} save={save}
                 log={log} me={me} back={()=>setOpenReq(null)} say={say} />
         : view==="bench"    ? <Bench db={db} open={setOpenReq} />
         : view==="patients" ? <Patients db={db} save={save} log={log} open={setOpenReq} say={say} />
         : view==="new"      ? <NewRequest db={db} save={save} log={log} open={setOpenReq} say={say} />
         : view==="qc"       ? <QC db={db} save={save} log={log} say={say} />
         : view==="dict"     ? <Dictionary />
         : <Audit db={db} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bench */
function Bench({ db, open }){
  const [filter, setFilter] = useState("active");
  const rows = db.requests.filter(r =>
    filter==="all" ? true :
    filter==="active" ? r.status !== "validated" :
    r.status === filter);

  const criticals = db.requests.filter(r =>
    r.criticals && r.criticals.some(c => !c.notified));

  const order = {stat:0, urgent:1, routine:2};
  rows.sort((a,b) => (order[a.priority]-order[b.priority]) ||
    (new Date(b.requestedAt)-new Date(a.requestedAt)));

  return (
    <>
      {criticals.length > 0 &&
        <div className="crit">
          <b>{criticals.length} critical result{criticals.length>1?"s":""} awaiting telephone notification.</b>
          <div style={{marginTop:6,fontSize:12.5}}>
            {criticals.map(r => <div key={r.id}>
              {r.accession} — {r.patientName} — {r.criticals.filter(c=>!c.notified)
                .map(c => `${AN[c.code].name} ${c.value} ${AN[c.code].unit}`).join(", ")}
              {" "}<button style={{padding:"2px 8px",marginLeft:6}}
                onClick={()=>open(r.id)}>Open</button>
            </div>)}
          </div>
        </div>}

      <div className="card">
        <h2>Worklist</h2>
        <div className="rowbar noprint">
          {[["active","Active"],["ordered","Awaiting sample"],["received","On the bench"],
            ["entered","Awaiting validation"],["validated","Released"],["all","Everything"]]
            .map(([k,l]) =>
              <button key={k} className={filter===k?"btn-p":""} onClick={()=>setFilter(k)}>{l}</button>)}
        </div>
        {rows.length===0 ? <div className="empty"><b>Nothing here yet</b>
            Register a patient, then raise a request to start a worklist.</div> :
        <table>
          <thead><tr><th>Accession</th><th>Patient</th><th>Ward</th><th>Tests</th>
            <th>Priority</th><th>Status</th><th>Requested</th></tr></thead>
          <tbody>
            {rows.map(r => <tr key={r.id} className="click" onClick={()=>open(r.id)}>
              <td className="mono">{r.accession}</td>
              <td>{r.patientName}<br/><small style={{color:"var(--mute)"}}>{r.hospitalNo}</small></td>
              <td>{r.ward}</td>
              <td>{r.panels.map(p=>PN[p].code).join(", ")}</td>
              <td><span className={"pill p-"+r.priority}>{r.priority}</span></td>
              <td><span className={"pill s-"+r.status}>{r.status}</span></td>
              <td className="mono" style={{fontSize:11}}>{fmtDT(r.requestedAt)}</td>
            </tr>)}
          </tbody>
        </table>}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- patients */
function Patients({ db, save, log, open, say }){
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const f = form || {};
  const set = (k,v) => setForm({...f, [k]:v});

  const submit = () => {
    if(!f.family || !f.given) return say("Family name and given names are both required.");
    if(!f.dob && !f.ageYears) return say("Enter a date of birth, or an estimated age if the date is unknown.");
    const seq = db.seq.pat + 1;
    const p = { id:"P"+seq, hospitalNo:`VCH${pad(seq,6)}`, family:f.family.trim(),
      given:f.given.trim(), sex:f.sex||"unknown", dob:f.dob||null,
      ageYears:f.ageYears?Number(f.ageYears):null, dobEstimated:!f.dob,
      village:f.village||"", island:f.island||"", phone:f.phone||"",
      language:f.language||"Bislama", flags:f.flags||[], createdAt:nowISO() };
    save({...db, patients:[p, ...db.patients], seq:{...db.seq, pat:seq},
      audit:[log(p.hospitalNo,"Registered patient", p.family+", "+p.given), ...db.audit]});
    setForm(null);
    say(`Registered ${p.family}, ${p.given} as ${p.hospitalNo}.`);
  };

  const list = db.patients.filter(p => {
    const s = (p.family+" "+p.given+" "+p.hospitalNo+" "+p.village).toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="card">
        <h2>Patient register</h2>
        <div className="rowbar">
          <div style={{flex:1, minWidth:200}}>
            <input placeholder="Search by name, hospital number or village"
              value={q} onChange={e=>setQ(e.target.value)} />
          </div>
          <button className="btn-p" onClick={()=>setForm(form?null:{})}>
            {form ? "Cancel" : "Register a patient"}</button>
        </div>

        {form && <div style={{borderTop:"1px solid var(--line)", paddingTop:12, marginTop:4}}>
          <div className="grid g3">
            <div><label className="req">Family name</label>
              <input value={f.family||""} onChange={e=>set("family",e.target.value)} /></div>
            <div><label className="req">Given names</label>
              <input value={f.given||""} onChange={e=>set("given",e.target.value)} /></div>
            <div><label>Sex</label>
              <select value={f.sex||"unknown"} onChange={e=>set("sex",e.target.value)}>
                <option value="unknown">Unknown</option><option value="male">Male</option>
                <option value="female">Female</option><option value="intersex">Intersex</option>
              </select></div>
            <div><label>Date of birth</label>
              <input type="date" value={f.dob||""} onChange={e=>set("dob",e.target.value)} /></div>
            <div><label>Estimated age in years</label>
              <input type="number" placeholder="use when the date of birth is unknown"
                value={f.ageYears||""} onChange={e=>set("ageYears",e.target.value)} /></div>
            <div><label>Island</label>
              <select value={f.island||""} onChange={e=>set("island",e.target.value)}>
                <option value="">—</option>{ISLANDS.map(i=><option key={i}>{i}</option>)}
              </select></div>
            <div><label>Village or area</label>
              <input value={f.village||""} onChange={e=>set("village",e.target.value)} /></div>
            <div><label>Contact phone</label>
              <input value={f.phone||""} onChange={e=>set("phone",e.target.value)} /></div>
            <div><label>Preferred language</label>
              <select value={f.language||"Bislama"} onChange={e=>set("language",e.target.value)}>
                <option>Bislama</option><option>English</option><option>French</option>
                <option>Vernacular</option></select></div>
          </div>
          <div style={{marginTop:12}}>
            <label>Standing clinical flags — these show on every future request</label>
            <div className="grid g4" style={{marginTop:4}}>
              {["G6PD deficient","Alpha thalassaemia trait","Known red cell antibody","On warfarin",
                "Splenectomy","On chemotherapy","Pregnant","Sickle trait"].map(fl =>
                <button key={fl} className={"chip "+((f.flags||[]).includes(fl)?"on":"")}
                  onClick={()=>set("flags",(f.flags||[]).includes(fl)
                    ? f.flags.filter(x=>x!==fl) : [...(f.flags||[]), fl])}>{fl}</button>)}
            </div>
          </div>
          <div className="rowbar" style={{marginTop:14}}>
            <button className="btn-p" onClick={submit}>Save patient</button>
          </div>
        </div>}
      </div>

      <div className="card">
        <h2>{list.length} patient{list.length===1?"":"s"}</h2>
        {list.length===0 ? <div className="empty"><b>No matching patients</b>
          Register the patient first, then raise the request.</div> :
        <table>
          <thead><tr><th>Hospital no.</th><th>Name</th><th>Sex</th><th>Age</th>
            <th>From</th><th>Flags</th><th>Requests</th></tr></thead>
          <tbody>{list.map(p => {
            const n = db.requests.filter(r=>r.patientId===p.id).length;
            return <tr key={p.id}>
              <td className="mono">{p.hospitalNo}</td>
              <td>{p.family}, {p.given}</td>
              <td>{p.sex}</td>
              <td>{ageLabel(ageDaysOf(p))}{p.dobEstimated && <small style={{color:"var(--mute)"}}> est.</small>}</td>
              <td>{[p.village,p.island].filter(Boolean).join(", ") || "—"}</td>
              <td style={{fontSize:11.5,color:"var(--eosin)"}}>{(p.flags||[]).join(" · ") || "—"}</td>
              <td>{n}</td>
            </tr>;})}
          </tbody>
        </table>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ new request */
function NewRequest({ db, save, log, open, say }){
  const [f, setF] = useState({priority:"routine", panels:["FBC"]});
  const set = (k,v) => setF({...f, [k]:v});
  const patient = db.patients.find(p => p.id === f.patientId);

  const toggle = c => set("panels", f.panels.includes(c)
    ? f.panels.filter(x=>x!==c) : [...f.panels, c]);

  const submit = () => {
    if(!f.patientId) return say("Choose a patient first.");
    if(f.panels.length===0) return say("Select at least one test.");
    const seq = db.seq.req + 1;
    const yr = String(new Date().getFullYear()).slice(2);
    const r = { id:"R"+seq, accession:`H${yr}-${pad(seq,5)}`, patientId:patient.id,
      patientName:`${patient.family}, ${patient.given}`, hospitalNo:patient.hospitalNo,
      ward:f.ward||"Outpatients", clinician:f.clinician||"", priority:f.priority,
      clinical:f.clinical||"", medication:f.medication||"", pregnant:!!f.pregnant,
      transfused72:!!f.transfused72, panels:f.panels, status:"ordered",
      requestedAt:nowISO(), collectedAt:null, receivedAt:null,
      values:{}, film:{}, malaria:{}, bb:{}, special:{}, comments:"",
      criticals:[], validatedAt:null, validatedBy:null, amendments:[] };
    save({...db, requests:[r, ...db.requests], seq:{...db.seq, req:seq},
      audit:[log(r.accession,"Raised request", f.panels.join(", ")), ...db.audit]});
    say(`Request ${r.accession} raised.`);
    open(r.id);
  };

  return (
    <div className="card">
      <h2>New request</h2>
      {db.patients.length===0 ?
        <div className="empty"><b>No patients on file</b>
          Register a patient in the Patients tab before raising a request.</div> :
      <>
      <div className="grid g3">
        <div><label className="req">Patient</label>
          <select value={f.patientId||""} onChange={e=>set("patientId",e.target.value)}>
            <option value="">Choose a patient</option>
            {db.patients.map(p => <option key={p.id} value={p.id}>
              {p.hospitalNo} — {p.family}, {p.given} ({ageLabel(ageDaysOf(p))}, {p.sex})</option>)}
          </select></div>
        <div><label>Ward or clinic</label>
          <select value={f.ward||""} onChange={e=>set("ward",e.target.value)}>
            <option value="">Outpatients</option>{WARDS.map(w=><option key={w}>{w}</option>)}
          </select></div>
        <div><label>Requesting clinician</label>
          <input value={f.clinician||""} onChange={e=>set("clinician",e.target.value)} /></div>
      </div>

      {patient && (patient.flags||[]).length>0 &&
        <div className="crit" style={{marginTop:12}}>
          <b>Standing flags for this patient:</b> {patient.flags.join(" · ")}
        </div>}

      <h3>Tests</h3>
      <div className="grid g3">
        {PANELS.map(p =>
          <button key={p.code} className={"chip "+(f.panels.includes(p.code)?"on":"")}
            onClick={()=>toggle(p.code)}>
            {p.name}<small>{p.tube} · target {p.tat} min</small>
          </button>)}
      </div>

      <h3>Clinical context</h3>
      <div className="grid g3">
        <div><label>Priority</label>
          <select value={f.priority} onChange={e=>set("priority",e.target.value)}>
            <option value="routine">Routine</option><option value="urgent">Urgent</option>
            <option value="stat">Stat</option></select></div>
        <div><label>Current medication</label>
          <input placeholder="warfarin, chemotherapy, antimalarials…"
            value={f.medication||""} onChange={e=>set("medication",e.target.value)} /></div>
        <div style={{display:"flex",gap:14,alignItems:"end",paddingBottom:4}}>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:12.5,color:"var(--ink)"}}>
            <input type="checkbox" style={{width:"auto"}} checked={!!f.pregnant}
              onChange={e=>set("pregnant",e.target.checked)} /> Pregnant</label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:12.5,color:"var(--ink)"}}>
            <input type="checkbox" style={{width:"auto"}} checked={!!f.transfused72}
              onChange={e=>set("transfused72",e.target.checked)} /> Transfused in 72 h</label>
        </div>
      </div>
      <div style={{marginTop:10}}>
        <label>Clinical details — what the film reader and the validator will read</label>
        <textarea rows={2} value={f.clinical||""} onChange={e=>set("clinical",e.target.value)}
          placeholder="Fever 3 days, returned from Malekula. Pallor. Query malaria." />
      </div>
      <div className="rowbar" style={{marginTop:14}}>
        <button className="btn-p" onClick={submit}>Raise request</button>
      </div>
      </>}
    </div>
  );
}

/* ------------------------------------------------------- request detail */
function RequestDetail({ req, patient, db, save, log, me, back, say }){
  const [tab, setTab] = useState(req.status==="validated" ? "report" : "results");
  const ageD = ageDaysOf(patient, req.collectedAt || req.requestedAt);
  const sex = patient ? patient.sex : "unknown";

  const [vals, setVals] = useState(req.values || {});
  const [film, setFilm] = useState(req.film || {});
  const [mal, setMal]   = useState(req.malaria || {});
  const [bb, setBb]     = useState(req.bb || {});
  const [sp, setSp]     = useState(req.special || {});
  const [comments, setComments] = useState(req.comments || "");

  useEffect(() => {
    setVals(req.values||{}); setFilm(req.film||{}); setMal(req.malaria||{});
    setBb(req.bb||{}); setSp(req.special||{}); setComments(req.comments||"");
  }, [req.id]);

  // previous validated result for this patient, for the delta check
  const prev = useMemo(() => {
    const earlier = db.requests
      .filter(r => r.patientId === req.patientId && r.id !== req.id && r.status === "validated")
      .sort((a,b) => new Date(b.validatedAt) - new Date(a.validatedAt))[0];
    return earlier ? {values: earlier.values, at: earlier.validatedAt, acc: earlier.accession} : null;
  }, [db.requests, req.id]);

  const derived = useMemo(() => deriveAll(vals), [vals]);
  const setVal = (code, v) => setVals({...vals, [code]: v});

  const groups = useMemo(() => {
    const g = [];
    req.panels.forEach(pc => (PN[pc].groups||[]).forEach(x => g.includes(x)||g.push(x)));
    return g;
  }, [req.panels]);
  const forms = req.panels.map(pc => PN[pc].form).filter(Boolean);

  const criticals = useMemo(() => {
    const out = [];
    Object.keys(derived).forEach(code => {
      if(!AN[code] || derived[code]==="") return;
      const fl = flagOf(code, derived[code], ageD, sex);
      if(isCrit(fl)) out.push({code, value: derived[code], flag: fl});
    });
    if(mal.species && mal.species!=="NONE" && mal.species!=="")
      out.push({code:"MAL", value:mal.species, flag:"HH", text:"Malaria parasites seen"});
    if(film.blasts) out.push({code:"FILM", value:"Blast cells", flag:"HH", text:"Blast cells on film"});
    return out;
  }, [derived, mal, film, ageD, sex]);

  const patch = (extra, action, detail) => {
    const next = db.requests.map(r => r.id===req.id
      ? {...r, values:derived, film, malaria:mal, bb, special:sp, comments, ...extra} : r);
    save({...db, requests: next, audit:[log(req.accession, action, detail), ...db.audit]});
  };

  const collect = () => patch({status:"received", collectedAt:nowISO(), receivedAt:nowISO()},
    "Sample collected and received", "");
  const saveResults = () => { patch({status:"entered",
    criticals: criticals.map(c=>({...c, notified:false}))}, "Results entered", "");
    say("Results saved and held for validation."); };
  const validate = () => {
    const unNotified = criticals.length > 0 &&
      (req.criticals||[]).filter(c=>c.notified).length < criticals.length;
    patch({status:"validated", validatedAt:nowISO(), validatedBy:me.initials,
      criticals: criticals.map(c => {
        const old = (req.criticals||[]).find(x=>x.code===c.code);
        return {...c, notified: old ? old.notified : false};
      })}, "Results validated and released", me.initials);
    setTab("report");
    say(unNotified ? "Released. Critical results still need a telephone call."
                   : "Released to the ward.");
  };
  const markNotified = (code, who) => {
    const next = db.requests.map(r => r.id===req.id ? {...r,
      criticals: (r.criticals||[]).map(c => c.code===code
        ? {...c, notified:true, notifiedTo:who, notifiedAt:nowISO(), by:me.initials} : c)} : r);
    save({...db, requests:next,
      audit:[log(req.accession,"Critical result telephoned", `${code} to ${who}`), ...db.audit]});
  };

  const st = req.status;

  return (
    <>
      <div className="rowbar noprint">
        <button onClick={back}>← Worklist</button>
        <div className="spacer" />
        {st==="ordered" && <button className="btn-p" onClick={collect}>Record collection and receipt</button>}
        {(st==="received"||st==="entered") &&
          <button onClick={saveResults}>Save results</button>}
        {st==="entered" && <button className="btn-p" onClick={validate}>Validate and release</button>}
        {st==="validated" && <button onClick={()=>window.print()}>Print report</button>}
      </div>

      <div className="card">
        <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"baseline"}}>
          <div>
            <div className="mono" style={{fontSize:16,fontWeight:700,color:"var(--giemsa)"}}>{req.accession}</div>
            <div style={{fontSize:15,fontWeight:600,marginTop:2}}>{req.patientName}</div>
            <div style={{fontSize:12,color:"var(--mute)"}} className="mono">
              {req.hospitalNo} · {sex} · {ageLabel(ageD)}
              {patient && patient.dobEstimated && " (estimated)"}
              {patient && patient.island ? ` · ${patient.island}` : ""}</div>
          </div>
          <div className="spacer" />
          <div style={{textAlign:"right",fontSize:12}}>
            <span className={"pill p-"+req.priority}>{req.priority}</span>{" "}
            <span className={"pill s-"+req.status}>{req.status}</span>
            <div style={{color:"var(--mute)",marginTop:5}} className="mono">
              Requested {fmtDT(req.requestedAt)}<br/>
              {req.collectedAt && `Collected ${fmtDT(req.collectedAt)}`}</div>
          </div>
        </div>
        <div style={{marginTop:10,display:"flex",gap:16,flexWrap:"wrap",fontSize:12.5}}>
          <div><span style={{color:"var(--mute)"}}>Ward </span>{req.ward}</div>
          <div><span style={{color:"var(--mute)"}}>Clinician </span>{req.clinician||"—"}</div>
          <div><span style={{color:"var(--mute)"}}>Tests </span>{req.panels.map(p=>PN[p].name).join(" · ")}</div>
        </div>
        {req.clinical && <div className="note" style={{marginTop:10,marginBottom:0}}>
          <b>Clinical details.</b> {req.clinical}
          {req.medication && <> <b>Medication.</b> {req.medication}</>}
          {req.pregnant && <> <b>Pregnant.</b></>}
          {req.transfused72 && <> <b>Transfused within 72 hours.</b></>}</div>}
        {patient && (patient.flags||[]).length>0 &&
          <div className="crit" style={{marginTop:10,marginBottom:0}}>
            <b>Standing flags:</b> {patient.flags.join(" · ")}</div>}
      </div>

      {st==="ordered" &&
        <div className="card"><div className="empty"><b>Waiting for the sample</b>
          Record collection and receipt above to open result entry.</div></div>}

      {st!=="ordered" && <>
        <div className="tabs noprint">
          <button className={tab==="results"?"on":""} onClick={()=>setTab("results")}>Result entry</button>
          <button className={tab==="report"?"on":""} onClick={()=>setTab("report")}>Report</button>
        </div>

        {tab==="results" ? (
          <>
            {criticals.length>0 &&
              <div className="crit">
                <b>Critical results in this request.</b> These must be telephoned to the requesting
                clinician and the read-back confirmed.
                <div style={{marginTop:8}}>
                  {criticals.map(c => {
                    const rec = (req.criticals||[]).find(x=>x.code===c.code);
                    return <div key={c.code} style={{display:"flex",gap:8,alignItems:"center",
                      flexWrap:"wrap",padding:"4px 0"}}>
                      <span className="mono" style={{minWidth:200}}>
                        {c.text || `${AN[c.code].name} ${c.value} ${AN[c.code].unit}`}</span>
                      {rec && rec.notified
                        ? <span style={{fontSize:12,color:"var(--field)"}}>
                            Telephoned to {rec.notifiedTo} at {fmtDT(rec.notifiedAt)}</span>
                        : <NotifyBox onDone={who=>markNotified(c.code, who)} />}
                    </div>;})}
                </div>
              </div>}

            {prev && <div className="note">Previous released result {prev.acc},
              {" "}{fmtDT(prev.at)} — shown as a grey tick on each scale for the delta check.</div>}

            {groups.includes("FBC") &&
              <Sheet title="Full blood count" codes={ANALYTES.filter(a=>a.sec==="FBC").map(a=>a.code)}
                {...{vals, derived, setVal, ageD, sex, prev}} />}
            {groups.includes("DIFF") &&
              <Sheet title="Differential count" codes={ANALYTES.filter(a=>a.sec==="DIFF").map(a=>a.code)}
                {...{vals, derived, setVal, ageD, sex, prev}}
                foot={<DiffCheck derived={derived} />} />}
            {groups.includes("RETIC") &&
              <Sheet title="Reticulocytes" codes={ANALYTES.filter(a=>a.sec==="RETIC").map(a=>a.code)}
                {...{vals, derived, setVal, ageD, sex, prev}} />}
            {groups.includes("ESR") &&
              <Sheet title="ESR" codes={["ESR"]} {...{vals, derived, setVal, ageD, sex, prev}} />}
            {groups.includes("COAG") &&
              <Sheet title="Coagulation" codes={ANALYTES.filter(a=>a.sec==="COAG").map(a=>a.code)}
                {...{vals, derived, setVal, ageD, sex, prev}} />}
            {groups.includes("FLUID") &&
              <Sheet title="Body fluid cell count" codes={ANALYTES.filter(a=>a.sec==="FLUID").map(a=>a.code)}
                {...{vals, derived, setVal, ageD, sex, prev}} />}

            {forms.includes("malaria") && <MalariaForm m={mal} setM={setMal} wbc={derived.WBC} />}
            {forms.includes("film") && <FilmForm f={film} setF={setFilm} wbc={derived.WBC}
              applyDiff={pcts => setVals(v => ({...v, ...pcts}))} />}
            {forms.includes("bb") && <BloodBankForm b={bb} setB={setBb} />}
            {forms.includes("special") && <SpecialForm s={sp} setS={setSp} />}

            <div className="card">
              <h2>Report comment</h2>
              <textarea rows={3} value={comments} onChange={e=>setComments(e.target.value)}
                placeholder="Free text, or pick a standard comment below." />
              <div className="grid g2" style={{marginTop:8}}>
                {["Microcytic hypochromic picture. Iron deficiency and alpha thalassaemia trait are both common locally; iron studies are suggested.",
                  "Platelet clumps present on the film. The instrument count is falsely low; a repeat sample is suggested.",
                  "Malaria parasites seen. Result telephoned and forwarded to the malaria programme.",
                  "Significant neutropenia. Please assess for infection; result telephoned.",
                  "Eosinophilia. Consider intestinal helminths, strongyloides or scabies.",
                  "Sample analysed outside the stability window; MCV and platelet count should be read with caution."]
                  .map((c,i) => <button key={i} className="chip"
                    onClick={()=>setComments(comments ? comments+" "+c : c)}>{c}</button>)}
              </div>
            </div>
          </>
        ) : (
          <Report req={{...req, values:derived, film, malaria:mal, bb, special:sp, comments}}
            patient={patient} ageD={ageD} sex={sex} prev={prev} />
        )}
      </>}
    </>
  );
}

function NotifyBox({ onDone }){
  const [who, setWho] = useState("");
  return <span style={{display:"flex",gap:6,alignItems:"center"}}>
    <input placeholder="Name of the clinician told" value={who}
      onChange={e=>setWho(e.target.value)} style={{width:210}} />
    <button className="btn-d" disabled={!who.trim()}
      onClick={()=>onDone(who.trim())}>Read-back confirmed</button>
  </span>;
}

/* --------------------------------------------- numeric sheet + the rail */
function Sheet({ title, codes, vals, derived, setVal, ageD, sex, prev, foot }){
  return (
    <div className="card">
      <h2>{title}</h2>
      {codes.map(code => {
        const a = AN[code], ri = getRI(code, ageD, sex);
        const shown = a.calc ? (derived[code] ?? "") : (vals[code] ?? "");
        const fl = flagOf(code, shown, ageD, sex);
        const p = prev && prev.values ? prev.values[code] : null;
        return (
          <div className={"an f-"+fl} key={code}>
            <div className="nm">{a.name}<small>{code}{a.loinc?" · "+a.loinc:""}</small></div>
            <input value={shown} readOnly={!!a.calc} inputMode="decimal"
              onChange={e=>setVal(code, e.target.value)}
              title={a.calc ? "Calculated from the measured values" : ""}
              style={a.calc ? {background:"var(--giemsa-3)", color:"var(--giemsa)"} : undefined} />
            <div className="u">{a.unit}</div>
            <Rail value={shown} ri={ri} prev={p} flag={fl} dp={a.dp} />
          </div>
        );
      })}
      {foot}
    </div>
  );
}

// The interval rail: the signature of this interface. One glance tells you
// where the value sits, how far out it is, and where it was last time.
function Rail({ value, ri, prev, flag, dp }){
  if(!ri || ri.l==null || ri.h==null)
    return <div className="rail"><div className="track" /></div>;
  const span = ri.h - ri.l || 1;
  const min = ri.l - span*1.1, max = ri.h + span*1.1;
  const pos = v => Math.max(1, Math.min(99, ((Number(v)-min)/(max-min))*100));
  const v = Number(value);
  const ok = value!=="" && !isNaN(v);
  const inL = pos(ri.l), inR = pos(ri.h);
  return (
    <div className="rail" title={`Reference interval ${ri.l}–${ri.h}`}>
      <div className="track" />
      <div className="in" style={{left:inL+"%", width:(inR-inL)+"%"}} />
      {prev!=null && prev!=="" && !isNaN(Number(prev)) &&
        <div className="prev" style={{left:pos(prev)+"%"}} title={"Previous "+prev} />}
      {ok && <div className="mk" style={{left:pos(v)+"%",
        background: flag==="N" ? "var(--field)" : isCrit(flag) ? "var(--eosin)"
          : flag[0]==="H" ? "var(--eosin)" : "var(--methylene)",
        width: isCrit(flag) ? 3 : 2}} />}
      <div className="lab" style={{left:0}}>{ri.l}</div>
      <div className="lab" style={{right:0}}>{ri.h}</div>
    </div>
  );
}

function DiffCheck({ derived }){
  const keys = ["NEUT_PCT","BAND_PCT","LYMPH_PCT","MONO_PCT","EOS_PCT","BASO_PCT",
                "IG_PCT","BLAST_PCT","ATYP_PCT"];
  const sum = keys.reduce((s,k) => s + (Number(derived[k])||0), 0);
  if(sum === 0) return null;
  const ok = Math.abs(sum-100) <= 1;
  return <div style={{marginTop:8,fontSize:12.5,fontFamily:"var(--mono)",
    color: ok ? "var(--field)" : "var(--eosin)"}}>
    Differential total {sum.toFixed(1)}% — {ok ? "accepted" : "must add up to 100% before release"}
  </div>;
}

/* ----------------------------------------------------------- malaria form */
function MalariaForm({ m, setM, wbc }){
  const set = (k,v) => setM({...m, [k]:v});
  const wbcUsed = m.wbcOverride ? Number(m.wbcOverride) : (Number(wbc) || 8.0);
  const density = (m.parasites && m.wbcCounted)
    ? (Number(m.parasites) / Number(m.wbcCounted)) * wbcUsed * 1000 : null;
  useEffect(() => {
    if(density != null && !isNaN(density)) {
      const d = Math.round(density);
      if(String(d) !== m.density) setM(prev => ({...prev, density:String(d)}));
    }
  }, [density]);

  const hyper = density != null && density >= 100000;
  return (
    <div className="card">
      <h2>Malaria examination</h2>
      <div className="note">Count asexual parasites against 200 white cells on the thick film;
        continue to 500 white cells if fewer than 100 parasites are seen. Gametocytes are not counted
        but their presence is always reported. Examine 100 fields before reporting a negative.</div>
      <div className="grid g4">
        <div><label>Thick film</label>
          <select value={m.thick||""} onChange={e=>set("thick",e.target.value)}>
            <option value="">—</option><option>Negative</option><option>Positive</option>
            <option>Not done</option></select></div>
        <div><label>Thin film</label>
          <select value={m.thin||""} onChange={e=>set("thin",e.target.value)}>
            <option value="">—</option><option>Negative</option><option>Positive</option>
            <option>Not done</option></select></div>
        <div><label>Rapid test</label>
          <select value={m.rdt||""} onChange={e=>set("rdt",e.target.value)}>
            <option value="">Not done</option><option>Negative</option>
            <option>Positive — Pf line</option><option>Positive — pan line</option>
            <option>Positive — both lines</option><option>Invalid</option></select></div>
        <div><label>Species</label>
          <select value={m.species||""} onChange={e=>set("species",e.target.value)}>
            <option value="">—</option>
            <option value="NONE">No parasites seen</option>
            <option value="PF">P. falciparum</option><option value="PV">P. vivax</option>
            <option value="PM">P. malariae</option><option value="PO">P. ovale</option>
            <option value="MIX">Mixed infection</option>
            <option value="UNK">Seen, species undetermined</option></select></div>
      </div>
      <h3>Quantification</h3>
      <div className="grid g4">
        <div><label>Asexual parasites counted</label>
          <input inputMode="numeric" value={m.parasites||""} onChange={e=>set("parasites",e.target.value)} /></div>
        <div><label>White cells counted</label>
          <input inputMode="numeric" placeholder="200 or 500" value={m.wbcCounted||""}
            onChange={e=>set("wbcCounted",e.target.value)} /></div>
        <div><label>WBC used (x10^9/L)</label>
          <input inputMode="decimal" placeholder={String(Number(wbc)||8.0)}
            value={m.wbcOverride||""} onChange={e=>set("wbcOverride",e.target.value)} /></div>
        <div><label>Parasite density (/µL)</label>
          <input readOnly value={density!=null && !isNaN(density) ? Math.round(density).toLocaleString() : ""}
            style={{background: hyper ? "var(--eosin-2)":"var(--giemsa-3)",
              color: hyper ? "#98213F":"var(--giemsa)", fontWeight:700}} /></div>
      </div>
      {hyper && <div className="crit" style={{marginTop:10}}>
        <b>Hyperparasitaemia.</b> Density at or above 100 000/µL. Telephone the ward now and treat as
        severe malaria.</div>}
      <h3>Stages and follow-up</h3>
      <div className="grid g4">
        {[["rings","Ring forms"],["troph","Trophozoites"],["schiz","Schizonts"],
          ["gam","Gametocytes"],["pigment","Pigment in white cells"],["slide","Slide archived"],
          ["notified","Notified to malaria programme"]].map(([k,l]) =>
          <label key={k} style={{display:"flex",gap:6,alignItems:"center",fontSize:12.5,
            color:"var(--ink)",paddingTop:14}}>
            <input type="checkbox" style={{width:"auto"}} checked={!!m[k]}
              onChange={e=>set(k,e.target.checked)} /> {l}</label>)}
        <div><label>Fields examined</label>
          <input inputMode="numeric" value={m.fields||""} onChange={e=>set("fields",e.target.value)} /></div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- film form */
function FilmForm({ f, setF, applyDiff, wbc }){
  const set = (k,v) => setF({...f, [k]:v});
  const Graded = ({k,l}) => <div><label>{l}</label>
    <select value={f[k]||""} onChange={e=>set(k,e.target.value)}>
      <option value="">Not seen</option>{GRADES.slice(1).map(g=><option key={g}>{g}</option>)}
    </select></div>;
  const Check = ({k,l}) => <label style={{display:"flex",gap:6,alignItems:"center",
    fontSize:12.5,color:"var(--ink)",paddingTop:14}}>
    <input type="checkbox" style={{width:"auto"}} checked={!!f[k]}
      onChange={e=>set(k,e.target.checked)} /> {l}</label>;
  return (
    <div className="card">
      <h2>Blood film morphology</h2>
      <div className="grid g3">
        <div><label>Film quality</label>
          <select value={f.quality||""} onChange={e=>set("quality",e.target.value)}>
            <option value="">—</option><option>Good</option><option>Acceptable</option>
            <option>Poor — recollect</option></select></div>
        <div><label>Red cell size</label>
          <select value={f.size||""} onChange={e=>set("size",e.target.value)}>
            <option value="">—</option><option>Normocytic</option><option>Microcytic</option>
            <option>Macrocytic</option><option>Dimorphic</option></select></div>
        <div><label>Red cell colour</label>
          <select value={f.chromia||""} onChange={e=>set("chromia",e.target.value)}>
            <option value="">—</option><option>Normochromic</option><option>Hypochromic</option>
          </select></div>
      </div>
      <h3>Red cell morphology</h3>
      <div className="grid g4">
        <Graded k="aniso" l="Anisocytosis" /><Graded k="poik" l="Poikilocytosis" />
        <Graded k="target" l="Target cells" /><Graded k="oval" l="Ovalocytes" />
        <Graded k="ellip" l="Elliptocytes" /><Graded k="spher" l="Spherocytes" />
        <Graded k="schisto" l="Schistocytes" /><Graded k="sickle" l="Sickle cells" />
        <Graded k="teardrop" l="Tear drop cells" /><Graded k="stipple" l="Basophilic stippling" />
        <Graded k="howell" l="Howell-Jolly bodies" /><Graded k="rouleaux" l="Rouleaux" />
        <Graded k="polychrom" l="Polychromasia" /><Graded k="acanth" l="Acanthocytes" />
      </div>
      <h3>White cells and platelets</h3>
      <div className="grid g4">
        <div><label>White cell numbers</label>
          <select value={f.wbcEst||""} onChange={e=>set("wbcEst",e.target.value)}>
            <option value="">—</option><option>Decreased</option><option>Adequate</option>
            <option>Increased</option></select></div>
        <div><label>Platelet numbers</label>
          <select value={f.pltEst||""} onChange={e=>set("pltEst",e.target.value)}>
            <option value="">—</option><option>Decreased</option><option>Adequate</option>
            <option>Increased</option></select></div>
        <Check k="leftShift" l="Left shift" /><Check k="toxic" l="Toxic granulation" />
        <Check k="dohle" l="Döhle bodies" /><Check k="vacuol" l="Vacuolation" />
        <Check k="hyperseg" l="Hypersegmentation" /><Check k="atypLymph" l="Atypical lymphocytes" />
        <Check k="blasts" l="Blast cells" /><Check k="auer" l="Auer rods" />
        <Check k="giantPlt" l="Giant platelets" />
        <Check k="pltClump" l="Platelet clumps" /><Check k="microfil" l="Microfilariae" />
      </div>
      <Tally f={f} setF={setF} applyDiff={applyDiff} wbc={wbc} />

      <div style={{marginTop:12}}>
        <label className="req">Film conclusion — this is what the clinician reads</label>
        <textarea rows={3} value={f.conclusion||""} onChange={e=>set("conclusion",e.target.value)}
          placeholder="Microcytic hypochromic anaemia with marked anisopoikilocytosis and target cells. No parasites seen." />
      </div>
      <div className="grid g2" style={{marginTop:10}}>
        <div><label>Suggested next step</label>
          <input value={f.action||""} onChange={e=>set("action",e.target.value)}
            placeholder="Iron studies; repeat count in 4 weeks" /></div>
        <div><label>Reviewed by</label>
          <input value={f.reviewer||""} onChange={e=>set("reviewer",e.target.value)}
            placeholder="Senior scientist or pathologist" /></div>
      </div>
    </div>
  );
}

/* ------------------------------------------- manual differential tally ---- */
// Counts are stored cell by cell rather than as a typed percentage, so the
// count can be audited: 47 neutrophils out of 100 is a fact, "47%" is a claim.
function Tally({ f, setF, applyDiff, wbc }){
  const t = f.tally || {};
  const target = Number(f.tallyTarget) || 100;
  const total = DIFF_CELLS.reduce((s,[k]) => s + (t[k]||0), 0);
  const pct = k => total ? (t[k]||0)/total*100 : 0;
  const done = total >= target;

  // Functional updates throughout: a scientist counting quickly can fire clicks
  // faster than React re-renders, and reading the current props would silently
  // drop cells. A differential that loses cells is worse than no differential.
  const bump = k => setF(prev => {
    const pt = prev.tally || {}, tgt = Number(prev.tallyTarget) || 100;
    if(DIFF_CELLS.reduce((s,[c]) => s + (pt[c]||0), 0) >= tgt) return prev;
    return {...prev, tally:{...pt, [k]:(pt[k]||0)+1},
            tallyLog:[...(prev.tallyLog||[]), k]};
  });
  const undo = () => setF(prev => {
    const log = prev.tallyLog || [];
    if(!log.length) return prev;
    const k = log[log.length-1], pt = prev.tally || {};
    return {...prev, tally:{...pt, [k]:Math.max(0,(pt[k]||0)-1)}, tallyLog:log.slice(0,-1)};
  });
  const reset = () => setF(prev => ({...prev, tally:{}, tallyLog:[]}));

  const nrbc = Number(f.nrbc) || 0;
  const wbcNum = Number(wbc);
  const corrected = (!isNaN(wbcNum) && wbcNum && nrbc)
    ? (wbcNum * 100 / (100 + nrbc)) : null;

  const apply = () => {
    const out = {
      NEUT_PCT: round(pct("neut"),1),   BAND_PCT: round(pct("band"),1),
      LYMPH_PCT:round(pct("lymph"),1),  ATYP_PCT: round(pct("atyp"),1),
      MONO_PCT: round(pct("mono"),1),   EOS_PCT:  round(pct("eos"),1),
      BASO_PCT: round(pct("baso"),1),   BLAST_PCT:round(pct("blast"),1),
      IG_PCT:   round(pct("meta")+pct("myelo")+pct("promyelo"),1),
    };
    if(f.nrbc) out.NRBC_PCT = String(nrbc);
    applyDiff(out);
    setF(prev => ({...prev, tallyApplied:nowISO(), tallyTotal:total}));
  };
  const setField = (k,v) => setF(prev => ({...prev, [k]:v}));

  return (
    <>
      <h3>Manual differential count</h3>
      <div className="note">Tap a cell class as you identify it. The count is capped at the target
        so the denominator is always honest. Nucleated red cells are counted separately, per 100
        white cells, and are not part of the differential.</div>

      <div className="grid g4" style={{gap:6}}>
        {DIFF_CELLS.map(([k,label]) => {
          const n = t[k]||0;
          return (
            <button key={k} onClick={()=>bump(k)} disabled={done}
              className="chip" style={{display:"flex",alignItems:"center",gap:8,
                opacity: done && n===0 ? .45 : 1,
                borderColor: n ? "var(--giemsa)" : "var(--line)",
                background: n ? "var(--giemsa-2)" : "var(--card)"}}>
              <span className="mono" style={{fontSize:17,fontWeight:700,minWidth:30,
                textAlign:"right", color: n ? "#3E1E66" : "var(--mute)"}}>{n}</span>
              <span style={{flex:1,fontSize:12,lineHeight:1.25}}>{label}
                <small style={{color:"var(--mute)",fontSize:10}}>
                  {total ? pct(k).toFixed(1)+"%" : "—"}</small></span>
            </button>
          );
        })}
      </div>

      <div className="rowbar" style={{marginTop:10,alignItems:"center"}}>
        <div className="mono" style={{fontSize:15,fontWeight:700,
          color: done ? "var(--field)" : "var(--amber)"}}>
          {total} / {target} cells
        </div>
        <div style={{fontSize:12,color:"var(--mute)"}}>
          {done ? "count complete" : `${target-total} to go`}
        </div>
        <div className="spacer" />
        <button onClick={undo} disabled={!(f.tallyLog||[]).length}>Undo last cell</button>
        <button onClick={reset} disabled={!total}>Clear count</button>
        <button className="btn-p" onClick={apply} disabled={!done}>
          Apply to the differential</button>
      </div>
      {f.tallyApplied && <div style={{fontSize:11.5,color:"var(--field)",marginTop:2}}>
        Applied to the report from {f.tallyTotal} cells at {fmtDT(f.tallyApplied)}.</div>}

      <div className="grid g4" style={{marginTop:12}}>
        <div><label>Cells to count</label>
          <select value={f.tallyTarget||100} onChange={e=>setField("tallyTarget", e.target.value)}>
            <option value={100}>100 cells</option><option value={200}>200 cells</option>
          </select></div>
        <div><label>Nucleated red cells (/100 WBC)</label>
          <input inputMode="decimal" value={f.nrbc||""}
            onChange={e=>setField("nrbc", e.target.value)} /></div>
        <div><label>Corrected white cell count</label>
          <input readOnly value={corrected ? corrected.toFixed(2)+" x10^9/L" : ""}
            placeholder="needs WBC and NRBC"
            style={{background:"var(--giemsa-3)",color:"var(--giemsa)",fontWeight:600}} /></div>
        <div><label>Stain</label>
          <select value={f.stain||"Giemsa"} onChange={e=>setField("stain", e.target.value)}>
            <option>Giemsa</option><option>May-Grünwald-Giemsa</option>
            <option>Wright</option><option>Field</option></select></div>
        <div><label>Counted by</label>
          <input value={f.countedBy||""} onChange={e=>setField("countedBy", e.target.value)} /></div>
        <div><label>Second reader</label>
          <input value={f.secondReader||""} onChange={e=>setField("secondReader", e.target.value)}
            placeholder="required for abnormal films" /></div>
        <div style={{gridColumn:"span 2"}}><label>Smudge cells and counting notes</label>
          <input value={f.smudge||""} onChange={e=>setField("smudge", e.target.value)}
            placeholder="Numerous smudge cells; count taken from the tail of the film" /></div>
      </div>
    </>
  );
}

/* -------------------------------------------------------- transfusion form */
function BloodBankForm({ b, setB }){
  const set = (k,v) => setB({...b, [k]:v});
  const R = ({k,l}) => <div><label>{l}</label>
    <select value={b[k]||""} onChange={e=>set(k,e.target.value)}>
      <option value="">—</option><option>0</option><option>1+</option><option>2+</option>
      <option>3+</option><option>4+</option></select></div>;
  const mismatch = b.abo && b.unitAbo && b.abo !== b.unitAbo &&
    !(b.unitAbo === "O") && !(b.abo === "AB");
  return (
    <div className="card">
      <h2>Group, antibody screen and crossmatch</h2>
      <div className="note">Two independent determinations of the ABO group are required before a
        first transfusion. Grouping and crossmatch results both need a second person's check.</div>
      <h3>Forward (cell) group</h3>
      <div className="grid g4"><R k="antiA" l="Anti-A" /><R k="antiB" l="Anti-B" />
        <R k="antiAB" l="Anti-A,B" /><R k="antiD" l="Anti-D" /></div>
      <h3>Reverse (serum) group</h3>
      <div className="grid g4"><R k="a1cells" l="A1 cells" /><R k="bcells" l="B cells" />
        <R k="ocells" l="O cells" />
        <div><label>Direct antiglobulin test</label>
          <select value={b.dat||""} onChange={e=>set("dat",e.target.value)}>
            <option value="">Not done</option><option>Negative</option><option>Positive</option>
          </select></div></div>
      <h3>Interpretation</h3>
      <div className="grid g4">
        <div><label className="req">ABO group</label>
          <select value={b.abo||""} onChange={e=>set("abo",e.target.value)}>
            <option value="">—</option><option>A</option><option>B</option><option>AB</option>
            <option>O</option><option>Indeterminate</option></select></div>
        <div><label className="req">RhD</label>
          <select value={b.rhd||""} onChange={e=>set("rhd",e.target.value)}>
            <option value="">—</option><option>Positive</option><option>Negative</option>
            <option>Weak D</option><option>Indeterminate</option></select></div>
        <div><label>Second determination agrees</label>
          <select value={b.confirm||""} onChange={e=>set("confirm",e.target.value)}>
            <option value="">Not yet done</option><option>Yes</option><option>No — discrepancy</option>
          </select></div>
        <div><label>Antibody screen</label>
          <select value={b.screen||""} onChange={e=>set("screen",e.target.value)}>
            <option value="">—</option><option>Negative</option><option>Positive</option></select></div>
      </div>
      {b.screen==="Positive" &&
        <div style={{marginTop:10}}><label>Antibodies identified</label>
          <input value={b.antibodies||""} onChange={e=>set("antibodies",e.target.value)}
            placeholder="anti-D, anti-C" /></div>}
      <h3>Crossmatch</h3>
      <div className="grid g4">
        <div><label>Unit number</label>
          <input className="mono" value={b.unit||""} onChange={e=>set("unit",e.target.value)} /></div>
        <div><label>Unit group</label>
          <select value={b.unitAbo||""} onChange={e=>set("unitAbo",e.target.value)}>
            <option value="">—</option><option>A</option><option>B</option><option>AB</option>
            <option>O</option></select></div>
        <div><label>Component</label>
          <select value={b.component||""} onChange={e=>set("component",e.target.value)}>
            <option value="">—</option><option>Whole blood</option><option>Packed red cells</option>
            <option>Fresh frozen plasma</option><option>Platelet concentrate</option>
            <option>Cryoprecipitate</option></select></div>
        <div><label>Crossmatch result</label>
          <select value={b.xm||""} onChange={e=>set("xm",e.target.value)}>
            <option value="">—</option><option>Compatible</option><option>Incompatible</option>
          </select></div>
      </div>
      {mismatch && <div className="crit" style={{marginTop:10}}>
        <b>ABO mismatch between patient and unit.</b> Patient {b.abo}, unit {b.unitAbo}. Do not issue.
        Recheck both groups.</div>}
      <div className="grid g2" style={{marginTop:10}}>
        <div><label>Performed by</label>
          <input value={b.by||""} onChange={e=>set("by",e.target.value)} /></div>
        <div><label className="req">Checked by (second person)</label>
          <input value={b.checkedBy||""} onChange={e=>set("checkedBy",e.target.value)} /></div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- special haem */
function SpecialForm({ s, setS }){
  const set = (k,v) => setS({...s, [k]:v});
  return (
    <div className="card">
      <h2>Special haematology</h2>
      <div className="note">G6PD deficiency is common in Vanuatu and is a cause of neonatal jaundice
        and drug-induced haemolysis. Screening is unreliable during and shortly after an acute
        haemolytic episode, or after transfusion — repeat after three months.</div>
      <div className="grid g4">
        <div><label>Sickle solubility screen</label>
          <select value={s.sickle||""} onChange={e=>set("sickle",e.target.value)}>
            <option value="">Not done</option><option>Negative</option><option>Positive</option>
          </select></div>
        <div><label>G6PD method</label>
          <select value={s.g6pdMethod||""} onChange={e=>set("g6pdMethod",e.target.value)}>
            <option value="">Not done</option><option>Fluorescent spot</option>
            <option>Quantitative</option><option>Rapid test</option></select></div>
        <div><label>G6PD result</label>
          <select value={s.g6pd||""} onChange={e=>set("g6pd",e.target.value)}>
            <option value="">—</option><option>Normal</option><option>Partial deficiency</option>
            <option>Deficient</option></select></div>
        <div><label>G6PD activity (U/g Hb)</label>
          <input inputMode="decimal" value={s.g6pdAct||""} onChange={e=>set("g6pdAct",e.target.value)} /></div>
        <div><label>Hb electrophoresis pattern</label>
          <input value={s.hbep||""} onChange={e=>set("hbep",e.target.value)} placeholder="AA / AS / AE" /></div>
        <div><label>HbA2 %</label>
          <input inputMode="decimal" value={s.hba2||""} onChange={e=>set("hba2",e.target.value)} /></div>
        <div><label>HbF %</label>
          <input inputMode="decimal" value={s.hbf||""} onChange={e=>set("hbf",e.target.value)} /></div>
        <div><label>Heinz bodies</label>
          <select value={s.heinz||""} onChange={e=>set("heinz",e.target.value)}>
            <option value="">Not done</option><option>Not seen</option><option>Present</option>
          </select></div>
      </div>
      <div style={{marginTop:10}}><label>Interpretation</label>
        <textarea rows={2} value={s.interp||""} onChange={e=>set("interp",e.target.value)} /></div>
    </div>
  );
}

/* ----------------------------------------------------------------- report */
function Report({ req, patient, ageD, sex, prev }){
  const rows = [];
  const groups = [];
  req.panels.forEach(pc => (PN[pc].groups||[]).forEach(g => groups.includes(g)||groups.push(g)));
  const secOrder = ["FBC","DIFF","RETIC","ESR","COAG","FLUID"];
  secOrder.filter(s => groups.includes(s)).forEach(s => {
    const items = ANALYTES.filter(a => a.sec===s && req.values[a.code]!=null && req.values[a.code]!=="");
    if(items.length) rows.push({section:s, items});
  });

  const SEC = {FBC:"Full blood count", DIFF:"Differential count", RETIC:"Reticulocytes",
    ESR:"Erythrocyte sedimentation rate", COAG:"Coagulation", FLUID:"Body fluid cell count"};
  const SPP = {NONE:"No parasites seen", PF:"Plasmodium falciparum", PV:"Plasmodium vivax",
    PM:"Plasmodium malariae", PO:"Plasmodium ovale", MIX:"Mixed infection",
    UNK:"Parasites seen, species undetermined"};

  return (
    <div className="rpt">
      <div className="lh">
        <h2>Vila Central Hospital — Laboratory Department</h2>
        <div>Haematology and Transfusion Section · Port Vila, Vanuatu ·
          Ministry of Health</div>
      </div>

      <table style={{marginBottom:16}}><tbody>
        <tr><td style={{width:"25%",color:"var(--mute)"}}>Patient</td>
          <td style={{fontWeight:600}}>{req.patientName}</td>
          <td style={{width:"22%",color:"var(--mute)"}}>Accession</td>
          <td className="mono" style={{fontWeight:600}}>{req.accession}</td></tr>
        <tr><td style={{color:"var(--mute)"}}>Hospital number</td><td className="mono">{req.hospitalNo}</td>
          <td style={{color:"var(--mute)"}}>Collected</td><td>{fmtDT(req.collectedAt)}</td></tr>
        <tr><td style={{color:"var(--mute)"}}>Sex and age</td>
          <td>{sex}, {ageLabel(ageD)}{patient && patient.dobEstimated ? " (estimated)" : ""}</td>
          <td style={{color:"var(--mute)"}}>Reported</td><td>{fmtDT(req.validatedAt || Date.now())}</td></tr>
        <tr><td style={{color:"var(--mute)"}}>Ward and clinician</td>
          <td>{req.ward}{req.clinician ? " · "+req.clinician : ""}</td>
          <td style={{color:"var(--mute)"}}>Released by</td><td>{req.validatedBy || "not yet released"}</td></tr>
      </tbody></table>

      {rows.map(g =>
        <div key={g.section} style={{marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
            color:"var(--giemsa)",fontWeight:700,marginBottom:4}}>{SEC[g.section]}</div>
          <table><thead><tr><th>Test</th><th style={{textAlign:"right"}}>Result</th><th></th>
            <th>Units</th><th>Reference interval</th>
            {prev && <th>Previous</th>}</tr></thead>
            <tbody>{g.items.map(a => {
              const v = req.values[a.code], fl = flagOf(a.code, v, ageD, sex);
              const ri = getRI(a.code, ageD, sex);
              const p = prev && prev.values ? prev.values[a.code] : null;
              return <tr key={a.code}>
                <td>{a.name}</td>
                <td style={{textAlign:"right",fontWeight:700}}
                  className={fl==="N"?"":(fl[0]==="H"?"hi":"lo")}>{v}</td>
                <td className={fl==="N"?"":(fl[0]==="H"?"hi":"lo")}>
                  {fl==="N"?"":isCrit(fl)?(fl==="HH"?"HH":"LL"):fl}</td>
                <td>{a.unit}</td>
                <td>{ri && ri.l!=null ? `${ri.l} – ${ri.h}` : "—"}</td>
                {prev && <td style={{color:"var(--mute)"}}>{p ?? "—"}</td>}
              </tr>;})}
            </tbody></table>
        </div>)}

      {req.malaria && (req.malaria.species || req.malaria.thick) &&
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
            color:"var(--giemsa)",fontWeight:700,marginBottom:4}}>Malaria examination</div>
          <table><tbody>
            <tr><td style={{width:"35%"}}>Thick and thin films</td>
              <td className="mono">{req.malaria.thick || "—"} / {req.malaria.thin || "—"}</td></tr>
            {req.malaria.rdt && <tr><td>Rapid diagnostic test</td>
              <td className="mono">{req.malaria.rdt}</td></tr>}
            <tr><td>Species</td><td className="mono" style={{fontWeight:700}}>
              {SPP[req.malaria.species] || "—"}</td></tr>
            {req.malaria.density && <tr><td>Asexual parasite density</td>
              <td className="mono" style={{fontWeight:700}}>
                {Number(req.malaria.density).toLocaleString()} /µL
                {Number(req.malaria.density) >= 100000 &&
                  <span className="hi"> — hyperparasitaemia</span>}</td></tr>}
            {req.malaria.gam && <tr><td>Gametocytes</td><td>Present</td></tr>}
          </tbody></table>
        </div>}

      {req.film && req.film.conclusion &&
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
            color:"var(--giemsa)",fontWeight:700,marginBottom:4}}>Blood film</div>
          <div style={{fontSize:13,lineHeight:1.55}}>{req.film.conclusion}</div>
          {req.film.action && <div style={{fontSize:12.5,marginTop:5,color:"var(--slate)"}}>
            Suggested next step: {req.film.action}</div>}
          {req.film.reviewer && <div style={{fontSize:11.5,marginTop:4,color:"var(--mute)"}}>
            Reviewed by {req.film.reviewer}</div>}
        </div>}

      {req.film && req.film.tally &&
        DIFF_CELLS.reduce((s,[k]) => s + (req.film.tally[k]||0), 0) > 0 &&
        (() => {
          const t = req.film.tally;
          const total = DIFF_CELLS.reduce((s,[k]) => s + (t[k]||0), 0);
          const seen = DIFF_CELLS.filter(([k]) => (t[k]||0) > 0);
          const nrbc = Number(req.film.nrbc) || 0;
          const wbcNum = Number(req.values.WBC);
          const corr = (!isNaN(wbcNum) && wbcNum && nrbc) ? wbcNum*100/(100+nrbc) : null;
          return (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
                color:"var(--giemsa)",fontWeight:700,marginBottom:4}}>
                Manual differential — {total} cells counted</div>
              <table><thead><tr><th>Cell type</th><th style={{textAlign:"right"}}>Count</th>
                <th style={{textAlign:"right"}}>%</th></tr></thead>
                <tbody>{seen.map(([k,label]) =>
                  <tr key={k}><td>{label}</td>
                    <td style={{textAlign:"right"}}>{t[k]}</td>
                    <td style={{textAlign:"right",fontWeight:600}}>
                      {(t[k]/total*100).toFixed(1)}</td></tr>)}
                  {nrbc > 0 && <tr><td>Nucleated red cells</td>
                    <td style={{textAlign:"right"}}>{nrbc}</td>
                    <td style={{textAlign:"right",fontSize:11}}>per 100 WBC</td></tr>}
                </tbody></table>
              {corr && <div style={{fontSize:12,marginTop:5}}>
                White cell count corrected for nucleated red cells:{" "}
                <b className="mono">{corr.toFixed(2)} ×10⁹/L</b></div>}
              <div style={{fontSize:11,color:"var(--mute)",marginTop:5}}>
                {req.film.stain || "Giemsa"} stain
                {req.film.countedBy ? ` · counted by ${req.film.countedBy}` : ""}
                {req.film.secondReader ? ` · second reader ${req.film.secondReader}` : ""}
                {req.film.smudge ? ` · ${req.film.smudge}` : ""}
              </div>
            </div>
          );
        })()}

      {req.bb && req.bb.abo &&
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
            color:"var(--giemsa)",fontWeight:700,marginBottom:4}}>Transfusion serology</div>
          <table><tbody>
            <tr><td style={{width:"35%"}}>Blood group</td>
              <td className="mono" style={{fontWeight:700,fontSize:14}}>
                {req.bb.abo} {req.bb.rhd}</td></tr>
            <tr><td>Antibody screen</td><td className="mono">{req.bb.screen || "—"}
              {req.bb.antibodies ? " — "+req.bb.antibodies : ""}</td></tr>
            {req.bb.unit && <tr><td>Crossmatch, unit {req.bb.unit}</td>
              <td className="mono">{req.bb.xm || "—"}</td></tr>}
            {req.bb.checkedBy && <tr><td>Checked by</td><td>{req.bb.checkedBy}</td></tr>}
          </tbody></table>
        </div>}

      {req.special && (req.special.g6pd || req.special.sickle) &&
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,letterSpacing:".09em",textTransform:"uppercase",
            color:"var(--giemsa)",fontWeight:700,marginBottom:4}}>Special haematology</div>
          <table><tbody>
            {req.special.sickle && <tr><td style={{width:"35%"}}>Sickle solubility screen</td>
              <td className="mono">{req.special.sickle}</td></tr>}
            {req.special.g6pd && <tr><td>G6PD screen</td>
              <td className="mono">{req.special.g6pd}
                {req.special.g6pdMethod ? ` (${req.special.g6pdMethod})` : ""}</td></tr>}
            {req.special.hbep && <tr><td>Haemoglobin electrophoresis</td>
              <td className="mono">{req.special.hbep}</td></tr>}
          </tbody></table>
          {req.special.interp && <div style={{fontSize:13,marginTop:6}}>{req.special.interp}</div>}
        </div>}

      {req.comments &&
        <div style={{background:"var(--giemsa-3)",borderLeft:"3px solid var(--giemsa)",
          padding:"9px 12px",fontSize:12.5,lineHeight:1.55,marginBottom:14}}>
          <b>Comment.</b> {req.comments}</div>}

      {req.criticals && req.criticals.length>0 &&
        <div style={{fontSize:11.5,color:"var(--eosin)",marginBottom:12}}>
          Critical results in this report: {req.criticals.map(c =>
            c.text || AN[c.code].name).join(", ")}.
          {req.criticals.every(c=>c.notified)
            ? " All telephoned to the requesting clinician with read-back confirmed."
            : " Telephone notification is still outstanding."}
        </div>}

      <div style={{borderTop:"1px solid var(--line)",paddingTop:9,fontSize:10.5,
        color:"var(--mute)",lineHeight:1.6}}>
        Reference intervals are age and sex specific and apply to the methods in use at this
        laboratory. Results marked H or L fall outside the interval; HH and LL are critical values
        requiring immediate clinical action. Queries to the Haematology Section, Laboratory
        Department, Vila Central Hospital.
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- QC */
function QC({ db, save, log, say }){
  const [f, setF] = useState({level:"normal", analyte:"HGB"});
  const targets = {
    HGB:{normal:[122,3.5], low:[70,3.0], high:[178,4.5]},
    WBC:{normal:[7.2,0.35], low:[2.6,0.22], high:[18.4,0.85]},
    RBC:{normal:[4.35,0.12], low:[2.30,0.09], high:[5.60,0.16]},
    PLT:{normal:[248,12], low:[62,7], high:[480,22]},
    MCV:{normal:[89.0,1.8], low:[78.0,1.8], high:[104.0,2.4]},
  };
  const codes = Object.keys(targets);
  const t = targets[f.analyte][f.level];

  const add = () => {
    const v = Number(f.value);
    if(isNaN(v) || f.value==="") return say("Enter the control value.");
    const z = (v - t[0]) / t[1];
    const hist = db.qc.filter(q => q.analyte===f.analyte && q.level===f.level).slice(0,10);
    let flag = "";
    if(Math.abs(z) > 3) flag = "1-3s — reject the run";
    else if(hist[0] && Math.abs(hist[0].z) > 2 && Math.abs(z) > 2 &&
      Math.sign(hist[0].z)===Math.sign(z)) flag = "2-2s — reject the run";
    else if(hist[0] && Math.abs(hist[0].z - z) > 4) flag = "R-4s — reject the run";
    else if(hist.slice(0,9).length===9 && [...hist.slice(0,9),{z}].every(h => Math.sign(h.z)===Math.sign(z)))
      flag = "10x — systematic shift, investigate";
    else if(Math.abs(z) > 2) flag = "1-2s — warning, review before releasing";
    const rec = {id:"Q"+Date.now(), at:nowISO(), analyte:f.analyte, level:f.level,
      value:v, z:Number(z.toFixed(2)), mean:t[0], sd:t[1], flag,
      accepted: !flag.includes("reject")};
    save({...db, qc:[rec, ...db.qc],
      audit:[log(f.analyte+" "+f.level,"QC result entered", `${v} (z ${rec.z}) ${flag}`), ...db.audit]});
    setF({...f, value:""});
    say(flag ? flag : "Control within limits.");
  };

  const series = db.qc.filter(q => q.analyte===f.analyte && q.level===f.level).slice(0,20).reverse();

  return (
    <>
      <div className="card">
        <h2>Internal quality control</h2>
        <div className="note">Controls are run before patient samples on each shift. A rejected run
          means the patient results are held, the cause is corrected, and the run repeated.</div>
        <div className="grid g4">
          <div><label>Analyte</label>
            <select value={f.analyte} onChange={e=>setF({...f, analyte:e.target.value})}>
              {codes.map(c => <option key={c} value={c}>{AN[c].name}</option>)}</select></div>
          <div><label>Control level</label>
            <select value={f.level} onChange={e=>setF({...f, level:e.target.value})}>
              <option value="low">Low</option><option value="normal">Normal</option>
              <option value="high">High</option></select></div>
          <div><label>Value ({AN[f.analyte].unit})</label>
            <input inputMode="decimal" className="mono" value={f.value||""}
              onChange={e=>setF({...f, value:e.target.value})} /></div>
          <div style={{display:"flex",alignItems:"end"}}>
            <button className="btn-p" style={{width:"100%"}} onClick={add}>Record control</button></div>
        </div>
        <div style={{marginTop:8,fontSize:12,color:"var(--mute)"}} className="mono">
          Assigned mean {t[0]} · SD {t[1]} · 2SD limits {(t[0]-2*t[1]).toFixed(1)} to {(t[0]+2*t[1]).toFixed(1)}
        </div>
      </div>

      <div className="card">
        <h2>Levey-Jennings — {AN[f.analyte].name}, {f.level} control</h2>
        {series.length===0 ? <div className="empty"><b>No control results yet</b>
          Record a control value above to start the chart.</div> : <LJ series={series} t={t} />}
      </div>

      <div className="card">
        <h2>Control log</h2>
        {db.qc.length===0 ? <div className="empty"><b>Empty log</b>Nothing recorded yet.</div> :
        <table><thead><tr><th>When</th><th>Analyte</th><th>Level</th><th>Value</th>
          <th>z</th><th>Rule</th><th>Run</th></tr></thead>
          <tbody>{db.qc.slice(0,40).map(q =>
            <tr key={q.id}><td className="mono" style={{fontSize:11}}>{fmtDT(q.at)}</td>
              <td>{AN[q.analyte].name}</td><td>{q.level}</td>
              <td className="mono">{q.value}</td>
              <td className="mono" style={{color: Math.abs(q.z)>2 ? "var(--eosin)":"var(--field)"}}>
                {q.z>0?"+":""}{q.z}</td>
              <td style={{fontSize:12,color: q.flag ? "var(--eosin)":"var(--mute)"}}>{q.flag || "—"}</td>
              <td>{q.accepted ? "accepted" : "rejected"}</td></tr>)}
          </tbody></table>}
      </div>
    </>
  );
}

function LJ({ series, t }){
  const W = 720, H = 200, PAD = 34;
  const [mean, sd] = t;
  const yMin = mean - 4*sd, yMax = mean + 4*sd;
  const x = i => PAD + (i/(Math.max(series.length-1,1)))*(W-PAD-14);
  const y = v => H-24 - ((v-yMin)/(yMax-yMin))*(H-40);
  const lines = [[-3,"var(--eosin)"],[-2,"var(--amber)"],[-1,"var(--line)"],[0,"var(--giemsa)"],
                 [1,"var(--line)"],[2,"var(--amber)"],[3,"var(--eosin)"]];
  return (
    <div style={{overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:520,height:"auto"}}>
        {lines.map(([n,c]) => <g key={n}>
          <line x1={PAD} x2={W-14} y1={y(mean+n*sd)} y2={y(mean+n*sd)} stroke={c}
            strokeWidth={n===0?1.4:1} strokeDasharray={n===0?"":"3 3"} />
          <text x={4} y={y(mean+n*sd)+3} fontSize="9" fill="var(--mute)"
            fontFamily="monospace">{n>0?"+":""}{n}SD</text>
        </g>)}
        <polyline fill="none" stroke="var(--giemsa)" strokeWidth="1.4"
          points={series.map((s,i)=>`${x(i)},${y(s.value)}`).join(" ")} />
        {series.map((s,i) => <circle key={s.id} cx={x(i)} cy={y(s.value)} r={Math.abs(s.z)>2?4.5:3.2}
          fill={Math.abs(s.z)>3?"var(--eosin)":Math.abs(s.z)>2?"var(--amber)":"var(--field)"}>
          <title>{`${s.value} (z ${s.z}) ${fmtDT(s.at)}`}</title></circle>)}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------- dictionary */
function Dictionary(){
  const [q, setQ] = useState("");
  const list = ANALYTES.filter(a =>
    (a.name+" "+a.code+" "+(a.loinc||"")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <h2>Test dictionary — {ANALYTES.length} analytes</h2>
      <div className="note">Adding a test means adding one row here and its reference intervals.
        Nothing else in the system has to change. Intervals shown are defaults and must be verified
        against the local population and methods before use.</div>
      <input placeholder="Search by name, code or LOINC" value={q}
        onChange={e=>setQ(e.target.value)} style={{marginBottom:12}} />
      <table><thead><tr><th>Code</th><th>Name</th><th>Unit</th><th>LOINC</th>
        <th>Adult interval</th><th>Critical</th><th>Source</th></tr></thead>
        <tbody>{list.map(a => {
          const ri = getRI(a.code, 12000, "male");
          return <tr key={a.code}>
            <td className="mono">{a.code}</td><td>{a.name}</td>
            <td className="mono" style={{fontSize:11.5}}>{a.unit}</td>
            <td className="mono" style={{fontSize:11.5}}>{a.loinc||"—"}</td>
            <td className="mono" style={{fontSize:11.5}}>
              {ri && ri.l!=null ? `${ri.l} – ${ri.h}` : "—"}</td>
            <td className="mono" style={{fontSize:11.5,color:"var(--eosin)"}}>
              {a.crit.cl!=null ? `≤${a.crit.cl}` : ""}{a.crit.cl!=null&&a.crit.ch!=null?" / ":""}
              {a.crit.ch!=null ? `≥${a.crit.ch}` : ""}{!a.crit.cl&&!a.crit.ch?"—":""}</td>
            <td style={{fontSize:11.5,color:"var(--mute)"}}>{a.calc?"calculated":"measured"}</td>
          </tr>;})}
        </tbody></table>
    </div>
  );
}

/* ------------------------------------------------------------------ audit */
function Audit({ db }){
  const exportAll = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vch-haemlis-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="card">
      <h2>Audit trail</h2>
      <div className="rowbar">
        <div style={{fontSize:12.5,color:"var(--mute)"}}>
          {db.audit.length} entries · {db.patients.length} patients · {db.requests.length} requests</div>
        <div className="spacer" />
        <button onClick={exportAll}>Export everything as JSON</button>
      </div>
      {db.audit.length===0 ? <div className="empty"><b>Nothing recorded yet</b>
        Every registration, result and release is logged here.</div> :
      <table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
        <tbody>{db.audit.slice(0,120).map((a,i) =>
          <tr key={i}><td className="mono" style={{fontSize:11}}>{fmtDT(a.at)}</td>
            <td className="mono">{a.who}</td><td>{a.action}</td>
            <td className="mono">{a.entry}</td>
            <td style={{color:"var(--mute)",fontSize:12}}>{a.detail}</td></tr>)}
        </tbody></table>}
    </div>
  );
}
