#!/usr/bin/env python3
"""V29 KRANKENFAHRTEN: Aufklärung für Kunden + Fahrer — emotional engine."""
import os,shutil,subprocess,sys,math
from PIL import Image,ImageDraw,ImageFont,ImageFilter

W,H=1080,1920; FPS=30
BASE="/Users/work/alltagsengel"
CLIPS=os.path.join(BASE,"_clips_v29")
SRC=os.path.join(BASE,"social-media-grafiken")
NK2=os.path.join(SRC,"neue-kampagne-2")
SCREENS=os.path.join(BASE,"app-store-screenshots")
OUT=os.path.join(BASE,"social-media-grafiken/tiktok-v29")
TMP=os.path.join(BASE,"_tmp_v29")

GOLD=(201,150,60);GOLD_L=(219,168,74);CREAM=(245,240,230)
WHITE=(255,255,255);RED=(220,50,40);DARK=(13,10,8)
BLUE=(60,130,200);GREEN=(50,180,80)

def _f(sz):
    for p in ["/System/Library/Fonts/Supplemental/Georgia.ttf","/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()
def _s(sz):
    for p in ["/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()

FH=_f(72);FHS=_f(56);FB=_s(46);FBB=_s(46);FSM=_s(36);FC=_s(56)
FU=_f(50);FBG=_f(130);FBR=_s(28);FHOOK=_f(80);FNUM=_f(100)
FIMPACT=_f(140);FQUOTE=_f(60)

def ease(t):return 1-(1-min(max(t,0),1))**3
def ease_elastic(t):
    t=min(max(t,0),1)
    if t==0 or t==1:return t
    return 2**(-10*t)*math.sin((t-0.1)*5*math.pi)+1
def fin(f,s,d=8):
    if f<s:return 0.0
    if f>=s+d:return 1.0
    return ease((f-s)/d)
def sup(f,s,d=10,dist=50):
    if f<s:return dist
    if f>=s+d:return 0
    return int(dist*(1-ease((f-s)/d)))
def col(c,a):return tuple(max(0,min(255,int(v*a))) for v in c)

def zoom_crop(img,z):
    nw,nh=int(W/z),int(H/z)
    l=(img.width-nw)//2;t=(img.height-nh)//2
    return img.crop((max(0,l),max(0,t),min(img.width,l+nw),min(img.height,t+nh))).resize((W,H),Image.LANCZOS)
def flash(bg,f,start,dur=6):
    if f<start or f>=start+dur:return bg
    a=(1-(f-start)/dur)**2
    return Image.blend(bg,Image.new("RGB",(W,H),(255,255,255)),a*0.85)
def red_vignette(bg,f,start,dur=20):
    if f<start or f>=start+dur:return bg
    t=(f-start)/dur;intensity=math.sin(t*math.pi)*0.15
    return Image.blend(bg,Image.new("RGB",(W,H),(180,20,10)),intensity)
def darken(img,a=0.42):return Image.blend(img,Image.new("RGB",(W,H),(0,0,0)),1-a)

def grad_bot(img,h=550,op=240):
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    for i in range(h):od.line([(0,H-h+i),(W,H-h+i)],fill=(13,10,8,int(op*(i/h)**1.5)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
def grad_top(img,h=350,op=200):
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    for i in range(h):od.line([(0,i),(W,i)],fill=(13,10,8,int(op*((h-i)/h)**1.5)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
def prep(img):return grad_bot(grad_top(img))

def shtext(d,text,y,font,fill,sh=3,glow=False):
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    if glow:
        for dx in range(-2,3):
            for dy in range(-2,3):
                d.text((x+dx,y+dy),text,font=font,fill=(fill[0]//3,fill[1]//3,fill[2]//3))
    d.text((x+sh,y+sh),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)
    return bb[3]-bb[1]

def impact_text(d,text,y_target,font_big,font_final,fill,f,start,settle=12):
    if f<start:return 0
    t=min((f-start)/settle,1.0)
    font=font_big if t<0.3 else font_final
    a=min(t*3,1.0)
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+4,y_target+4),text,font=font,fill=(0,0,0))
    d.text((x,y_target),text,font=font,fill=col(fill,a))
    return bb[3]-bb[1]

def counter_text(d,target,prefix,suffix,y,font,fill,f,start,dur=20):
    if f<start:return
    t=min((f-start)/dur,1.0);t=ease(t);val=int(target*t)
    text=f"{prefix}{val}{suffix}"
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+4,y+4),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)

def accent_line(d,f,start,y,w=400):
    a=fin(f,start,8)
    if a<=0:return
    prog=ease(min((f-start)/15,1.0));hw=int(w*prog/2)
    d.line([(W//2-hw,y),(W//2+hw,y)],fill=col(GOLD,a),width=2)

def logo(d,f):
    a=fin(f,0,12)
    if a<=0:return
    c=col(GOLD,a);bb=d.textbbox((0,0),"AlltagsEngel",font=FBR);tw=bb[2]-bb[0]
    d.text(((W-tw)//2+2,57),"AlltagsEngel",font=FBR,fill=(0,0,0))
    d.text(((W-tw)//2,55),"AlltagsEngel",font=FBR,fill=c)
    d.line([(W//2-60,88),(W//2+60,88)],fill=c,width=1)

def cta(d,f,sf,extra=None):
    a=fin(f,sf,10)
    if a<=0:return
    gc=col(GOLD,a);cc=col(CREAM,a)
    y=H-310;d.line([(W//2-280,y),(W//2+280,y)],fill=gc,width=2);y+=30
    if extra:shtext(d,extra,y,FSM,cc,2);y+=55
    shtext(d,"alltagsengel.care",y,FU,gc,3,glow=True);y+=70
    shtext(d,"Jetzt starten.",y,FSM,cc,2)

def load_screen(name):
    img=Image.open(os.path.join(SCREENS,name)).convert("RGB")
    r=max(W/img.width,H/img.height)
    img=img.resize((int(img.width*r),int(img.height*r)),Image.LANCZOS)
    l=(img.width-W)//2;t=(img.height-H)//2
    return img.crop((l,t,l+W,t+H))

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

# ── Extract Krankenfahrten clips ──
def extract_clips():
    os.makedirs(CLIPS,exist_ok=True)
    sources = [
        # fahrdienst-promo (31s) — car/driving footage
        ("fahr_0s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 0, 4),
        ("fahr_5s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 5, 4),
        ("fahr_12s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 12, 4),
        ("fahr_18s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 18, 4),
        ("fahr_24s.mp4", os.path.join(SRC,"REELS-fahrdienst-promo-v1.mp4"), 24, 4),
        # fahrdienst-walkthrough (15s) — app walkthrough
        ("fwalk_0s.mp4", os.path.join(SRC,"REELS-fahrdienst-walkthrough.mp4"), 0, 4),
        ("fwalk_5s.mp4", os.path.join(SRC,"REELS-fahrdienst-walkthrough.mp4"), 5, 4),
        ("fwalk_10s.mp4", os.path.join(SRC,"REELS-fahrdienst-walkthrough.mp4"), 10, 4),
        # FINAL-krankenfahrten (28s) — real footage
        ("kf_0s.mp4", os.path.join(NK2,"FINAL-krankenfahrten.mp4"), 0, 4),
        ("kf_6s.mp4", os.path.join(NK2,"FINAL-krankenfahrten.mp4"), 6, 4),
        ("kf_12s.mp4", os.path.join(NK2,"FINAL-krankenfahrten.mp4"), 12, 4),
        ("kf_18s.mp4", os.path.join(NK2,"FINAL-krankenfahrten.mp4"), 18, 4),
        ("kf_22s.mp4", os.path.join(NK2,"FINAL-krankenfahrten.mp4"), 22, 4),
        # REEL-krankenfahrten (12s)
        ("rkf_0s.mp4", os.path.join(NK2,"REEL-krankenfahrten.mp4"), 0, 4),
        ("rkf_4s.mp4", os.path.join(NK2,"REEL-krankenfahrten.mp4"), 4, 4),
        ("rkf_8s.mp4", os.path.join(NK2,"REEL-krankenfahrten.mp4"), 8, 4),
        # Arztbegleitung (4s)
        ("arzt.mp4", os.path.join(SRC,"REELS-arztbegleitung-neu.mp4"), 0, 4),
        # nordend-fahrer (16s) — driver focused
        ("nord_0s.mp4", os.path.join(NK2,"V8-nordend-fahrer.mp4"), 0, 4),
        ("nord_6s.mp4", os.path.join(NK2,"V8-nordend-fahrer.mp4"), 6, 4),
        ("nord_12s.mp4", os.path.join(NK2,"V8-nordend-fahrer.mp4"), 12, 4),
        # krankenfahrt-animated (18s) — animated/explained
        ("kanim_0s.mp4", os.path.join(SRC,"REELS-krankenfahrt-animated.mp4"), 0, 4),
        ("kanim_6s.mp4", os.path.join(SRC,"REELS-krankenfahrt-animated.mp4"), 6, 4),
        ("kanim_12s.mp4", os.path.join(SRC,"REELS-krankenfahrt-animated.mp4"), 12, 4),
    ]
    for name,src,start,dur in sources:
        out=os.path.join(CLIPS,name)
        if os.path.exists(out):print(f"  skip {name}");continue
        print(f"  extracting {name} from {os.path.basename(src)} @{start}s...")
        subprocess.run(["ffmpeg","-y","-ss",str(start),"-i",src,"-t",str(dur),
            "-c:v","libx264","-crf","18","-an",out],capture_output=True,check=True)
    print(f"  ✓ {len(sources)} clips ready")

# ═══════════════════════════════════════════════════════════════
# V29a: KUNDEN — "Dein Arzttermin. Deine Fahrt. 0€." (13s)
# Aufklärung: Krankenkasse zahlt Krankenfahrten
# ═══════════════════════════════════════════════════════════════
def make_v29a():
    total=13*FPS;fd=os.path.join(TMP,"v29a")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V29a clips...")
    c1,t1=ext("kf_0s.mp4")
    c2,t2=ext("fahr_0s.mp4")
    c3,t3=ext("arzt.mp4")
    c4,t4=ext("kf_6s.mp4")
    app=prep(darken(load_screen("screenshot-1-home.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.0015*f
        if f<int(1.5*FPS):bg=zoom_crop(darken(vf(c1,f),0.42),zf);bg=prep(bg)
        elif f<int(4*FPS):
            sub=f-int(1.5*FPS);bg=zoom_crop(darken(vf(c2,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(1.5*FPS),4)
        elif f<int(7*FPS):
            sub=f-int(4*FPS);bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(4*FPS),4)
        elif f<int(10*FPS):
            sub=f-int(7*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(7*FPS),4)
        else:
            sub=f-int(10*FPS)
            if sub<10:v=prep(darken(vf(c4,len(c4)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-1.5s)
        if f<int(1.5*FPS):
            impact_text(d,"0€",320,FIMPACT,FBG,GOLD,f,0,12)
            a2=fin(f,8,8);o2=sup(f,8,10,50)
            shtext(d,"für deine Fahrt zum Arzt.",520+o2,FHS,col(WHITE,a2),4)

        # WAS KAUM JEMAND WEISS (1.5-4s)
        elif f<int(4*FPS):
            sf=int(1.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Was kaum jemand weiß:",420+o,FHS,col(CREAM,a),4)
            accent_line(d,f,sf+12,510)
            a2=fin(f,sf+14,6);o2=sup(f,sf+14,8,40)
            shtext(d,"Deine Krankenkasse",540+o2,FB,col(WHITE,a2),3)
            shtext(d,"zahlt Krankenfahrten.",600+o2,FBB,col(GOLD_L,a2),3)
            accent_line(d,f,sf+24,680)
            a3=fin(f,sf+28,8);o3=sup(f,sf+28,10,35)
            shtext(d,"Zum Arzt. Zur Therapie.",710+o3,FB,col(CREAM,a3),3)
            shtext(d,"Zur Dialyse. Zur Reha.",770+o3,FB,col(CREAM,a3),3)

        # WER HAT ANSPRUCH (4-7s)
        elif f<int(7*FPS):
            sf=int(4*FPS)
            impact_text(d,"Wer hat Anspruch?",400,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,510)
            items=[("Ab Pflegegrad 3",CREAM,FB),("oder mit Schwerbehinderung",CREAM,FB),
                   ("oder Verordnung vom Arzt.",CREAM,FB),None,
                   ("Auch Chemo, Bestrahlung,",GOLD_L,FHS),("Dialyse — alles dabei.",GOLD_L,FHS)]
            y=540
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,sf+14+i*6,6);o=sup(f,sf+14+i*6,8,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+10

        # SO EINFACH (7-10s)
        elif f<int(10*FPS):
            sf=int(7*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"So einfach geht's:",420+o,FH,col(GOLD,a),4)
            accent_line(d,f,sf+10,510)
            items=[("1. App öffnen",WHITE,FHS),("2. Krankenfahrt buchen",WHITE,FHS),
                   ("3. Fahrer kommt zu dir",WHITE,FHS),None,
                   ("Pünktlich. Zuverlässig.",GOLD_L,FB),("Direkt vor deine Tür.",GOLD_L,FB)]
            y=540
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a2=fin(f,sf+14+i*6,6);o2=sup(f,sf+14+i*6,8,30)
                if a2<=0:continue
                y+=shtext(d,t,y+o2,fn,col(c,a2),3)+10

        # CTA (10-13s)
        else:
            sf=int(10*FPS)
            impact_text(d,"Krankenfahrt",400,FIMPACT,FH,GOLD,f,sf,14)
            a2=fin(f,sf+10,8)
            shtext(d,"mit AlltagsEngel.",530,FHS,col(WHITE,a2),4)
            accent_line(d,f,sf+16,610)
            a3=fin(f,sf+20,8)
            shtext(d,"Krankenkasse zahlt.",640,FB,col(CREAM,a3),3)
            cta(d,f,sf+24,"Jetzt Fahrt buchen — kostenlos.")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    a:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V29b: KUNDEN — "Oma muss zur Dialyse. Wer fährt?" (15s)
# Emotional: Familien-Struggle + Lösung
# ═══════════════════════════════════════════════════════════════
def make_v29b():
    total=15*FPS;fd=os.path.join(TMP,"v29b")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V29b clips...")
    c1,t1=ext("kf_12s.mp4")
    c2,t2=ext("rkf_0s.mp4")
    c3,t3=ext("fahr_12s.mp4")
    c4,t4=ext("kanim_0s.mp4")
    c5,t5=ext("kf_18s.mp4")
    app=prep(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):bg=zoom_crop(darken(vf(c1,f),0.45),zf);bg=prep(bg)
        elif f<int(5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.40),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
            bg=red_vignette(bg,f,int(3*FPS),int(1.5*FPS))
        elif f<int(8*FPS):
            sub=f-int(5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5*FPS),4)
        elif f<int(11*FPS):
            sub=f-int(8*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(8*FPS),4)
        elif f<int(13*FPS):
            sub=f-int(11*FPS);bg=zoom_crop(darken(vf(c5,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(11*FPS),4)
        else:
            sub=f-int(13*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s)
        if f<int(2*FPS):
            a=fin(f,0,6);o=sup(f,0,8,50)
            shtext(d,"Oma muss zur Dialyse.",420+o,FHS,col(CREAM,a),4)
            impact_text(d,"Wer fährt?",530,FIMPACT,FH,GOLD,f,8,12)

        # PROBLEM (2-5s)
        elif f<int(5*FPS):
            sf=int(2*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"3x pro Woche.",430+o,FHS,col(WHITE,a),4)
            a2=fin(f,sf+12,6);o2=sup(f,sf+12,8,45)
            shtext(d,"Morgens um 7.",520+o2,FHS,col(WHITE,a2),4)
            accent_line(d,f,sf+20,610)
            a3=fin(f,sf+22,8);o3=sup(f,sf+22,10,40)
            shtext(d,"Du arbeitest.",640+o3,FB,col(CREAM,a3),3)
            a4=fin(f,sf+30,8);o4=sup(f,sf+30,10,40)
            shtext(d,"Dein Bruder wohnt weit weg.",710+o4,FB,col(CREAM,a4),3)
            a5=fin(f,sf+38,8);o5=sup(f,sf+38,10,45)
            shtext(d,"Taxi? Unbezahlbar.",790+o5,FBB,col(RED,a5),3,glow=True)

        # AUFKLÄRUNG (5-8s)
        elif f<int(8*FPS):
            sf=int(5*FPS)
            impact_text(d,"Aber:",380,FIMPACT,FH,GOLD,f,sf,10)
            accent_line(d,f,sf+8,490)
            a2=fin(f,sf+10,6);o2=sup(f,sf+10,8,40)
            shtext(d,"Dialysefahrten werden",520+o2,FB,col(CREAM,a2),3)
            shtext(d,"von der Krankenkasse",580+o2,FB,col(CREAM,a2),3)
            a3=fin(f,sf+18,8);o3=sup(f,sf+18,10,45)
            shtext(d,"KOMPLETT bezahlt.",650+o3,FH,col(GOLD,a3),4,glow=True)
            accent_line(d,f,sf+28,740)
            a4=fin(f,sf+30,8);o4=sup(f,sf+30,10,35)
            shtext(d,"Auch Chemo. Bestrahlung.",770+o4,FB,col(CREAM,a4),3)
            shtext(d,"Regelmäßige Therapie.",830+o4,FB,col(CREAM,a4),3)

        # WIE (8-11s)
        elif f<int(11*FPS):
            sf=int(8*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"So funktioniert's:",420+o,FH,col(GOLD,a),4)
            accent_line(d,f,sf+10,510)
            items=[("Arzt stellt Verordnung aus.",CREAM,FB),
                   ("Du buchst über die App.",WHITE,FHS),
                   ("Fahrer holt dich ab.",WHITE,FHS),None,
                   ("Pünktlich.",GOLD_L,FBB),("Vor der Haustür.",GOLD_L,FBB),
                   ("Und bringt dich zurück.",CREAM,FB)]
            y=540
            for i,item in enumerate(items):
                if item is None:y+=16;continue
                t,c,fn=item;a2=fin(f,sf+14+i*5,6);o2=sup(f,sf+14+i*5,8,30)
                if a2<=0:continue
                y+=shtext(d,t,y+o2,fn,col(c,a2),3)+10

        # EMOTIONAL + CTA (11-15s)
        elif f<int(13*FPS):
            sf=int(11*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,40)
            shtext(d,"Oma kommt sicher",430+o,FHS,col(CREAM,a),4)
            shtext(d,"zur Behandlung.",510+o,FHS,col(CREAM,a),4)
            accent_line(d,f,sf+14,600)
            a2=fin(f,sf+16,8);o2=sup(f,sf+16,10,45)
            shtext(d,"Und du kannst",630+o2,FB,col(CREAM,a2),3)
            shtext(d,"aufatmen.",690+o2,FH,col(GOLD,a2),4,glow=True)
        else:
            sf=int(13*FPS)
            impact_text(d,"Krankenfahrt",420,FIMPACT,FH,GOLD,f,sf,12)
            a2=fin(f,sf+8,8)
            shtext(d,"buchen — 0€ Eigenanteil.",550,FB,col(CREAM,a2),3)
            cta(d,f,sf+12,"alltagsengel.care")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    b:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V29c: KUNDEN — "5 Fahrten die deine Kasse zahlt" (14s)
# Listicle: Aufklärung welche Fahrten übernommen werden
# ═══════════════════════════════════════════════════════════════
def make_v29c():
    total=14*FPS;fd=os.path.join(TMP,"v29c")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V29c clips...")
    c1,t1=ext("rkf_4s.mp4")
    c2,t2=ext("fahr_5s.mp4")
    c3,t3=ext("kanim_6s.mp4")
    c4,t4=ext("fahr_18s.mp4")
    c5,t5=ext("kf_22s.mp4")
    app=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):bg=zoom_crop(darken(vf(c1,f),0.42),zf);bg=prep(bg)
        elif f<int(4.5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(7*FPS):
            sub=f-int(4.5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(4.5*FPS),4)
        elif f<int(9.5*FPS):
            sub=f-int(7*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(7*FPS),4)
        elif f<int(12*FPS):
            sub=f-int(9.5*FPS);bg=zoom_crop(darken(vf(c5,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(9.5*FPS),4)
        else:
            sub=f-int(12*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()
        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s)
        if f<int(2*FPS):
            impact_text(d,"5",300,FIMPACT,FNUM,GOLD,f,0,12)
            a2=fin(f,6,8);o2=sup(f,6,10,50)
            shtext(d,"Fahrten, die deine",490+o2,FHS,col(WHITE,a2),4)
            shtext(d,"Krankenkasse zahlt.",570+o2,FHS,col(WHITE,a2),4)

        # 1+2 (2-4.5s)
        elif f<int(4.5*FPS):
            sf=int(2*FPS)
            impact_text(d,"1",300,FIMPACT,FNUM,GOLD,f,sf,10)
            a=fin(f,sf+8,6);o=sup(f,sf+8,8,40)
            shtext(d,"Dialyse",460+o,FHS,col(WHITE,a),4,glow=True)
            shtext(d,"3x pro Woche? Kein Problem.",540+o,FB,col(CREAM,a),3)
            accent_line(d,f,sf+20,620)
            impact_text(d,"2",650,FIMPACT,FNUM,GOLD,f,sf+22,10)
            a2=fin(f,sf+28,6);o2=sup(f,sf+28,8,40)
            shtext(d,"Chemotherapie",760+o2,FHS,col(WHITE,a2),4,glow=True)

        # 3+4 (4.5-7s)
        elif f<int(7*FPS):
            sf=int(4.5*FPS)
            impact_text(d,"3",300,FIMPACT,FNUM,GOLD,f,sf,10)
            a=fin(f,sf+8,6);o=sup(f,sf+8,8,40)
            shtext(d,"Bestrahlung",460+o,FHS,col(WHITE,a),4,glow=True)
            accent_line(d,f,sf+18,550)
            impact_text(d,"4",580,FIMPACT,FNUM,GOLD,f,sf+20,10)
            a2=fin(f,sf+26,6);o2=sup(f,sf+26,8,40)
            shtext(d,"Stationäre Aufnahme",710+o2,FHS,col(WHITE,a2),4,glow=True)
            shtext(d,"und Entlassung",780+o2,FB,col(CREAM,a2),3)

        # 5 + Bedingung (7-9.5s)
        elif f<int(9.5*FPS):
            sf=int(7*FPS)
            impact_text(d,"5",300,FIMPACT,FNUM,GOLD,f,sf,10)
            a=fin(f,sf+8,6);o=sup(f,sf+8,8,40)
            shtext(d,"Reha-Fahrten",460+o,FHS,col(WHITE,a),4,glow=True)
            accent_line(d,f,sf+18,560)
            a2=fin(f,sf+22,8);o2=sup(f,sf+22,10,40)
            shtext(d,"Voraussetzung:",590+o2,FB,col(CREAM,a2),3)
            a3=fin(f,sf+28,8);o3=sup(f,sf+28,10,35)
            shtext(d,"Verordnung vom Arzt",660+o3,FHS,col(GOLD_L,a3),4)
            shtext(d,"+ Genehmigung Kasse",730+o3,FB,col(CREAM,a3),3)

        # TIPP (9.5-12s)
        elif f<int(12*FPS):
            sf=int(9.5*FPS)
            impact_text(d,"Tipp:",380,FIMPACT,FH,RED,f,sf,12)
            accent_line(d,f,sf+10,490)
            a2=fin(f,sf+12,6);o2=sup(f,sf+12,8,40)
            shtext(d,"Ab Pflegegrad 3",520+o2,FHS,col(WHITE,a2),4)
            shtext(d,"IMMER genehmigungsfrei.",600+o2,FHS,col(GOLD,a2),4,glow=True)
            accent_line(d,f,sf+24,690)
            a3=fin(f,sf+28,8);o3=sup(f,sf+28,10,35)
            shtext(d,"Auch mit Schwerbehinderung",720+o3,FB,col(CREAM,a3),3)
            shtext(d,"(Merkzeichen aG, Bl, H)",780+o3,FSM,col(CREAM,a3),2)

        # CTA (12-14s)
        else:
            sf=int(12*FPS)
            impact_text(d,"AlltagsEngel",400,FIMPACT,FH,GOLD,f,sf,14)
            a2=fin(f,sf+10,8)
            shtext(d,"Krankenfahrt buchen.",530,FHS,col(WHITE,a2),4)
            cta(d,f,sf+14,"Kasse zahlt. Du fährst. Wir fahren.")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    c:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V29d: FAHRER — "Geld verdienen mit deinem Auto" (14s)
# Recruiting: Fahrdienst-Aufklärung für potenzielle Fahrer
# ═══════════════════════════════════════════════════════════════
def make_v29d():
    total=14*FPS;fd=os.path.join(TMP,"v29d")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V29d clips...")
    c1,t1=ext("nord_0s.mp4")
    c2,t2=ext("fahr_24s.mp4")
    c3,t3=ext("fwalk_0s.mp4")
    c4,t4=ext("nord_6s.mp4")
    c5,t5=ext("fwalk_5s.mp4")
    app=prep(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):bg=zoom_crop(darken(vf(c1,f),0.42),zf);bg=prep(bg)
        elif f<int(5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(8*FPS):
            sub=f-int(5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5*FPS),4)
        elif f<int(11*FPS):
            sub=f-int(8*FPS);bg=zoom_crop(darken(vf(c4,sub),0.38),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(8*FPS),4)
        else:
            sub=f-int(11*FPS)
            if sub<12:
                v=zoom_crop(darken(vf(c5,sub),0.35),1.0+0.002*sub);v=prep(v)
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()
        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s)
        if f<int(2*FPS):
            a=fin(f,0,6);o=sup(f,0,8,50)
            shtext(d,"Du hast ein Auto?",400+o,FHS,col(CREAM,a),4)
            impact_text(d,"Verdiene damit.",520,FIMPACT,FH,GOLD,f,8,12)

        # WAS IST DAS (2-5s)
        elif f<int(5*FPS):
            sf=int(2*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Krankenfahrten:",420+o,FH,col(GOLD,a),4)
            accent_line(d,f,sf+10,510)
            a2=fin(f,sf+12,6);o2=sup(f,sf+12,8,40)
            shtext(d,"Du fährst Menschen",540+o2,FB,col(CREAM,a2),3)
            shtext(d,"zum Arzt, zur Therapie,",600+o2,FB,col(CREAM,a2),3)
            shtext(d,"zur Dialyse.",660+o2,FBB,col(WHITE,a2),3)
            accent_line(d,f,sf+26,740)
            a3=fin(f,sf+28,8);o3=sup(f,sf+28,10,40)
            shtext(d,"Die Krankenkasse zahlt.",770+o3,FHS,col(GOLD_L,a3),4,glow=True)

        # VERDIENST (5-8s)
        elif f<int(8*FPS):
            sf=int(5*FPS)
            impact_text(d,"Was du verdienst:",380,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,490)
            items=[("Pro Fahrt abgerechnet.",CREAM,FB),
                   ("Je nach Entfernung:",CREAM,FB),None,
                   ("5km = ca. 15€",GOLD_L,FHS),("15km = ca. 30€",GOLD_L,FHS),
                   ("30km = ca. 50€",GOLD_L,FHS),None,
                   ("Hin + Rück = doppelt.",WHITE,FBB)]
            y=520
            for i,item in enumerate(items):
                if item is None:y+=14;continue
                t,c,fn=item;a=fin(f,sf+14+i*5,6);o=sup(f,sf+14+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # WAS DU BRAUCHST (8-11s)
        elif f<int(11*FPS):
            sf=int(8*FPS)
            impact_text(d,"Was du brauchst:",380,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,490)
            items=[("Führerschein Klasse B",WHITE,FHS),
                   ("Eigenes Auto",WHITE,FHS),
                   ("P-Schein (Personenbeförderung)",WHITE,FHS),None,
                   ("Kein Krankenwagen nötig.",GOLD_L,FB),
                   ("Dein normales Auto reicht.",GOLD_L,FB),None,
                   ("P-Schein? Hilft dir",CREAM,FSM),
                   ("AlltagsEngel dabei.",CREAM,FSM)]
            y=520
            for i,item in enumerate(items):
                if item is None:y+=14;continue
                t,c,fn=item;a=fin(f,sf+14+i*5,6);o=sup(f,sf+14+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # CTA (11-14s)
        else:
            sf=int(11*FPS)
            impact_text(d,"Werde Fahrer.",400,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,510)
            a2=fin(f,sf+14,8);o2=sup(f,sf+14,10,40)
            shtext(d,"Flexible Zeiten.",540+o2,FHS,col(WHITE,a2),4)
            a3=fin(f,sf+22,8);o3=sup(f,sf+22,10,35)
            shtext(d,"Sicheres Einkommen.",620+o3,FHS,col(GOLD_L,a3),4,glow=True)
            a4=fin(f,sf+30,8);o4=sup(f,sf+30,10,35)
            shtext(d,"Menschen helfen.",700+o4,FHS,col(CREAM,a4),4)
            cta(d,f,sf+34,"alltagsengel.care — Jetzt bewerben")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    d:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V29e: FAHRER — "POV: Dein erster Tag als Krankenfahrer" (15s)
# Emotional Recruiting: Was der Job wirklich bedeutet
# ═══════════════════════════════════════════════════════════════
def make_v29e():
    total=15*FPS;fd=os.path.join(TMP,"v29e")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V29e clips...")
    c1,t1=ext("nord_12s.mp4")
    c2,t2=ext("kanim_12s.mp4")
    c3,t3=ext("rkf_8s.mp4")
    c4,t4=ext("fwalk_10s.mp4")
    c5,t5=ext("fahr_12s.mp4")  # reuse ok - different video
    app=prep(darken(load_screen("screenshot-2-profil.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):bg=zoom_crop(darken(vf(c1,f),0.45),zf);bg=prep(bg)
        elif f<int(5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.40),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(8*FPS):
            sub=f-int(5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5*FPS),4)
        elif f<int(11*FPS):
            sub=f-int(8*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(8*FPS),4)
        elif f<int(13*FPS):
            sub=f-int(11*FPS);bg=zoom_crop(darken(vf(c5,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(11*FPS),4)
        else:
            sub=f-int(13*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()
        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s)
        if f<int(2*FPS):
            impact_text(d,"POV:",360,FIMPACT,FHOOK,GOLD,f,0,10)
            a2=fin(f,6,8);o2=sup(f,6,10,50)
            shtext(d,"Dein erster Tag",500+o2,FHS,col(WHITE,a2),4)
            shtext(d,"als Krankenfahrer.",580+o2,FHS,col(WHITE,a2),4)

        # MORGENS (2-5s)
        elif f<int(5*FPS):
            sf=int(2*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"7:30 Uhr.",420+o,FH,col(GOLD,a),4,glow=True)
            accent_line(d,f,sf+10,510)
            a2=fin(f,sf+12,6);o2=sup(f,sf+12,8,40)
            shtext(d,"Du holst Frau Müller ab.",540+o2,FB,col(CREAM,a2),3)
            a3=fin(f,sf+20,6);o3=sup(f,sf+20,8,40)
            shtext(d,"82 Jahre. Dialyse.",620+o3,FHS,col(WHITE,a3),4)
            accent_line(d,f,sf+28,710)
            a4=fin(f,sf+30,8);o4=sup(f,sf+30,10,40)
            shtext(d,"Sie wartet schon",740+o4,FB,col(CREAM,a4),3)
            shtext(d,"an der Haustür.",800+o4,FB,col(CREAM,a4),3)
            a5=fin(f,sf+40,8);o5=sup(f,sf+40,10,40)
            shtext(d,"Und lächelt.",870+o5,FBB,col(GOLD_L,a5),3,glow=True)

        # FAHRT (5-8s)
        elif f<int(8*FPS):
            sf=int(5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Unterwegs erzählt sie",430+o,FB,col(CREAM,a),3)
            shtext(d,"von ihren Enkeln.",490+o,FB,col(CREAM,a),3)
            accent_line(d,f,sf+14,570)
            a2=fin(f,sf+16,8);o2=sup(f,sf+16,10,45)
            shtext(d,"Du bringst sie sicher",600+o2,FB,col(CREAM,a2),3)
            shtext(d,"zur Klinik.",660+o2,FBB,col(WHITE,a2),3)
            accent_line(d,f,sf+28,740)
            a3=fin(f,sf+30,8);o3=sup(f,sf+30,10,40)
            shtext(d,"\"Danke, junger Mann.\"",770+o3,FQUOTE,col(GOLD_L,a3),4)

        # ERKENNTNIS (8-11s)
        elif f<int(11*FPS):
            sf=int(8*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Um 9 Uhr bist du",430+o,FB,col(CREAM,a),3)
            shtext(d,"wieder zuhause.",490+o,FB,col(CREAM,a),3)
            accent_line(d,f,sf+14,570)
            a2=fin(f,sf+16,8);o2=sup(f,sf+16,10,45)
            shtext(d,"30€ verdient.",600+o2,FH,col(GOLD,a2),4,glow=True)
            accent_line(d,f,sf+26,690)
            a3=fin(f,sf+28,8);o3=sup(f,sf+28,10,40)
            shtext(d,"Und du hast jemandem",720+o3,FB,col(CREAM,a3),3)
            shtext(d,"den Tag gerettet.",780+o3,FHS,col(GOLD_L,a3),4,glow=True)
            a4=fin(f,sf+40,8);o4=sup(f,sf+40,10,35)
            shtext(d,"Das ist besser als",860+o4,FSM,col(CREAM,a4),2)
            shtext(d,"jeder Bürojob.",910+o4,FSM,col(CREAM,a4),2)

        # WARUM + CTA (11-15s)
        elif f<int(13*FPS):
            sf=int(11*FPS)
            impact_text(d,"Krankenfahrer",400,FIMPACT,FH,GOLD,f,sf,14)
            a2=fin(f,sf+10,8);o2=sup(f,sf+10,10,40)
            shtext(d,"bei AlltagsEngel.",540+o2,FHS,col(WHITE,a2),4)
            accent_line(d,f,sf+16,630)
            items=[("Flexible Schichten.",CREAM,FB),
                   ("Feste Touren möglich.",CREAM,FB),
                   ("Abrechnung mit Kasse.",GOLD_L,FB)]
            y=660
            for i,(t,c,fn) in enumerate(items):
                a=fin(f,sf+20+i*6,6);o=sup(f,sf+20+i*6,8,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+10
        else:
            sf=int(13*FPS)
            a=fin(f,sf,8)
            shtext(d,"Fahr los.",420,FH,col(GOLD,a),4,glow=True)
            a2=fin(f,sf+8,8)
            shtext(d,"Menschen brauchen dich.",510,FB,col(CREAM,a2),3)
            cta(d,f,sf+12,"alltagsengel.care — Fahrer werden")

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

    print("🎬 Extracting Krankenfahrten clips...")
    extract_clips()

    videos = [
        ("V29a_0euro_arztfahrt.mp4", make_v29a),
        ("V29b_oma_dialyse.mp4", make_v29b),
        ("V29c_5_fahrten_kasse_zahlt.mp4", make_v29c),
        ("V29d_geld_mit_auto.mp4", make_v29d),
        ("V29e_pov_erster_tag_fahrer.mp4", make_v29e),
    ]
    for name,fn in videos:
        print(f"\n🎬 {name}")
        fd,total=fn();encode(fd,name,total);shutil.rmtree(fd)
    shutil.rmtree(TMP,ignore_errors=True)
    print("\n✅ All 5 V29 Krankenfahrten videos done!")

if __name__=="__main__":main()
