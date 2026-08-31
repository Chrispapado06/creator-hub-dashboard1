#!/usr/bin/env python3
"""UNCVRD_Weekly.xlsx — weekly + custom-date stats, by creator, with weekly history.
Tabs:
  Weekly Stats   : pick a Creator + a From/To date range. Rows = platforms, cols = the metrics.
                   Default range = this Fri→Thu week; narrow it to compare any days.
  Weekly History : one row per week (Fri→Thu), last 12 weeks, for the chosen creator. Each week saved.
  Data           : auto feed from the server (one row per day+creator+platform). Don't touch.
  Manual Spend   : type OnlyFinder/Guider/Seeker spend.
"""
import csv, io, datetime, urllib.request, json
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule

BASE="https://ad-suite-production.up.railway.app"; KEY="uncvrd2026"
SID="'Weekly Stats'!$B$3"
BAND="5B43F5"; HEAD="1F2430"; WHITE="FFFFFF"; MUTE="6B7280"; YEL="FFF6CC"
RAW="FFFDF5"; CALC="F1F2F7"; GREEN="4CD964"; RED="FF6B6B"; ORANGE="FFAA33"
GREENS="E6F7EC"; REDS="FCEAEA"   # soft tints — used for CVR so it's calmer than the LTV traffic-lights
thin=Side(style="thin",color="D9DCE3"); border=Border(left=thin,right=thin,top=thin,bottom=thin)
CUR='$#,##0.00'; INT='#,##0'; PCT='0.0%'; MUL='0.00"x"'
def st(c,*,bold=False,size=11,color="111111",fill=None,align="center",fmt=None,bd=True):
    c.font=Font(bold=bold,size=size,color=color); c.alignment=Alignment(horizontal=align,vertical="center")
    if fill:c.fill=PatternFill("solid",fgColor=fill)
    if fmt:c.number_format=fmt
    if bd:c.border=border

today=datetime.date.today()   # build against the real current date so the default week is never stale
# most recent Friday (weeks run Fri→Thu); on a Friday itself, use last week so the default shows a
# COMPLETE week of data instead of a just-started, near-empty one.
friday=today-datetime.timedelta(days=(today.weekday()-4)%7 or 7)

def _creators():
    try:
        k=json.load(open("/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/ad-tracker/data-analyst/credentials.json"))["onlyfans_key"]
    except Exception: return ["Antonella","June - Sandra","Marissa munoz"]
    OB="https://app.onlyfansapi.com/api"
    def f(p):
        r=urllib.request.Request(OB+p,headers={"Authorization":"Bearer "+k,"Accept":"application/json","User-Agent":"UNCVRD/1.0"})
        return json.load(urllib.request.urlopen(r,timeout=45))
    def cls(n): n=(n or "").lower(); return any(x in n for x in ("meta","finder","search","guider","seeker")) or ("traffic" in n and "only" in n)
    accts=f("/accounts"); accts=accts if isinstance(accts,list) else (accts.get("data") if isinstance(accts.get("data"),list) else (accts.get("data") or {}).get("list") or [])
    out=[]
    for a in accts:
        name=a.get("display_name") or a.get("onlyfans_username") or ""
        if not name: continue
        keep=True
        if a.get("is_authenticated"):
            try: keep=any(cls(l.get("campaignName")) for l in (f("/%s/tracking-links?limit=100"%a["id"]).get("data") or {}).get("list") or [])
            except Exception: keep=False
        if keep and name not in out: out.append(name)
    return out or ["June - Sandra","Marissa munoz"]
CREATORS=_creators()
PLATS=["Meta","OnlyFinder","OnlyGuider","OnlySeeker","OnlyTraffic"]

wb=Workbook(); ws=wb.active; ws.title="Weekly Stats"

# ===================== DATA (auto grid) =====================
dt=wb.create_sheet("Data")
dt["A1"]=f'=IFERROR(IMPORTDATA("{BASE}/sheet-grid?key={KEY}&v=15&sheet="&{SID}),"")'
dt["I1"]="DateKey"; dt["I2"]='=ARRAYFORMULA(IF(LEN(A2:A100000)=0,"",TEXT(A2:A100000,"yyyy-mm-dd")))'
st(dt["I1"],bold=True,fill=HEAD,color=WHITE); dt["K1"]="Auto data from the server — don't type here."
st(dt["K1"],color=MUTE,bd=False)
for col,w in [("A",12),("B",16),("C",12),("D",9),("E",8),("F",10),("G",12),("I",12),("K",46)]: dt.column_dimensions[col].width=w

# ===================== COHORT (auto feed for Time to Profit) =====================
co=wb.create_sheet("Cohort")
co["A1"]=f'=IFERROR(IMPORTDATA("{BASE}/cohort-grid?key={KEY}&v=15&sheet="&{SID}),"")'
co["L1"]="Auto cohort data from the server (lifetime revenue per subscriber, by age) — don't type here."
st(co["L1"],color=MUTE,bd=False)
for col,w in [("A",16),("B",12),("C",8),("D",9),("E",9),("F",9),("G",9),("H",9),("I",9),("J",9)]: co.column_dimensions[col].width=w

# ===================== MANUAL SPEND =====================
ms=wb.create_sheet("Manual Spend")
ms.merge_cells("A1:D1")
st(ms.cell(1,1,"MANUAL SPEND — type what you spent on OnlyFinder / OnlyGuider / OnlySeeker."),bold=True,color=WHITE,fill=BAND,align="left",bd=False)
for j,h in enumerate(["Date","Creator","Platform","Amount ($)"],start=1): st(ms.cell(2,j,h),bold=True,color=WHITE,fill=HEAD)
for r in range(3,203):
    st(ms.cell(r,1),fmt="yyyy-mm-dd"); st(ms.cell(r,2)); st(ms.cell(r,3)); st(ms.cell(r,4),fmt=CUR,fill=RAW)
dv=DataValidation(type="list",formula1='"OnlyFinder,OnlyGuider,OnlySeeker,OnlyTraffic"',allow_blank=True); ms.add_data_validation(dv); dv.add("C3:C202")
if CREATORS:
    dc=DataValidation(type="list",formula1='"%s"'%(",".join(CREATORS)),allow_blank=True); ms.add_data_validation(dc); dc.add("B3:B202")
for col,w in [("A",13),("B",16),("C",14),("D",12)]: ms.column_dimensions[col].width=w
ms.freeze_panes="A3"; ms.sheet_view.showGridLines=False

# ===================== WEEKLY STATS (From/To + Creator) =====================
ws.merge_cells("A1:N1"); st(ws.cell(1,1,"UNCVRD — WEEKLY STATS"),bold=True,size=18,color=WHITE,fill=BAND,align="left",bd=False)
st(ws.cell(2,1,"From ▸"),bold=True,align="right"); st(ws.cell(2,2,friday),fmt="yyyy-mm-dd",fill=YEL,bold=True)
st(ws.cell(2,3,"To ▸"),bold=True,align="right"); st(ws.cell(2,4,friday+datetime.timedelta(days=6)),fmt="yyyy-mm-dd",fill=YEL,bold=True)
st(ws.cell(2,5,"Creator ▸"),bold=True,align="right"); st(ws.cell(2,6,"All"),fill=YEL,bold=True)
dvcr=DataValidation(type="list",formula1='"%s"'%(",".join(["All"]+CREATORS)),allow_blank=False); ws.add_data_validation(dvcr); dvcr.add("F2")
st(ws.cell(2,8,'=TEXT($B$2,"mmm d")&" → "&TEXT($D$2,"mmm d")&"   (pick any dates — set From=To for a single day)"'),color=MUTE,align="left",bd=False)
st(ws.cell(3,1,"Sheet ID ▸"),align="right",size=10,color=MUTE); st(ws.cell(3,2,""),fill=YEL)
st(ws.cell(3,4,"Spend = Clicks × the CPC you type per platform (yellow cells in the CPC column).  Paste sheet ID for day-by-day manual overrides."),size=10,color=MUTE,align="left",bd=False)
HEADERS=["Metrics i need to know","Clicks","Fans","Spend","CAC","CPC","CVR","Attributed Revenue",
         "Total LTV 48h","Total LTV 7d","Total LTV 14d","Total LTV 30d","ROAS","Agency Profit"]
# the DAY BY DAY section keeps the simpler per-day layout (single LTV), so it has its own headers
DAYHEADERS=["Day / Platform","Clicks","Fans","Spend","Cost Per Fan","CPC","CVR","Attributed Revenue","Total Link LTV","ROAS","Agency Profit"]
for j,h in enumerate(HEADERS,start=1): st(ws.cell(4,j,h),bold=True,color=WHITE,fill=HEAD)
# match the REAL date column A (date-serial vs date-serial) — the standard, reliable way
FROM='">="&$B$2'; TO='"<="&$D$2'
def raw(valcol, plat):
    b=("SUMIFS(Data!$%s:$%s,Data!$A:$A,%s,Data!$A:$A,%s"%(valcol,valcol,FROM,TO))
    if plat is not None: b+=',Data!$C:$C,"%s"'%plat
    b+=',Data!$B:$B,IF($F$2="All","*",$F$2))'
    return "="+b
def ltv(revcol, plat):   # lifetime LTV-by-age = cohort Rev_bucket / Subs, by platform + the F2 creator
    flt=('Cohort!$B:$B,"%s",Cohort!$A:$A,IF($F$2="All","*",$F$2)'%plat) if plat is not None else 'Cohort!$A:$A,IF($F$2="All","*",$F$2)'
    return '=IFERROR(SUMIFS(Cohort!$%s:$%s,%s)/SUMIFS(Cohort!$C:$C,%s),"")'%(revcol,revcol,flt,flt)
r=5
for p in PLATS+["TOTAL"]:
    pe=None if p=="TOTAL" else p; tot=(p=="TOTAL")
    st(ws.cell(r,1,p),bold=tot,align="left")
    st(ws.cell(r,2,raw("D",pe)),fmt=INT); st(ws.cell(r,3,raw("E",pe)),fmt=INT)
    if tot:
        st(ws.cell(r,4,f"=SUM(D5:D{r-1})"),fmt=CUR)                   # Spend = sum of platform spends
        st(ws.cell(r,6,f'=IFERROR(D{r}/B{r},"")'),fmt=CUR,fill=CALC)   # CPC (blended)
    else:
        st(ws.cell(r,4,f"=B{r}*F{r}"),fmt=CUR,fill=CALC)              # Spend = Clicks × CPC (auto)
        st(ws.cell(r,6,0.75),fmt=CUR,fill=YEL)                        # CPC — type your per-click price
    st(ws.cell(r,5,f'=IFERROR(D{r}/C{r},"")'),fmt=CUR,fill=CALC)       # CAC = Spend ÷ Fans
    st(ws.cell(r,7,f'=IFERROR(C{r}/B{r},"")'),fmt=PCT,fill=CALC)
    st(ws.cell(r,8,raw("G",pe)),fmt=CUR)
    st(ws.cell(r,9,ltv("E",pe)),fmt=CUR,fill=CALC)    # Total LTV 48h  (Cohort E = Rev48h)
    st(ws.cell(r,10,ltv("F",pe)),fmt=CUR,fill=CALC)   # Total LTV 7d   (Cohort F = Rev7d)
    st(ws.cell(r,11,ltv("G",pe)),fmt=CUR,fill=CALC)   # Total LTV 14d  (Cohort G = Rev14d)
    st(ws.cell(r,12,ltv("I",pe)),fmt=CUR,fill=CALC)   # Total LTV 30d  (Cohort I = Rev30d)
    st(ws.cell(r,13,f'=IFERROR(H{r}/D{r},"")'),fmt=MUL,fill=CALC)   # ROAS
    st(ws.cell(r,14,f'=H{r}-D{r}'),fmt=CUR,fill=CALC)              # Agency Profit
    r+=1
last=r-1
ws.conditional_formatting.add(f"G5:G{last}",CellIsRule(operator="greaterThanOrEqual",formula=["0.25"],fill=PatternFill("solid",fgColor=GREENS)))
ws.conditional_formatting.add(f"G5:G{last}",CellIsRule(operator="lessThan",formula=["0.25"],fill=PatternFill("solid",fgColor=REDS)))
ws.conditional_formatting.add(f"F5:F{last}",CellIsRule(operator="greaterThan",formula=["0.7"],fill=PatternFill("solid",fgColor=RED)))
# Boss's Total-LTV-by-age colour thresholds: I=48h J=7d K=14d L=30d (green first + stopIfTrue → green wins at the line)
def wtiers(col,red_below,green_at):
    rng=f"{col}5:{col}{last}"
    ws.conditional_formatting.add(rng,CellIsRule(operator="greaterThanOrEqual",formula=[str(green_at)],stopIfTrue=True,fill=PatternFill("solid",fgColor=GREEN)))
    ws.conditional_formatting.add(rng,CellIsRule(operator="greaterThanOrEqual",formula=[str(red_below)],stopIfTrue=True,fill=PatternFill("solid",fgColor=ORANGE)))
    ws.conditional_formatting.add(rng,CellIsRule(operator="lessThan",formula=[str(red_below)],stopIfTrue=True,fill=PatternFill("solid",fgColor=RED)))
wtiers("I",3,4)     # LTV 48h: <3 red · 3-4 orange · 4+ green
wtiers("J",4,6)     # LTV 7d:  <4 red · 4-6 orange · 6+ green
wtiers("K",6,8)     # LTV 14d: <6 red · 6-8 orange · 8+ green
wtiers("L",10,14)   # LTV 30d: <10 red · 10-14 orange · 14+ green

# ---- DAY BY DAY: the platform table repeated for THIS week + the next 7 days (14 days) ----
DAYFILL="EDE7FB"   # soft purple tint marking each day's total row
DB=last+2          # one row below the platform table (adapts to platform count)
REL=12             # Relevance score lives in column L (after the 11 metric columns)
ws.merge_cells(start_row=DB,start_column=1,end_row=DB,end_column=REL)
st(ws.cell(DB,1,"DAY BY DAY  (this week + the next 7 days, by platform — for the chosen creator. Type the Relevance score in yourself.)"),bold=True,color=WHITE,fill=BAND,align="left")
st(ws.cell(DB+1,1,"Day / Platform"),bold=True,color=WHITE,fill=HEAD,align="left")
for j in range(2,12): st(ws.cell(DB+1,j,DAYHEADERS[j-1]),bold=True,color=WHITE,fill=HEAD)
st(ws.cell(DB+1,REL,"Relevance"),bold=True,color=WHITE,fill=HEAD)
def dtot(valcol,dr):          # whole-day total (all platforms)
    return ('=SUMIFS(Data!$%s:$%s,Data!$A:$A,$A%d,Data!$B:$B,IF($F$2="All","*",$F$2))'%(valcol,valcol,dr))
def dplat(valcol,dr,plat):    # one platform on that day
    return ('=SUMIFS(Data!$%s:$%s,Data!$A:$A,$A%d,Data!$C:$C,"%s",Data!$B:$B,IF($F$2="All","*",$F$2))'%(valcol,valcol,dr,plat))
def fillrow(rr,dr,plat,total):
    rw=(lambda vc:dtot(vc,dr)) if plat is None else (lambda vc:dplat(vc,dr,plat))
    bf=DAYFILL if total else None; cf=DAYFILL if total else CALC
    st(ws.cell(rr,2,rw("D")),fmt=INT,bold=total,fill=bf)
    st(ws.cell(rr,3,rw("E")),fmt=INT,bold=total,fill=bf)
    st(ws.cell(rr,4,rw("F")),fmt=CUR,bold=total,fill=bf)
    st(ws.cell(rr,5,f'=IFERROR(D{rr}/C{rr},"")'),fmt=CUR,bold=total,fill=cf)
    st(ws.cell(rr,6,f'=IFERROR(D{rr}/B{rr},"")'),fmt=CUR,bold=total,fill=cf)
    st(ws.cell(rr,7,f'=IFERROR(C{rr}/B{rr},"")'),fmt=PCT,bold=total,fill=cf)
    st(ws.cell(rr,8,rw("G")),fmt=CUR,bold=total,fill=bf)
    st(ws.cell(rr,9,f'=IFERROR(H{rr}/C{rr},"")'),fmt=CUR,bold=total,fill=cf)
    st(ws.cell(rr,10,f'=IFERROR(H{rr}/D{rr},"")'),fmt=MUL,bold=total,fill=cf)
    st(ws.cell(rr,11,f'=H{rr}-D{rr}'),fmt=CUR,bold=total,fill=cf)
r=DB+2
for i in range(14):
    dr=r
    st(ws.cell(dr,1,f"=$B$2+{i}"),fmt="ddd, mmm d",bold=True,color=WHITE,fill=BAND,align="left")
    fillrow(dr,dr,None,True)                        # the day's total row (header band)
    st(ws.cell(dr,REL,""),fill=DAYFILL)             # band: Relevance is per-platform below
    for k,p in enumerate(PLATS):
        pr=dr+1+k
        st(ws.cell(pr,1,"    "+p),align="left")
        fillrow(pr,dr,p,False)
        st(ws.cell(pr,REL,""),fmt='0.0',fill=RAW)   # ← type the Relevance score here (per day + platform)
    r=dr+1+len(PLATS)
dl=r-1
ws.conditional_formatting.add(f"G{DB+2}:G{dl}",CellIsRule(operator="greaterThanOrEqual",formula=["0.25"],fill=PatternFill("solid",fgColor=GREENS)))
ws.conditional_formatting.add(f"G{DB+2}:G{dl}",CellIsRule(operator="lessThan",formula=["0.25"],fill=PatternFill("solid",fgColor=REDS)))
ws.conditional_formatting.add(f"F{DB+2}:F{dl}",CellIsRule(operator="greaterThan",formula=["0.7"],fill=PatternFill("solid",fgColor=RED)))
# day-by-day Total Link LTV (col I) — bright traffic-lights on the boss's 48h LTV scale (<3 red · 3-4 orange · 4+ green)
liv=f"I{DB+2}:I{dl}"
ws.conditional_formatting.add(liv,CellIsRule(operator="greaterThanOrEqual",formula=["4"],stopIfTrue=True,fill=PatternFill("solid",fgColor=GREEN)))
ws.conditional_formatting.add(liv,CellIsRule(operator="greaterThanOrEqual",formula=["3"],stopIfTrue=True,fill=PatternFill("solid",fgColor=ORANGE)))
ws.conditional_formatting.add(liv,CellIsRule(operator="lessThan",formula=["3"],stopIfTrue=True,fill=PatternFill("solid",fgColor=RED)))

ws.column_dimensions["A"].width=22
for col in ["B","C","D","E","F","G","I","J","K","L","M","N"]: ws.column_dimensions[col].width=11
ws.column_dimensions["H"].width=15
ws.freeze_panes="A5"; ws.sheet_view.showGridLines=False; ws.row_dimensions[1].height=26

# ===================== WEEKLY HISTORY (one row per week) =====================
wh=wb.create_sheet("Weekly History")
wh.merge_cells("A1:I1"); st(wh.cell(1,1,"UNCVRD — WEEKLY HISTORY  (every week saved · Fri → Thu)"),bold=True,size=16,color=WHITE,fill=BAND,align="left",bd=False)
st(wh.cell(2,1,"Creator ▸"),bold=True,align="right"); st(wh.cell(2,2,"All"),fill=YEL,bold=True)
dvh=DataValidation(type="list",formula1='"%s"'%(",".join(["All"]+CREATORS)),allow_blank=False); wh.add_data_validation(dvh); dvh.add("B2")
WHH=["Week (Fri start)","Clicks","Fans","Spend","CPC","CVR","Attributed Revenue","ROAS","Agency Profit"]
for j,h in enumerate(WHH,start=1): st(wh.cell(3,j,h),bold=True,color=WHITE,fill=HEAD)
def whraw(valcol,r):
    return ("=SUMIFS(Data!$%s:$%s,Data!$A:$A,\">=\"&$A%d,"
            "Data!$A:$A,\"<=\"&($A%d+6),Data!$B:$B,IF($B$2=\"All\",\"*\",$B$2))"%(valcol,valcol,r,r))
r=4
for i in range(12):                       # last 12 weeks, newest on top
    wk=friday-datetime.timedelta(days=7*i)
    st(wh.cell(r,1,wk),fmt="yyyy-mm-dd")
    st(wh.cell(r,2,whraw("D",r)),fmt=INT); st(wh.cell(r,3,whraw("E",r)),fmt=INT); st(wh.cell(r,4,whraw("F",r)),fmt=CUR)
    st(wh.cell(r,5,f'=IFERROR(D{r}/B{r},"")'),fmt=CUR,fill=CALC)
    st(wh.cell(r,6,f'=IFERROR(C{r}/B{r},"")'),fmt=PCT,fill=CALC)
    st(wh.cell(r,7,whraw("G",r)),fmt=CUR)
    st(wh.cell(r,8,f'=IFERROR(G{r}/D{r},"")'),fmt=MUL,fill=CALC)
    st(wh.cell(r,9,f'=G{r}-D{r}'),fmt=CUR,fill=CALC)
    r+=1
wlast=r-1
wh.conditional_formatting.add(f"F4:F{wlast}",CellIsRule(operator="greaterThanOrEqual",formula=["0.25"],fill=PatternFill("solid",fgColor=GREENS)))
wh.conditional_formatting.add(f"F4:F{wlast}",CellIsRule(operator="lessThan",formula=["0.25"],fill=PatternFill("solid",fgColor=REDS)))
wh.conditional_formatting.add(f"E4:E{wlast}",CellIsRule(operator="greaterThan",formula=["0.7"],fill=PatternFill("solid",fgColor=RED)))
wh.column_dimensions["A"].width=16
for col in ["B","C","D","E","F","H","I"]: wh.column_dimensions[col].width=11
wh.column_dimensions["G"].width=15
wh.freeze_panes="A4"; wh.sheet_view.showGridLines=False; wh.row_dimensions[1].height=24

# ===================== TIME TO PROFIT / BREAK-EVEN (per platform) =====================
tp=wb.create_sheet("Time to Profit")
tp.merge_cells("A1:M1")
st(tp.cell(1,1,"UNCVRD — TIME TO PROFIT  /  BREAK-EVEN  (per platform · lifetime value of the fans each platform brought)"),bold=True,size=15,color=WHITE,fill=BAND,align="left",bd=False)
st(tp.cell(2,1,"Creator ▸"),bold=True,align="right"); st(tp.cell(2,2,"All"),fill=YEL,bold=True)
dvtp=DataValidation(type="list",formula1='"%s"'%(",".join(["All"]+CREATORS)),allow_blank=False); tp.add_data_validation(dvtp); dvtp.add("B2")
st(tp.cell(2,4,"Set each platform's REAL Cost / Click in the yellow column (D) below — Meta, OnlyFinder etc. can each have their own rate →"),color=MUTE,align="left",bd=False)
st(tp.cell(3,1,"ARPS = revenue each fan has spent by that age.  Profitable when ARPS All ≥ Cost / Sub.  Green margin = you make money."),size=10,color=MUTE,align="left",bd=False)
TPH=["Platform","Subscribers","Clicks","Cost / Click","Cost / Promo","Cost / Sub",
     "ARPS 48h","ARPS 7d","ARPS 14d","ARPS 30d","ARPS All (Rev/Sub)","Margin / Sub","Break-even by"]
for j,h in enumerate(TPH,start=1): st(tp.cell(4,j,h),bold=True,color=WHITE,fill=HEAD)
def chs(col,plat):   # SUMIFS over the Cohort feed (exact text match — no dates, so no date traps)
    if plat is None:
        return 'SUMIFS(Cohort!$%s:$%s,Cohort!$A:$A,IF($B$2="All","*",$B$2))'%(col,col)
    return 'SUMIFS(Cohort!$%s:$%s,Cohort!$B:$B,"%s",Cohort!$A:$A,IF($B$2="All","*",$B$2))'%(col,col,plat)
# Cohort cols: C=Subs D=Clicks E=Rev48h F=Rev7d G=Rev14d I=Rev30d J=RevAll
r=5
for p in PLATS+["TOTAL"]:
    pe=None if p=="TOTAL" else p; tot=(p=="TOTAL")
    st(tp.cell(r,1,p),bold=tot,align="left")
    st(tp.cell(r,2,"="+chs("C",pe)),fmt=INT,bold=tot)            # Subscribers
    st(tp.cell(r,3,"="+chs("D",pe)),fmt=INT,bold=tot)            # Clicks
    if tot:
        st(tp.cell(r,4,f'=IFERROR(E{r}/C{r},"")'),fmt=CUR,fill=CALC,bold=True)   # blended Cost/Click
        st(tp.cell(r,5,f"=SUM(E5:E{r-1})"),fmt=CUR,bold=True)                    # total Cost/Promo
    else:
        st(tp.cell(r,4,0.75),fmt=CUR,fill=YEL)                                   # ← type real Cost/Click
        st(tp.cell(r,5,f"=D{r}*C{r}"),fmt=CUR)                                   # Cost/Promo
    st(tp.cell(r,6,f'=IFERROR(E{r}/B{r},"")'),fmt=CUR,fill=CALC,bold=tot)            # Cost / Sub
    st(tp.cell(r,7,f'=IFERROR(({chs("E",pe)})/B{r},"")'),fmt=CUR,fill=CALC,bold=tot)  # ARPS 48h
    st(tp.cell(r,8,f'=IFERROR(({chs("F",pe)})/B{r},"")'),fmt=CUR,fill=CALC,bold=tot)  # ARPS 7d
    st(tp.cell(r,9,f'=IFERROR(({chs("G",pe)})/B{r},"")'),fmt=CUR,fill=CALC,bold=tot)  # ARPS 14d
    st(tp.cell(r,10,f'=IFERROR(({chs("I",pe)})/B{r},"")'),fmt=CUR,fill=CALC,bold=tot) # ARPS 30d
    st(tp.cell(r,11,f'=IFERROR(({chs("J",pe)})/B{r},"")'),fmt=CUR,fill=CALC,bold=tot) # ARPS All
    st(tp.cell(r,12,f'=IFERROR(K{r}-F{r},"")'),fmt=CUR,fill=CALC,bold=tot)            # Margin / Sub
    st(tp.cell(r,13,f'=IF(B{r}=0,"",IF(G{r}>=F{r},"by 48h",IF(H{r}>=F{r},"by 7d",IF(I{r}>=F{r},"by 14d",IF(J{r}>=F{r},"by 30d",IF(K{r}>=F{r},"after 30d","not yet"))))))'),bold=tot,align="center")
    r+=1
tlast=r-1
tp.conditional_formatting.add(f"L5:L{tlast}",CellIsRule(operator="greaterThanOrEqual",formula=["0"],fill=PatternFill("solid",fgColor=GREEN)))
tp.conditional_formatting.add(f"L5:L{tlast}",CellIsRule(operator="lessThan",formula=["0"],fill=PatternFill("solid",fgColor=RED)))
# Boss's Link-LTV-by-age thresholds on the OFAPI cohort ARPS columns (G=48h H=7d I=14d J=30d).
# green first + stopIfTrue so the highest band that's true wins at the boundaries.
def tiers(col,red_below,green_at):
    rng=f"{col}5:{col}{tlast}"
    tp.conditional_formatting.add(rng,CellIsRule(operator="greaterThanOrEqual",formula=[str(green_at)],stopIfTrue=True,fill=PatternFill("solid",fgColor=GREEN)))
    tp.conditional_formatting.add(rng,CellIsRule(operator="greaterThanOrEqual",formula=[str(red_below)],stopIfTrue=True,fill=PatternFill("solid",fgColor=ORANGE)))
    tp.conditional_formatting.add(rng,CellIsRule(operator="lessThan",formula=[str(red_below)],stopIfTrue=True,fill=PatternFill("solid",fgColor=RED)))
tiers("G",3,4)     # ARPS 48h: <3 red · 3-4 orange · 4+ green
tiers("H",4,6)     # ARPS 7d:  <4 red · 4-6 orange · 6+ green
tiers("I",6,8)     # ARPS 14d: <6 red · 6-8 orange · 8+ green
tiers("J",10,14)   # ARPS 30d: <10 red · 10-14 orange · 14+ green
tp.column_dimensions["A"].width=12
for col in ["B","C","D","E","F","G","H","I","J","L"]: tp.column_dimensions[col].width=12
tp.column_dimensions["K"].width=16; tp.column_dimensions["M"].width=12
tp.freeze_panes="A5"; tp.sheet_view.showGridLines=False; tp.row_dimensions[1].height=24

wb._sheets.sort(key=lambda s:["Weekly Stats","Time to Profit","Weekly History","Data","Cohort","Manual Spend"].index(s.title))
out="/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/ad-tracker/UNCVRD_Weekly.xlsx"
wb.save(out); print("wrote",out,"| creators:",CREATORS)
