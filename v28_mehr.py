#!/usr/bin/env python3
"""V28 MEHR: 5 brand-new TikTok videos with fresh clips, enhanced effects."""
import os,shutil,subprocess,sys,math
from PIL import Image,ImageDraw,ImageFont,ImageFilter

W,H=1080,1920; FPS=30
BASE="/Users/work/alltagsengel"
CLIPS=os.path.join(BASE,"_clips_v28")
SRC=os.path.join(BASE,"social-media-grafiken")
SCREENS=os.path.join(BASE,"app-store-screenshots")
OUT=os.path.join(BASE,"social-media-grafiken/tiktok-v28")
TMP=os.path.join(BASE,"_tmp_v28")

GOLD=(201,150,60);GOLD_L=(219,168,74);CREAM=(245,240,230)
WHITE=(255,255,255);RED=(200,60,50);DARK=(13,10,8)

def _f(sz):
    for p in ["/System/Library/Fonts/Supplemental/Georgia.ttf","/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()
def _s(sz):
    for p in ["/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()

FH=_f(68);FHS=_f(52);FB=_s(44);FBB=_s(44);FSM=_s(34);FC=_s(52)
FU=_f(48);FBG=_f(120);FBR=_s(26);FHOOK=_f(74);FNUM=_f(90)

# ── helpers ──
def ease(t):return 1-(1-min(max(t,0),1))**3
def ease_bounce(t):
    t=min(max(t,0),1)
    if t<0.7:return ease(t/0.7)
    return 1+0.15*math.sin((t-0.7)/0.3*math.pi)
def fin(f,s,d=8):
    if f<s:return 0.0
    if f>=s+d:return 1.0
    return ease((f-s)/d)
def sup(f,s,d=10,dist=50):
    if f<s:return dist
    if f>=s+d:return 0
    return int(dist*(1-ease((f-s)/d)))
def col(c,a):return tuple(int(v*a) for v in c)
def pulse(f,s,speed=0.15):
    if f<s:return 1.0
    return 1.0+0.08*math.sin((f-s)*speed)
def darken(img,a=0.42):return Image.blend(img,Image.new("RGB",(W,H),(0,0,0)),1-a)

def grad_bot(img,h=500,op=230):
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    for i in range(h):od.line([(0,H-h+i),(W,H-h+i)],fill=(13,10,8,int(op*(i/h)**1.3)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
def grad_top(img,h=300,op=180):
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    for i in range(h):od.line([(0,i),(W,i)],fill=(13,10,8,int(op*((h-i)/h)**1.3)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
def prep(img):return grad_bot(grad_top(img))

def shtext(d,text,y,font,fill,sh=3):
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+sh,y+sh),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)
    return bb[3]-bb[1]

def shtext_left(d,text,x,y,font,fill,sh=3):
    d.text((x+sh,y+sh),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)
    bb=d.textbbox((0,0),text,font=font);return bb[3]-bb[1]

def logo(d,f):
    a=fin(f,0,15)
    if a<=0:return
    c=col(GOLD,a);bb=d.textbbox((0,0),"AlltagsEngel",font=FBR);tw=bb[2]-bb[0]
    d.text(((W-tw)//2+2,57),"AlltagsEngel",font=FBR,fill=(0,0,0))
    d.text(((W-tw)//2,55),"AlltagsEngel",font=FBR,fill=c)
    d.line([(W//2-60,90),(W//2+60,90)],fill=c,width=1)

def cta(d,f,sf,extra=None):
    a=fin(f,sf,12)
    if a<=0:return
    gc=col(GOLD,a);cc=col(CREAM,a)
    y=H-300;d.line([(W//2-250,y),(W//2+250,y)],fill=gc,width=2);y+=30
    if extra:shtext(d,extra,y,FSM,cc,2);y+=55
    shtext(d,"alltagsengel.care",y,FU,gc,3);y+=70
    shtext(d,"Finde deinen Engel.",y,FSM,cc,2)

def load_screen(name):
    img=Image.open(os.path.join(SCREENS,name)).convert("RGB")
    r=max(W/img.width,H/img.height)
    img=img.resize((int(img.width*r),int(img.height*r)),Image.LANCZOS)
    l=(img.width-W)//2;t=(img.height-H)//2
    return img.crop((l,t,l+W,t+H))

# ── clip extraction ──
_ec=[0]
def ext(clip_name):
    _ec[0]+=1;d=os.path.join(TMP,f"e{_ec[0]}")
    if os.path.exists(d):shutil.rmtree(d)
    os.makedirs(d)
    subprocess.run(["ffmpeg","-y","-i",os.path.join(CLIPS,clip_name),
        "-vf",f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
        os.path.join(d,"f_%05d.png")],capture_output=True,check=True)
    frames=sorted([os.path.join(d,ff) for ff in os.listdir(d) if ff.endswith(".png")])
    print(f"    {clip_name}: {len(frames)}f")
    return frames,d

def vf(frames,idx):return Image.open(frames[idx%len(frames)]).convert("RGB")

# ── extract fresh clips from source REELS ──
def extract_fresh_clips():
    """Extract brand new clips from source videos not used in V27."""
    os.makedirs(CLIPS,exist_ok=True)
    sources = [
        # Short REELS (full 4s clips)
        ("gesellschaft.mp4", os.path.join(SRC,"REELS-gesellschaft-neu.mp4"), 0, 4),
        ("einkauf.mp4", os.path.join(SRC,"REELS-einkauf-neu.mp4"), 0, 4),
        ("spazieren.mp4", os.path.join(SRC,"REELS-spaziergang-neu.mp4"), 0, 4),
        ("cafe.mp4", os.path.join(SRC,"REELS-cafe-freizeit-neu.mp4"), 0, 4),
        ("arztbegleitung.mp4", os.path.join(SRC,"REELS-arztbegleitung-neu.mp4"), 0, 4),
        # From app-promo (31s) - untapped in V27!
        ("app_promo_0s.mp4", os.path.join(SRC,"REELS-app-promo-v1.mp4"), 0, 4),
        ("app_promo_8s.mp4", os.path.join(SRC,"REELS-app-promo-v1.mp4"), 8, 4),
        ("app_promo_16s.mp4", os.path.join(SRC,"REELS-app-promo-v1.mp4"), 16, 4),
        ("app_promo_24s.mp4", os.path.join(SRC,"REELS-app-promo-v1.mp4"), 24, 4),
        # From fahrdienst-promo (31s) - untapped!
        ("fahrdienst_0s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 0, 4),
        ("fahrdienst_10s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 10, 4),
        ("fahrdienst_20s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 20, 4),
        # From kombi-alles-in-einer-app (31s) - untapped!
        ("kombi_0s.mp4", os.path.join(SRC,"REELS-kombi-alles-in-einer-app-v1.mp4"), 0, 4),
        ("kombi_12s.mp4", os.path.join(SRC,"REELS-kombi-alles-in-einer-app-v1.mp4"), 12, 4),
        ("kombi_22s.mp4", os.path.join(SRC,"REELS-kombi-alles-in-einer-app-v1.mp4"), 22, 4),
        # From viral-nomusic at NEW timestamps (12s, 20s, 24s not used in V27)
        ("nomusic_12s.mp4", os.path.join(SRC,"REELS-viral-nomusic-v2.mp4"), 12, 4),
        ("nomusic_20s.mp4", os.path.join(SRC,"REELS-viral-nomusic-v2.mp4"), 20, 4),
        ("nomusic_24s.mp4", os.path.join(SRC,"REELS-viral-nomusic-v2.mp4"), 24, 4),
        # From viral-real at NEW timestamps
        ("real_0s.mp4", os.path.join(SRC,"REELS-viral-real-v1.mp4"), 0, 4),
        ("real_8s.mp4", os.path.join(SRC,"REELS-viral-real-v1.mp4"), 8, 4),
        ("real_16s.mp4", os.path.join(SRC,"REELS-viral-real-v1.mp4"), 16, 4),
        # From viral-v3-dynamic at NEW timestamps
        ("v3_6s.mp4", os.path.join(SRC,"REELS-viral-v3-dynamic.mp4"), 6, 4),
        ("v3_12s.mp4", os.path.join(SRC,"REELS-viral-v3-dynamic.mp4"), 12, 4),
        ("v3_18s.mp4", os.path.join(SRC,"REELS-viral-v3-dynamic.mp4"), 18, 4),
    ]
    for name,src,start,dur in sources:
        out=os.path.join(CLIPS,name)
        if os.path.exists(out):
            print(f"  skip {name}");continue
        print(f"  extracting {name} from {os.path.basename(src)} @{start}s...")
        subprocess.run(["ffmpeg","-y","-ss",str(start),"-i",src,"-t",str(dur),
            "-c:v","libx264","-crf","18","-an",out],capture_output=True,check=True)
    print(f"  ✓ {len(sources)} fresh clips ready in {CLIPS}")

# ═══════════════════════════════════════════════════════════════
# V28a: "POV: Deine Oma ruft an" (13s) — POV-Hook, emotional
# Clips: gesellschaft → cafe → nomusic_12s → real_0s → app
# ═══════════════════════════════════════════════════════════════
def make_v28a():
    total=13*FPS;fd=os.path.join(TMP,"v28a")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V28a clips...")
    c1,t1=ext("gesellschaft.mp4")
    c2,t2=ext("cafe.mp4")
    c3,t3=ext("nomusic_12s.mp4")
    c4,t4=ext("real_0s.mp4")
    app=prep(darken(load_screen("screenshot-1-home.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        # Scene transitions: 0-2s c1, 2-5s c2, 5-8s c3, 8-10s c4, 10-13 app
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.40))
        elif f<5*FPS:
            sub=f-2*FPS
            if sub<12:
                old=prep(darken(vf(c1,len(c1)-1),0.40));new=prep(darken(vf(c2,0),0.38))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,sub),0.38))
        elif f<8*FPS:
            sub=f-5*FPS
            if sub<12:
                old=prep(darken(vf(c2,len(c2)-1),0.38));new=prep(darken(vf(c3,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c3,sub),0.36))
        elif f<10*FPS:
            sub=f-8*FPS
            if sub<12:
                old=prep(darken(vf(c3,len(c3)-1),0.36));new=prep(darken(vf(c4,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c4,sub),0.36))
        else:
            sub=f-10*FPS
            if sub<15:
                v=prep(darken(vf(c4,len(c4)-1),0.35));p=sub/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        # Scene 1: POV Hook (0-2s)
        if f<2*FPS:
            a=fin(f,0,8);o=sup(f,0,10,60)
            shtext(d,"POV:",380+o,FHOOK,col(GOLD,a),5)
            a2=fin(f,6,10);o2=sup(f,6,12,45)
            shtext(d,"Deine Oma ruft an.",490+o2,FHS,col(WHITE,a2),4)
            a3=fin(f,14,10);o3=sup(f,14,12,40)
            shtext(d,"\"Kannst du morgen",600+o3,FB,col(CREAM,a3),3)
            shtext(d,"vorbeikommen?\"",660+o3,FB,col(CREAM,a3),3)
        # Scene 2: Problem (2-5s)
        elif f<5*FPS:
            items=[("Du sagst:",CREAM,FB),("\"Ich hab leider keine Zeit.\"",GOLD_L,FHS),
                   None,("Und legst auf.",CREAM,FB),("Mit schlechtem Gewissen.",RED,FBB)]
            y=440
            for i,item in enumerate(items):
                if item is None:y+=25;continue
                t,c,fn=item;a=fin(f,2*FPS+i*8,10);o=sup(f,2*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
        # Scene 3: Wendung (5-8s)
        elif f<8*FPS:
            items=[("Aber stell dir vor:",GOLD_L,FHS),None,
                   ("Jemand IST da.",WHITE,FH),
                   ("Trinkt Tee mit ihr.",CREAM,FB),
                   ("Hört ihre Geschichten.",CREAM,FB),
                   ("Lacht mit ihr.",CREAM,FB)]
            y=430
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,5*FPS+i*8,10);o=sup(f,5*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
        # Scene 4: Lösung (8-10s)
        elif f<10*FPS:
            items=[("Alltagsbegleitung.",GOLD_L,FH),None,
                   ("Kein Pflegedienst.",CREAM,FB),
                   ("Ein Mensch mit Herz.",WHITE,FBB)]
            y=480
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,8*FPS+i*10,10);o=sup(f,8*FPS+i*10,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+16
        # Scene 5: CTA (10-13s)
        else:
            a=fin(f,10*FPS,10);o=sup(f,10*FPS,12,40)
            shtext(d,"131€/Monat",440+o,FC,col(GOLD,a),4)
            shtext(d,"zahlt die Pflegekasse.",520+o,FB,col(CREAM,a),3)
            cta(d,f,11*FPS,"Oma wartet nicht. Du auch nicht.")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    a:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28b: "3 Zeichen dass dein Elternteil Hilfe braucht" (15s)
# Clips: app_promo_0s → app_promo_8s → einkauf → spazieren → app_promo_16s
# ═══════════════════════════════════════════════════════════════
def make_v28b():
    total=15*FPS;fd=os.path.join(TMP,"v28b")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V28b clips...")
    c1,t1=ext("app_promo_0s.mp4")
    c2,t2=ext("app_promo_8s.mp4")
    c3,t3=ext("einkauf.mp4")
    c4,t4=ext("spazieren.mp4")
    c5,t5=ext("app_promo_16s.mp4")
    app=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.42))
        elif f<5*FPS:
            sub=f-2*FPS
            if sub<12:
                old=prep(darken(vf(c1,len(c1)-1),0.42));new=prep(darken(vf(c2,0),0.40))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,sub),0.40))
        elif f<8*FPS:
            sub=f-5*FPS
            if sub<12:
                old=prep(darken(vf(c2,len(c2)-1),0.40));new=prep(darken(vf(c3,0),0.38))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c3,sub),0.38))
        elif f<11*FPS:
            sub=f-8*FPS
            if sub<12:
                old=prep(darken(vf(c3,len(c3)-1),0.38));new=prep(darken(vf(c4,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c4,sub),0.36))
        elif f<13*FPS:
            sub=f-11*FPS
            if sub<12:
                old=prep(darken(vf(c4,len(c4)-1),0.36));new=prep(darken(vf(c5,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c5,sub),0.36))
        else:
            sub=f-13*FPS
            if sub<15:
                v=prep(darken(vf(c5,len(c5)-1),0.35));p=sub/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        # Hook (0-2s): Big number + question
        if f<2*FPS:
            a=fin(f,0,6);sc=pulse(f,6)
            shtext(d,"3",350,FNUM,col(GOLD,a),6)
            a2=fin(f,5,10);o2=sup(f,5,12,45)
            shtext(d,"Zeichen, dass dein",490+o2,FHS,col(WHITE,a2),4)
            shtext(d,"Elternteil Hilfe braucht",565+o2,FHS,col(WHITE,a2),4)
        # Zeichen 1 (2-5s)
        elif f<5*FPS:
            a0=fin(f,2*FPS,8)
            shtext(d,"1",350,FNUM,col(GOLD,a0),6)
            items=[("Der Kühlschrank",CREAM,FB),("ist immer leer.",CREAM,FB),
                   None,("Früher hat sie für 10",CREAM,FSM),("Leute gekocht.",CREAM,FSM)]
            y=480
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,2*FPS+6+i*7,10);o=sup(f,2*FPS+6+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+10
        # Zeichen 2 (5-8s)
        elif f<8*FPS:
            a0=fin(f,5*FPS,8)
            shtext(d,"2",350,FNUM,col(GOLD,a0),6)
            items=[("Sie geht kaum",CREAM,FB),("noch raus.",CREAM,FB),
                   None,("\"Ich brauch nichts.\"",GOLD_L,FHS),("Sagt sie immer.",CREAM,FSM)]
            y=480
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,5*FPS+6+i*7,10);o=sup(f,5*FPS+6+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+10
        # Zeichen 3 (8-11s)
        elif f<11*FPS:
            a0=fin(f,8*FPS,8)
            shtext(d,"3",350,FNUM,col(GOLD,a0),6)
            items=[("Du rufst an — ",CREAM,FB),("und niemand geht ran.",RED,FBB),
                   None,("Dein Herz rast.",CREAM,FB),("Jedes. Einzelne. Mal.",GOLD_L,FHS)]
            y=480
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,8*FPS+6+i*7,10);o=sup(f,8*FPS+6+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+10
        # Lösung (11-13s)
        elif f<13*FPS:
            items=[("Es gibt eine Lösung.",GOLD_L,FH),None,
                   ("Alltagsbegleitung.",WHITE,FHS),
                   ("Ein Mensch, der regelmäßig",CREAM,FB),
                   ("nach deinen Eltern schaut.",CREAM,FB)]
            y=440
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,11*FPS+i*8,10);o=sup(f,11*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
        # CTA (13-15s)
        else:
            a=fin(f,13*FPS,10);o=sup(f,13*FPS,12,40)
            shtext(d,"131€/Monat",450+o,FC,col(GOLD,a),4)
            shtext(d,"ab Pflegegrad 1",530+o,FB,col(CREAM,a),3)
            cta(d,f,13*FPS+15,"Warte nicht auf Zeichen Nr. 4.")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    b:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28c: "Diese App gibt es wirklich" (12s) — App-Reveal
# Clips: kombi_0s → kombi_12s → nomusic_20s → nomusic_24s → app
# ═══════════════════════════════════════════════════════════════
def make_v28c():
    total=12*FPS;fd=os.path.join(TMP,"v28c")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V28c clips...")
    c1,t1=ext("kombi_0s.mp4")
    c2,t2=ext("kombi_12s.mp4")
    c3,t3=ext("nomusic_20s.mp4")
    c4,t4=ext("nomusic_24s.mp4")
    app=prep(darken(load_screen("screenshot-2-profil.png").filter(ImageFilter.GaussianBlur(18)),0.30))
    appH=load_screen("screenshot-1-home.png")

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.42))
        elif f<5*FPS:
            sub=f-2*FPS
            if sub<12:
                old=prep(darken(vf(c1,len(c1)-1),0.42));new=prep(darken(vf(c2,0),0.38))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,sub),0.38))
        elif f<8*FPS:
            sub=f-5*FPS
            if sub<12:
                old=prep(darken(vf(c2,len(c2)-1),0.38));new=prep(darken(vf(c3,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c3,sub),0.36))
        elif f<10*FPS:
            sub=f-8*FPS
            if sub<12:
                old=prep(darken(vf(c3,len(c3)-1),0.36));new=prep(darken(vf(c4,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c4,sub),0.36))
        else:
            sub=f-10*FPS
            if sub<15:
                v=prep(darken(vf(c4,len(c4)-1),0.35));p=sub/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        # Hook (0-2s): Disbelief
        if f<2*FPS:
            a=fin(f,0,8);o=sup(f,0,10,55)
            shtext(d,"Diese App",420+o,FH,col(GOLD,a),5)
            a2=fin(f,6,10);o2=sup(f,6,12,45)
            shtext(d,"gibt es wirklich.",520+o2,FH,col(WHITE,a2),4)
        # Features (2-5s)
        elif f<5*FPS:
            items=[("Du öffnest die App.",CREAM,FB),
                   ("Wählst: Gesellschaft,",CREAM,FB),
                   ("Einkaufen, Arztbegleitung.",CREAM,FB),
                   None,("Und innerhalb von 48h",GOLD_L,FHS),
                   ("kommt jemand.",GOLD_L,FHS)]
            y=420
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,2*FPS+i*7,10);o=sup(f,2*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        # How it works (5-8s)
        elif f<8*FPS:
            items=[("Geprüfte Alltagsbegleiter.",CREAM,FB),
                   ("Versichert. Zertifiziert.",CREAM,FB),
                   None,("Keine Pflege.",WHITE,FBB),
                   ("Menschliche Nähe.",GOLD_L,FH)]
            y=430
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,5*FPS+i*8,10);o=sup(f,5*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
        # Money (8-10s)
        elif f<10*FPS:
            a=fin(f,8*FPS,8);o=sup(f,8*FPS,12,50)
            shtext(d,"Und das Beste?",430+o,FHS,col(CREAM,a),3)
            a2=fin(f,8*FPS+12,10);o2=sup(f,8*FPS+12,12,40)
            shtext(d,"131€/Monat",540+o2,FBG,col(GOLD,a2),5)
            a3=fin(f,8*FPS+22,10);o3=sup(f,8*FPS+22,12,35)
            shtext(d,"zahlt deine Pflegekasse.",670+o3,FB,col(CREAM,a3),3)
            shtext(d,"Ab Pflegegrad 1.",730+o3,FSM,col(CREAM,a3),2)
        # CTA (10-12s)
        else:
            items=[("AlltagsEngel",GOLD,FH),("— die App für",CREAM,FB),
                   ("Alltagsbegleitung.",GOLD_L,FHS)]
            y=430
            for i,(t,c,fn) in enumerate(items):
                a=fin(f,10*FPS+i*8,10);o=sup(f,10*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
            cta(d,f,10*FPS+20,"Jetzt herunterladen. Kostenlos.")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    c:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28d: "20€/Stunde — dein sinnvollster Nebenjob" (14s) — Recruiting
# Clips: fahrdienst_0s → fahrdienst_10s → real_8s → v3_6s → fahrdienst_20s
# ═══════════════════════════════════════════════════════════════
def make_v28d():
    total=14*FPS;fd=os.path.join(TMP,"v28d")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V28d clips...")
    c1,t1=ext("fahrdienst_0s.mp4")
    c2,t2=ext("fahrdienst_10s.mp4")
    c3,t3=ext("real_8s.mp4")
    c4,t4=ext("v3_6s.mp4")
    c5,t5=ext("fahrdienst_20s.mp4")
    app=prep(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.42))
        elif f<5*FPS:
            sub=f-2*FPS
            if sub<12:
                old=prep(darken(vf(c1,len(c1)-1),0.42));new=prep(darken(vf(c2,0),0.38))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,sub),0.38))
        elif f<8*FPS:
            sub=f-5*FPS
            if sub<12:
                old=prep(darken(vf(c2,len(c2)-1),0.38));new=prep(darken(vf(c3,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c3,sub),0.36))
        elif f<11*FPS:
            sub=f-8*FPS
            if sub<12:
                old=prep(darken(vf(c3,len(c3)-1),0.36));new=prep(darken(vf(c4,0),0.38))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c4,sub),0.38))
        else:
            sub=f-11*FPS
            if sub<12:
                old=prep(darken(vf(c4,len(c4)-1),0.38));new=prep(darken(vf(c5,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            elif sub<2*FPS:bg=prep(darken(vf(c5,sub),0.36))
            else:
                if sub<2*FPS+15:
                    v=prep(darken(vf(c5,len(c5)-1),0.35));p2=(sub-2*FPS)/15;p2=p2*p2*(3-2*p2)
                    bg=Image.blend(v,app,p2)
                else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        # Hook (0-2s): Money + Sinn
        if f<2*FPS:
            a=fin(f,0,6);o=sup(f,0,10,55)
            shtext(d,"20€/Stunde",400+o,FBG,col(GOLD,a),6)
            a2=fin(f,6,10);o2=sup(f,6,12,45)
            shtext(d,"Dein sinnvollster",560+o2,FHS,col(WHITE,a2),4)
            shtext(d,"Nebenjob.",640+o2,FHS,col(WHITE,a2),4)
        # Was du machst (2-5s)
        elif f<5*FPS:
            items=[("Du gehst spazieren.",CREAM,FB),
                   ("Du trinkst Kaffee.",CREAM,FB),
                   ("Du hörst zu.",CREAM,FB),
                   None,
                   ("Mit einem älteren Menschen,",GOLD_L,FHS),
                   ("der genau das braucht.",GOLD_L,FHS)]
            y=420
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,2*FPS+i*7,10);o=sup(f,2*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        # Warum besonders (5-8s)
        elif f<8*FPS:
            items=[("Kein Stress. Kein Büro.",CREAM,FB),
                   ("Keine Pflege.",CREAM,FB),
                   None,
                   ("Flexible Zeiten.",GOLD_L,FHS),
                   ("Echte Dankbarkeit.",GOLD_L,FHS),
                   ("Und ein gutes Gefühl.",WHITE,FBB)]
            y=420
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,5*FPS+i*7,10);o=sup(f,5*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        # Wer kann das (8-11s)
        elif f<11*FPS:
            items=[("Wer kann Engel werden?",GOLD,FH),None,
                   ("Studenten. Rentner.",CREAM,FB),
                   ("Hausfrauen. Schichtarbeiter.",CREAM,FB),
                   None,
                   ("Jeder mit Herz",WHITE,FBB),
                   ("und 2-3 Stunden/Woche.",WHITE,FBB)]
            y=400
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,8*FPS+i*7,10);o=sup(f,8*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        # CTA (11-14s)
        else:
            a=fin(f,11*FPS,10);o=sup(f,11*FPS,12,40)
            shtext(d,"Werde AlltagsEngel.",450+o,FH,col(GOLD,a),4)
            a2=fin(f,11*FPS+12,10);o2=sup(f,11*FPS+12,12,35)
            shtext(d,"Verdiene Geld",560+o2,FB,col(CREAM,a2),3)
            shtext(d,"mit Menschlichkeit.",620+o2,FBB,col(WHITE,a2),3)
            cta(d,f,12*FPS,"alltagsengel.care — Jetzt bewerben")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    d:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28e: "Stell dir vor: Oma lächelt wieder" (15s) — Emotional
# Clips: real_16s → v3_12s → v3_18s → arztbegleitung → kombi_22s
# ═══════════════════════════════════════════════════════════════
def make_v28e():
    total=15*FPS;fd=os.path.join(TMP,"v28e")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V28e clips...")
    c1,t1=ext("real_16s.mp4")
    c2,t2=ext("v3_12s.mp4")
    c3,t3=ext("v3_18s.mp4")
    c4,t4=ext("arztbegleitung.mp4")
    c5,t5=ext("kombi_22s.mp4")
    app=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.45))
        elif f<5*FPS:
            sub=f-2*FPS
            if sub<12:
                old=prep(darken(vf(c1,len(c1)-1),0.45));new=prep(darken(vf(c2,0),0.40))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,sub),0.40))
        elif f<8*FPS:
            sub=f-5*FPS
            if sub<12:
                old=prep(darken(vf(c2,len(c2)-1),0.40));new=prep(darken(vf(c3,0),0.38))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c3,sub),0.38))
        elif f<11*FPS:
            sub=f-8*FPS
            if sub<12:
                old=prep(darken(vf(c3,len(c3)-1),0.38));new=prep(darken(vf(c4,0),0.36))
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            elif sub<45:bg=prep(darken(vf(c4,sub),0.36))
            else:
                if sub<57:
                    old=prep(darken(vf(c4,sub),0.36));new=prep(darken(vf(c5,0),0.36))
                    p=(sub-45)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c5,sub-45),0.36))
        else:
            sub=f-11*FPS
            if sub<15:
                v=prep(darken(vf(c5,len(c5)-1),0.35));p=sub/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        # Hook (0-2s): Emotional future
        if f<2*FPS:
            a=fin(f,0,8);o=sup(f,0,10,55)
            shtext(d,"Stell dir vor:",420+o,FHS,col(CREAM,a),4)
            a2=fin(f,6,10);o2=sup(f,6,12,45)
            shtext(d,"Oma lächelt wieder.",530+o2,FH,col(GOLD,a2),5)
        # Problem: Warum sie nicht lächelt (2-5s)
        elif f<5*FPS:
            items=[("Seit Wochen redet sie kaum.",CREAM,FB),
                   ("Sitzt am Fenster.",CREAM,FB),
                   ("Wartet.",RED,FBB),
                   None,
                   ("Auf was eigentlich?",GOLD_L,FHS),
                   ("Auf jemanden.",WHITE,FBB)]
            y=430
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,2*FPS+i*7,10);o=sup(f,2*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        # Wendung: Jemand kommt (5-8s)
        elif f<8*FPS:
            items=[("Dann klingelt es.",CREAM,FB),
                   None,
                   ("Ein AlltagsEngel.",GOLD_L,FH),
                   None,
                   ("Geht mit ihr spazieren.",CREAM,FB),
                   ("Kocht zusammen.",CREAM,FB),
                   ("Erzählt. Lacht. Lebt.",GOLD_L,FHS)]
            y=400
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,5*FPS+i*7,10);o=sup(f,5*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        # Emotional Peak (8-11s)
        elif f<11*FPS:
            items=[("Nach 2 Wochen",CREAM,FB),
                   ("ruft sie DICH an:",CREAM,FB),
                   None,
                   ("\"Du, der nette Herr",GOLD_L,FHS),
                   ("war heute wieder da.\"",GOLD_L,FHS),
                   None,
                   ("Und du hörst:",CREAM,FB),
                   ("Sie lächelt.",WHITE,FH)]
            y=380
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,8*FPS+i*7,10);o=sup(f,8*FPS+i*7,10,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+10
        # CTA (11-15s)
        else:
            items=[("Alltagsbegleitung",GOLD_L,FH),
                   ("verändert Leben.",WHITE,FH),
                   None,
                   ("131€/Monat.",GOLD,FC),
                   ("Pflegekasse zahlt.",CREAM,FB)]
            y=400
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,11*FPS+i*8,10);o=sup(f,11*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
            cta(d,f,13*FPS,"Gib ihr einen Grund zu lächeln.")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    e:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══ ENCODER + MAIN ═══
def encode(fd,name,total):
    out=os.path.join(OUT,name)
    subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",os.path.join(fd,"frame_%05d.png"),
        "-frames:v",str(total),"-c:v","libx264","-pix_fmt","yuv420p","-crf","18",
        "-preset","medium","-movflags","+faststart",out],check=True,capture_output=True)
    mb=os.path.getsize(out)/1024/1024
    print(f"  ✓ {name} ({total/FPS:.0f}s, {mb:.1f}MB)")

def main():
    sys.stdout=open(sys.stdout.fileno(),mode='w',buffering=1)
    os.makedirs(TMP,exist_ok=True);os.makedirs(OUT,exist_ok=True)
    
    print("🎬 Extracting fresh clips...")
    extract_fresh_clips()
    
    videos = [
        ("V28a_pov_oma_ruft_an.mp4", make_v28a),
        ("V28b_3_zeichen.mp4", make_v28b),
        ("V28c_diese_app_gibt_es.mp4", make_v28c),
        ("V28d_20euro_nebenjob.mp4", make_v28d),
        ("V28e_oma_laechelt_wieder.mp4", make_v28e),
    ]
    for name,fn in videos:
        print(f"\n🎬 {name}")
        fd,total=fn();encode(fd,name,total);shutil.rmtree(fd)
    shutil.rmtree(TMP,ignore_errors=True)
    print("\n✅ All 5 V28 videos done!")

if __name__=="__main__":main()
