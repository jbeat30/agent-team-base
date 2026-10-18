"""README 그림: 공통 레이아웃·한영 문구, PNG 2배 해상도와 SVG 원본"""
from pathlib import Path
from html import escape
from math import atan2, cos, sin, pi
import argparse
from PIL import Image, ImageDraw, ImageFont

BG, NAVY, BLUE, GREEN, LINE, AMBER = '#F5F7FB', '#1A2744', '#3B6FD8', '#15996B', '#D5DBE6', '#E8A33D'
COPY = {
 'ko': {
  'hero': "기존 프로젝트 규칙을 존중하는 Claude Code 에이전트 팀",
  'tag': '요구 충족 · 범위 통제 · 독립 검증', 'user': '사용자', 'main': '메인 세션',
  'lite': 'PM이 직접 호출', 'full': '리더가 하위를 조율, QA는 PM이 직접 호출',
  'legend': ['조율 · 분석 · 검증', '지정 파일 수정'],
  'note': '역할 파일 10종은 항상 설치 · Lite/Full은 설치 시 선택',
  'roles': ['분류 · 대화 · 컨펌 · 검사 · 보고','기획 조율','개발 조율','요구 분해 · 인수 기준','호출처 · 계약 · 영향','화면 · 접근성','서버 · 업무 로직','공유 계약 · 클라이언트','테스트 작성','독립 검증'],
  'gates': ['접수 · 분류','기획','컨펌','개발','독립 검증','최종 보고'],
  'subs': ['', '요구 분해 · 인수 기준 · 영향 분석', '', '승인된 파일만 · 순차 쓰기','검사 기록 원본 · 체크리스트','요구사항별 충족 · 미검증 구분'],
  'skip': 'Q · L1: PM이 직접 처리', 'ask': '승인 필수 항목이 있으면 사용자에게 질문',
  'rework': '실패 항목 재작업 (최대 3회)',
  'bar': '가드 hook: 쓰기 경로 · 호출 대상 검사 │ 검사 실행기: exit code · 시각 · 해시 기록',
  'request': '…/claude-team-base 의 INSTALL.md를 읽고 이 프로젝트에 세팅해줘',
  'install': ['프로젝트 조사','채팅으로 질문','계획 요약 · 확인 1회','스크립트로 적용','보호 장치 점검'],
  'install_sub': ['', 'Lite/Full · Context7 · 금지 영역', '', '기존 파일 보존', '실제 Claude 호출'],
  'end': '새 세션부터 자연어로 요청',
 },
 'en': {
  'hero': "A Claude Code agent team that respects your project's rules",
  'tag': 'Requirements first · Scoped changes · Independent QA', 'user': 'User', 'main': 'main session',
  'lite': 'Called directly by the PM', 'full': 'Leads coordinate; the PM calls QA directly',
  'legend': ['coordinate · analyze · verify','edit assigned files'],
  'note': 'All 10 roles are always installed · Lite/Full is chosen at setup',
  'roles': ['triage · chat · confirm · checks · report','coordinates planning','coordinates build','requirements · acceptance criteria','callers · contracts · impact','UI · accessibility','server · business logic','shared contracts · clients','writes tests','independent verification'],
  'gates': ['Intake · triage','Plan','Confirm','Build','Independent QA','Final report'],
  'subs': ['', 'requirements · acceptance criteria · impact', '', 'approved files only · sequential writes','check records · checklist','per-requirement status · unverified'],
  'skip': 'Q · L1: handled directly by the PM', 'ask': 'Ask the user if approval is required',
  'rework': 'Rework failed items (max 3 rounds)',
  'bar': 'Guard hook: write paths · call targets │ Check runner: exit code · timestamps · hashes',
  'request': 'Read INSTALL.md at …/claude-team-base and set this project up',
  'install': ['Inspect project','Questions in chat','Plan summary · 1 confirmation','Apply via script','Verify guard'],
  'install_sub': ['', 'Lite/Full · Context7 · protected areas', '', 'existing files preserved', 'real Claude call'],
  'end': 'Ask in plain language from the next session',
 }
}
ROLES = ['pm-agent','planning-lead','dev-lead','planner-agent','architecture-agent','frontend-agent','backend-agent','api-agent','test-agent','qa-agent']

class Canvas:
 def __init__(self, w, h, lang, fonts):
  self.w,self.h,self.lang,self.fonts=w,h,lang,fonts
  self.im=Image.new('RGB',(w*2,h*2),BG);self.d=ImageDraw.Draw(self.im)
  self.svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',f'<rect width="{w}" height="{h}" fill="{BG}"/>']
 def font(self,size,bold=False,mono=False):
  path=self.fonts['ko_bold' if bold else 'ko'] if self.lang=='ko' else self.fonts['en']
  if mono and self.lang=='en':path=self.fonts['mono']
  f=ImageFont.truetype(str(path),round(size*2))
  if self.lang=='en' and not mono and hasattr(f,'get_variation_axes'):
   axes=f.get_variation_axes();f.set_variation_by_axes([700 if a['name']==b'Weight' and bold else 400 if a['name']==b'Weight' else a['default'] for a in axes])
  return f
 def box(self,x,y,w,h,fill='white',stroke=LINE,r=14):
  self.d.rounded_rectangle((x*2,y*2,(x+w)*2,(y+h)*2),r*2,fill=fill,outline=stroke,width=3)
  self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
 def text(self,x,y,text,size=24,bold=False,color=NAVY,width=None,mono=False):
  f=self.font(size,bold,mono)
  while width and f.getlength(text)/2>width and size>11:
   size-=1;f=self.font(size,bold,mono)
  if width and f.getlength(text)/2>width:raise ValueError(('text overflow',text))
  assert 0<=x and x+f.getlength(text)/2<=self.w+1,text
  if self.lang=='en' and '│' in text:
   offset=x*2
   for part in text.split('│')[:-1]:
    self.d.text((offset,y*2),part,font=f,fill=color,anchor='lt');offset+=f.getlength(part)
    fallback=ImageFont.truetype(str(self.fonts['ko']),round(size*2))
    self.d.text((offset,y*2),'│',font=fallback,fill=color,anchor='lt');offset+=fallback.getlength('│')
   part=text.split('│')[-1];self.d.text((offset,y*2),part,font=f,fill=color,anchor='lt')
  else:self.d.text((x*2,y*2),text,font=f,fill=color,anchor='lt')
  family='Noto Sans KR' if self.lang=='ko' else ('Consolas' if mono else 'Inter')
  self.svg.append(f'<text x="{x}" y="{y}" dominant-baseline="text-before-edge" font-family="{family}, Noto Sans KR, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(text)}</text>')
 def wrap(self,text,size,width,bold=False,mono=False):
  lines=[];line=''
  for word in text.split(' '):
   new=(line+' '+word).strip()
   if line and self.font(size,bold,mono).getlength(new)/2>width:lines.append(line);line=word
   else:line=new
  if line:lines.append(line)
  return lines
 def card(self,x,y,w,h,title,sub='',color=BLUE,dark=False,size=23,subsize=17):
  self.box(x,y,w,h,NAVY if dark else 'white')
  if not dark:self.box(x,y+15,6,h-30,color,color,3)
  lines=self.wrap(title,size,w-36,True)
  for i,t in enumerate(lines):self.text(x+18,y+17+i*(size+5),t,size,True,'white' if dark else NAVY,w-36)
  top=y+22+len(lines)*(size+5)
  if sub:
   for i,t in enumerate(self.wrap(sub,subsize,w-36)):
    assert top+i*(subsize+6)+subsize<y+h-5,(title,sub)
    self.text(x+18,top+i*(subsize+6),t,subsize,color='white' if dark else NAVY,width=w-36)
 def path(self,points,color=LINE,arrow=True,dash=False):
  pts=[(x*2,y*2) for x,y in points]
  if dash:
   for (x1,y1),(x2,y2) in zip(pts,pts[1:]):
    length=((x2-x1)**2+(y2-y1)**2)**.5
    for d in range(0,int(length),24):
     a=d/max(length,1);b=min(d+12,length)/max(length,1)
     self.d.line((x1+(x2-x1)*a,y1+(y2-y1)*a,x1+(x2-x1)*b,y1+(y2-y1)*b),fill=color,width=4)
  else:self.d.line(pts,fill=color,width=4,joint='curve')
  dashed=' stroke-dasharray="6 6"' if dash else ''
  self.svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{color}" stroke-width="2"{dashed}/>')
  if arrow:
   x,y=points[-1];px,py=points[-2];a=atan2(y-py,x-px)
   head=[(x,y),(x-12*cos(a-pi/6),y-12*sin(a-pi/6)),(x-12*cos(a+pi/6),y-12*sin(a+pi/6))]
   self.d.polygon([(a*2,b*2) for a,b in head],fill=color)
   self.svg.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in head)}" fill="{color}"/>')
 def circle(self,x,y,r,color):
  self.d.ellipse(((x-r)*2,(y-r)*2,(x+r)*2,(y+r)*2),fill=color)
  self.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')
 def curve(self,start,control1,control2,end,color=BLUE):
  points=[]
  for i in range(61):
   t=i/60;u=1-t
   points.append((u**3*start[0]+3*u*u*t*control1[0]+3*u*t*t*control2[0]+t**3*end[0],u**3*start[1]+3*u*u*t*control1[1]+3*u*t*t*control2[1]+t**3*end[1]))
  self.path(points,color)
 def save(self,out,name):
  self.im.save(out/f'{name}.{self.lang}.png',optimize=True)
  (out/f'{name}.{self.lang}.svg').write_text('\n'.join(self.svg+['</svg>']),encoding='utf-8')

def render(out,fonts):
 out.mkdir(parents=True,exist_ok=True)
 for lang,c in COPY.items():
  v=Canvas(2400,900,lang,fonts)
  v.text(110,250,'claude-team-base',100,True,width=1350)
  v.text(114,405,c['hero'],36,width=1380)
  v.box(110,500,1330,90)
  v.text(140,530,c['tag'],27,width=1270)
  circles=[(1640,205,BLUE),(1845,150,BLUE),(2060,210,BLUE),(2160,390,BLUE),(2070,670,GREEN),(1850,735,GREEN),(1640,655,GREEN),(2290,470,BLUE)]
  for x,y,color in circles:v.path([(1830,445),(x,y)],arrow=False)
  for x,y,color in circles:v.circle(x,y,35,color)
  v.circle(1830,445,68,NAVY)
  v.save(out,'hero')

  v=Canvas(2000,1100,lang,fonts)
  v.card(740,20,520,80,c['user'],color=NAVY,size=25)
  for x,caption in [(20,c['lite']),(1010,c['full'])]:
   v.box(x,145,970,870,fill=BG)
   v.text(x+32,170,'Lite' if x==20 else 'Full',29,True)
   v.text(x+32,215,caption,19,width=900)
   v.path([(1000,100),(1000,120),(x+485,120),(x+485,260)])
   v.card(x+120,260,760,104,'pm-agent · '+c['main'],c['roles'][0],dark=True,size=25,subsize=19)
  # Lite의 동일 깊이 실무 7종, 줄바꿈은 계층을 의미하지 않음
  v.path([(505,364),(505,390),(62,390),(62,938)],arrow=False)
  for i,idx in enumerate([3,4,5,6,7,8,9]):
   y=405+i*80;v.path([(62,y+33),(105,y+33)])
   v.box(105,y,820,66);v.box(105,y+12,6,42,GREEN if 5<=idx<=8 else BLUE,GREEN if 5<=idx<=8 else BLUE,3)
   v.text(125,y+20,ROLES[idx],22,True,width=280)
   v.text(425,y+22,c['roles'][idx],17,width=480)
  # Full의 리더 하위 역할과 PM 직속 QA
  for x,idx in [(1040,1),(1360,2),(1680,9)]:
   center=x+145;v.path([(1495,364),(1495,400),(center,400),(center,435)])
   v.card(x,435,290,105,ROLES[idx],c['roles'][idx],size=22,subsize=16)
  for x,indices in [(1040,[3,4]),(1360,[5,6,7,8])]:
   v.path([(x+12,540),(x+12,575+(len(indices)-1)*110+45)],arrow=False)
   for i,idx in enumerate(indices):
    y=575+i*110;v.path([(x+12,y+45),(x+35,y+45)])
    v.card(x+35,y,255,98,ROLES[idx],c['roles'][idx],GREEN if 5<=idx<=8 else BLUE,size=19,subsize=15)
  v.text(35,1045,c['note'],23,width=1120)
  for x,color,t in [(1210,BLUE,c['legend'][0]),(1640,GREEN,c['legend'][1])]:
   v.circle(x,1058,7,color);v.text(x+20,1048,t,19,width=330)
  v.save(out,'agent-team')

  v=Canvas(2000,900,lang,fonts)
  xs=[40+i*325 for i in range(6)]
  for i,x in enumerate(xs):
   if i:v.path([(x-37,205),(x,205)])
   v.card(x,110,288,245,'G'+str(i)+' · '+c['gates'][i],c['subs'][i],AMBER if i==2 else BLUE,size=24,subsize=18)
  v.path([(184,355),(184,430)],dash=True)
  v.card(40,430,530,90,c['skip'],size=21)
  v.path([(305,520),(305,705),(1975,705),(1975,75),(1848,75),(1848,110)],dash=True)
  v.card(690,430,288,130,c['ask'],color=AMBER,size=18)
  v.path([(834,355),(834,430)],color=AMBER)
  v.curve((xs[4]+144,355),(xs[4]+144,690),(xs[3]+144,690),(xs[3]+144,355))
  v.text(1015,650,c['rework'],21,width=850)
  v.box(40,755,1920,95,NAVY,NAVY)
  v.text(75,790,c['bar'],24,color='white',width=1850)
  v.save(out,'task-workflow')

  v=Canvas(2000,700,lang,fonts)
  v.box(40,55,1400,140,stroke=NAVY)
  v.d.polygon([(150*2,194*2),(175*2,220*2),(200*2,194*2)],fill='white')
  v.d.line([(150*2,195*2),(175*2,220*2),(200*2,195*2)],fill=NAVY,width=3)
  v.svg.append(f'<path d="M 150 194 L 175 220 L 200 194" fill="white" stroke="{NAVY}" stroke-width="1.5"/>')
  v.text(75,108,c['request'],27,width=1330,mono=True)
  v.path([(175,220),(175,285)])
  for i in range(5):
   x=40+i*315
   if i:v.path([(x-25,395),(x,395)])
   v.card(x,285,290,210,c['install'][i],c['install_sub'][i],AMBER if i==2 else BLUE,size=24,subsize=18)
  v.path([(1590,395),(1660,395)])
  v.card(1660,285,300,210,c['end'],dark=True,size=25)
  v.save(out,'install-flow')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[2]/'docs/assets');parser.add_argument('--font-en',type=Path,required=True)
 args=parser.parse_args()
 render(args.out,{'ko':Path('C:/Windows/Fonts/NotoSansKR-Regular.otf'),'ko_bold':Path('C:/Windows/Fonts/NotoSansKR-Bold.otf'),'en':args.font_en,'mono':Path('C:/Windows/Fonts/consola.ttf')})
