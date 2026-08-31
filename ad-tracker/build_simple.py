#!/usr/bin/env python3
"""UNCVRD_Daily_Stats.xlsx — ONE simple editable table.
Columns exactly as the boss wants. Clicks/Fans/Spend/Revenue are plain numbers you
can click and type over; the rest (Cost/Fan, CPC, CVR, LTV, ROAS, Profit) calculate.
Pre-filled with real numbers; no scripts, no live links — just a sheet that works.
"""
import csv, datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule

BAND="5B43F5"; HEAD="1F2430"; WHITE="FFFFFF"; MUTE="6B7280"
RAW="FFFDF5"; CALC="F1F2F7"; GREEN="E6F7EC"; RED="FCEAEA"
thin=Side(style="thin",color="D9DCE3"); border=Border(left=thin,right=thin,top=thin,bottom=thin)
CUR='$#,##0.00'; INT='#,##0'; PCT='0.0%'; MUL='0.00"x"'

def st(c,*,bold=False,size=11,color="111111",fill=None,align="center",fmt=None,bd=True):
    c.font=Font(bold=bold,size=size,color=color); c.alignment=Alignment(horizontal=align,vertical="center")
    if fill: c.fill=PatternFill("solid",fgColor=fill)
    if fmt: c.number_format=fmt
    if bd: c.border=border

# ---- read the pre-fill numbers ----
rows=[]
with open("/tmp/flat.csv") as f:
    r=csv.reader(f); next(r)
    for x in r:
        if len(x)<9: continue
        date,plat=x[0],x[1]
        try: clicks=int(float(x[2] or 0)); fans=int(float(x[3] or 0)); spend=float(x[4] or 0); rev=float(x[8] or 0)
        except: continue
        if clicks or fans or rev or spend:           # only days with activity → short + readable
            rows.append((date,plat,clicks,fans,spend,rev))
# already newest-first from the server; keep that order

wb=Workbook(); ws=wb.active; ws.title="Daily Stats"
HEADERS=["Date","Platform","Clicks","Fans","Spend","Cost Per Fan","CPC","CVR",
         "Attributed Revenue","Total Link LTV","ROAS","Agency Profit"]
ws.merge_cells("A1:L1")
st(ws.cell(1,1,"UNCVRD — DAILY STATS   (type over any blue number; the grey ones calculate)"),
   bold=True,size=14,color=WHITE,fill=BAND,align="left",bd=False)
for j,h in enumerate(HEADERS,start=1):
    st(ws.cell(2,j,h),bold=True,color=WHITE,fill=HEAD)

# column letters: A Date B Platform C Clicks D Fans E Spend F Cost/Fan G CPC H CVR I Rev J LTV K ROAS L Profit
r=3
for (date,plat,clicks,fans,spend,rev) in rows:
    st(ws.cell(r,1,date)); st(ws.cell(r,2,plat),align="left")
    st(ws.cell(r,3,clicks),fmt=INT,fill=RAW)                      # editable
    st(ws.cell(r,4,fans),fmt=INT,fill=RAW)                       # editable
    st(ws.cell(r,5,spend),fmt=CUR,fill=RAW)                      # editable
    st(ws.cell(r,6,f'=IFERROR(E{r}/D{r},"")'),fmt=CUR,fill=CALC)   # Cost per Fan
    st(ws.cell(r,7,f'=IFERROR(E{r}/C{r},"")'),fmt=CUR,fill=CALC)   # CPC
    st(ws.cell(r,8,f'=IFERROR(D{r}/C{r},"")'),fmt=PCT,fill=CALC)   # CVR
    st(ws.cell(r,9,rev),fmt=CUR,fill=RAW)                        # editable
    st(ws.cell(r,10,f'=IFERROR(I{r}/D{r},"")'),fmt=CUR,fill=CALC)  # LTV
    st(ws.cell(r,11,f'=IFERROR(I{r}/E{r},"")'),fmt=MUL,fill=CALC)  # ROAS
    st(ws.cell(r,12,f'=I{r}-E{r}'),fmt=CUR,fill=CALC)             # Agency Profit
    r+=1
last=r-1

# light colour cues for comparison: CVR green>=25% red<25% ; CPC red>$0.70
if last>=3:
    ws.conditional_formatting.add(f"H3:H{last}",CellIsRule(operator="greaterThanOrEqual",formula=["0.25"],fill=PatternFill("solid",fgColor=GREEN)))
    ws.conditional_formatting.add(f"H3:H{last}",CellIsRule(operator="lessThan",formula=["0.25"],fill=PatternFill("solid",fgColor=RED)))
    ws.conditional_formatting.add(f"G3:G{last}",CellIsRule(operator="greaterThan",formula=["0.7"],fill=PatternFill("solid",fgColor=RED)))

ws.column_dimensions["A"].width=12; ws.column_dimensions["B"].width=12
for col in ["C","D","E","F","G","H","J","K","L"]: ws.column_dimensions[col].width=11
ws.column_dimensions["I"].width=15
ws.freeze_panes="A3"; ws.sheet_view.showGridLines=False; ws.row_dimensions[1].height=24

out="/Users/christofispapadopoulos/Downloads/creator-hub-dashboard-main/ad-tracker/UNCVRD_Daily_Stats.xlsx"
wb.save(out); print("wrote",out,"|",last-2,"rows of real data")
