#!/usr/bin/env python3
"""
V27 Final Composite: Text-matched video backgrounds.
Each text line gets the video clip that matches its content.
Uses ffmpeg concat + drawtext for speed.
"""
import os, shutil, subprocess, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
FPS = 30
BASE = "/Users/work/alltagsengel"
OUT = os.path.join(BASE, "social-media-grafiken/tiktok-v27")
CLIPS = os.path.join(BASE, "social-media-grafiken")
SCREENS = os.path.join(BASE, "app-store-screenshots")
TMP = os.path.join(BASE, "_tmp_v27")

# Clips mapping
CLIP_SPAZ = os.path.join(CLIPS, "REELS-spaziergang-neu.mp4")    # walking/park
CLIP_EINK = os.path.join(CLIPS, "REELS-einkauf-neu.mp4")        # shopping/market
CLIP_GES = os.path.join(CLIPS, "REELS-gesellschaft-neu.mp4")     # talking/coffee
CLIP_ARZT = os.path.join(CLIPS, "REELS-arztbegleitung-neu.mp4")  # accompanying/city
CLIP_CAFE = os.path.join(CLIPS, "REELS-cafe-freizeit-neu.mp4")   # car/doctor visit

def _font(size):
    for p in ["/System/Library/Fonts/Supplemental/Georgia.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def _sfont(size):
    for p in ["/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

GOLD = (201, 150, 60); GOLD_L = (219, 168, 74); CREAM = (245, 240, 230)
WHITE = (255, 255, 255); RED = (200, 60, 50); DARK = (13, 10, 8)

F_HOOK = _font(68); F_HOOK_SM = _font(52); F_BODY = _sfont(44)
F_BODY_B = _sfont(44); F_SMALL = _sfont(34); F_CTA = _sfont(52)
F_URL = _font(48); F_BIG = _font(110); F_BRAND = _sfont(26)

def ease(t): return 1-(1-min(max(t,0),1))**3
def fin(f,s,dur=8):
    if f<s: return 0.0
    if f>=s+dur: return 1.0
    return ease((f-s)/dur)
def sup(f,s,dur=10,dist=50):
    if f<s: return dist
    if f>=s+dur: return 0
    return int(dist*(1-ease((f-s)/dur)))
def col(c,a): return tuple(int(v*a) for v in c)

def darken(img, a=0.45):
    return Image.blend(img, Image.new("RGB",(W,H),(0,0,0)), 1-a)

def grad_bot(img, h=500, op=230):
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); od = ImageDraw.Draw(ov)
    for i in range(h):
        od.line([(0,H-h+i),(W,H-h+i)], fill=(13,10,8,int(op*(i/h)**1.3)))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

def grad_top(img, h=300, op=180):
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); od = ImageDraw.Draw(ov)
    for i in range(h):
        od.line([(0,i),(W,i)], fill=(13,10,8,int(op*((h-i)/h)**1.3)))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

def prep(img): return grad_bot(grad_top(img))

def shtext(d, text, y, font, fill, sh=3):
    bb = d.textbbox((0,0), text, font=font); tw = bb[2]-bb[0]; x = (W-tw)//2
    d.text((x+sh,y+sh), text, font=font, fill=(0,0,0))
    d.text((x,y), text, font=font, fill=fill)
    return bb[3]-bb[1]

def logo(d,f):
    a=fin(f,0,15)
    if a<=0: return
    c=col(GOLD,a)
    bb=d.textbbox((0,0),"AlltagsEngel",font=F_BRAND); tw=bb[2]-bb[0]
    d.text(((W-tw)//2+2,57),"AlltagsEngel",font=F_BRAND,fill=(0,0,0))
    d.text(((W-tw)//2,55),"AlltagsEngel",font=F_BRAND,fill=c)
    d.line([(W//2-60,90),(W//2+60,90)],fill=c,width=1)

def cta_block(d,f,sf,extra=None):
    a=fin(f,sf,12)
    if a<=0: return
    gc=col(GOLD,a); cc=col(CREAM,a)
    y=H-300; d.line([(W//2-250,y),(W//2+250,y)],fill=gc,width=2); y+=30
    if extra: shtext(d,extra,y,F_SMALL,cc,2); y+=55
    shtext(d,"alltagsengel.care",y,F_URL,gc,3); y+=70
    shtext(d,"Finde deinen Engel.",y,F_SMALL,cc,2)

def load_screen(name):
    img=Image.open(os.path.join(SCREENS,name)).convert("RGB")
    r=max(W/img.width,H/img.height)
    img=img.resize((int(img.width*r),int(img.height*r)),Image.LANCZOS)
    l=(img.width-W)//2; t=(img.height-H)//2
    return img.crop((l,t,l+W,t+H))

# ── Extract clip frames ──
_c=[0]
def get_frames(clip_path):
    _c[0]+=1
    d=os.path.join(TMP, f"ext{_c[0]}")
    if os.path.exists(d): shutil.rmtree(d)
    os.makedirs(d)
    subprocess.run(["ffmpeg","-y","-i",clip_path,
        "-vf",f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
        os.path.join(d,"f_%05d.png")], capture_output=True, check=True)
    frames=sorted([os.path.join(d,ff) for ff in os.listdir(d) if ff.endswith(".png")])
    print(f"    {os.path.basename(clip_path)}: {len(frames)} frames")
    return frames, d

def vf(frames, idx):
    return Image.open(frames[idx % len(frames)]).convert("RGB")

# ══════════════════════════════════════════════════════════════════════════════
# V27a: "Rufst du oft genug an?" (15s)
# Scene mapping:
#   Hook(0-2s): gesellschaft (opa trinkt kaffee allein? -> zusammen)
#   Problem(2-6s): arztbegleitung (stadt, allein unterwegs)
#   Wendung(6-10s): text-matched clips per line!
#     "spazieren" -> spaziergang
#     "zuhört" -> gesellschaft
#     "Karten" -> gesellschaft
#     "Einkaufen" -> einkauf
#   Lösung(10-15s): app screenshot + einkauf mix
# ══════════════════════════════════════════════════════════════════════════════
def make_v27a():
    total=15*FPS; fdir=os.path.join(TMP,"frames_a")
    if os.path.exists(fdir): shutil.rmtree(fdir)
    os.makedirs(fdir)
    print("  Loading clips...")
    ges,t1=get_frames(CLIP_GES)
    arzt,t2=get_frames(CLIP_ARZT)
    spaz,t3=get_frames(CLIP_SPAZ)
    eink,t4=get_frames(CLIP_EINK)
    app_bg=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(20)),0.30))

    for f in range(total):
        # Background selection based on current text content
        if f < 2*FPS:
            # Hook: gesellschaft (kaffee/reden scene)
            bg = prep(darken(vf(ges, f), 0.40))
        elif f < 6*FPS:
            # Problem: allein unterwegs (arztbegleitung = stadt)
            bg = prep(darken(vf(arzt, f-2*FPS), 0.38))
        elif f < 10*FPS:
            # Wendung: MATCH each line to correct clip!
            sub_f = f - 6*FPS  # 0-120 frames within this scene
            # Lines appear at: 0, 8, 16, 24, 32, 40 frames into scene
            # "Stell dir vor," (0) -> gesellschaft
            # "jemand ist bei ihr." (8) -> gesellschaft
            # "Geht mit ihr spazieren." (24) -> spaziergang!
            # "Hört ihr zu." (32) -> gesellschaft
            # "Spielt Karten." (40) -> gesellschaft (cafe)
            # "Begleitet sie zum Einkaufen." (48) -> einkauf!
            if sub_f < 24:
                bg = prep(darken(vf(ges, sub_f), 0.38))
            elif sub_f < 40:
                # spazieren -> spaziergang clip
                if sub_f < 24+10:
                    old = prep(darken(vf(ges, 23), 0.38))
                    new = prep(darken(vf(spaz, 0), 0.38))
                    p = (sub_f-24)/10; p=p*p*(3-2*p)
                    bg = Image.blend(old, new, p)
                else:
                    bg = prep(darken(vf(spaz, sub_f-24), 0.38))
            elif sub_f < 56:
                # Karten spielen -> gesellschaft
                if sub_f < 40+10:
                    old = prep(darken(vf(spaz, sub_f-24), 0.38))
                    new = prep(darken(vf(ges, 50), 0.38))
                    p = (sub_f-40)/10; p=p*p*(3-2*p)
                    bg = Image.blend(old, new, p)
                else:
                    bg = prep(darken(vf(ges, sub_f), 0.38))
            else:
                # Einkaufen -> einkauf clip!
                if sub_f < 56+10:
                    old = prep(darken(vf(ges, sub_f), 0.38))
                    new = prep(darken(vf(eink, 0), 0.38))
                    p = (sub_f-56)/10; p=p*p*(3-2*p)
                    bg = Image.blend(old, new, p)
                else:
                    bg = prep(darken(vf(eink, sub_f-56), 0.38))
        else:
            # Lösung: crossfade to app screenshot
            if f < 10*FPS+15:
                v=prep(darken(vf(eink,len(eink)-1),0.35)); p=(f-10*FPS)/15; p=p*p*(3-2*p)
                bg=Image.blend(v,app_bg,p)
            else: bg=app_bg.copy()

        d=ImageDraw.Draw(bg); logo(d,f)

        if f<2*FPS:
            a=fin(f,0,12); o=sup(f,0,15,50)
            shtext(d,"Wann hast du zuletzt",450+o,F_HOOK,col(GOLD_L,a),4)
            a2=fin(f,8,12); o2=sup(f,8,15,50)
            shtext(d,"bei Mama angerufen?",540+o2,F_HOOK,col(WHITE,a2),4)
        elif f<6*FPS:
            items=[("Du arbeitest. Du hast Kinder.",CREAM,F_BODY),("Du hast Stress.",CREAM,F_BODY),
                   None,("Und im Hinterkopf",CREAM,F_BODY),("immer dieser Gedanke:",CREAM,F_BODY),
                   None,("\"Ist sie allein?\"",GOLD_L,F_HOOK_SM),("\"Geht es ihr gut?\"",GOLD_L,F_HOOK_SM)]
            y=420
            for i,item in enumerate(items):
                if item is None: y+=25; continue
                text,color,font=item
                a=fin(f,2*FPS+i*8,10); o=sup(f,2*FPS+i*8,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+14
        elif f<10*FPS:
            items=[("Stell dir vor,",GOLD_L,F_HOOK_SM),("jemand ist bei ihr.",WHITE,F_HOOK_SM),
                   None,("Geht mit ihr spazieren.",CREAM,F_BODY),("Hört ihr zu.",CREAM,F_BODY),
                   ("Spielt Karten.",CREAM,F_BODY),("Begleitet sie zum Einkaufen.",CREAM,F_BODY)]
            y=430
            for i,item in enumerate(items):
                if item is None: y+=25; continue
                text,color,font=item
                a=fin(f,6*FPS+i*8,10); o=sup(f,6*FPS+i*8,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+12
        else:
            items=[("Alltagsbegleitung.",GOLD_L,F_HOOK_SM),("Keine Pflege.",CREAM,F_BODY),
                   ("Einfach ein Mensch,",CREAM,F_BODY),("der da ist.",CREAM,F_BODY)]
            y=450
            for i,(text,color,font) in enumerate(items):
                a=fin(f,10*FPS+i*8,10); o=sup(f,10*FPS+i*8,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+14
            ps=10*FPS+35; a=fin(f,ps,10)
            if a>0:
                o=sup(f,ps,12,30)
                shtext(d,"131€/Monat",y+35+o,F_CTA,col(GOLD,a),4)
                shtext(d,"zahlt die Pflegekasse",y+100+o,F_SMALL,col(CREAM,a),2)
            cta_block(d,f,12*FPS)

        bg.save(os.path.join(fdir,f"frame_{f:05d}.png")); del bg,d
        if f%60==0: print(f"    V27a: {f}/{total}")

    for t in [t1,t2,t3,t4]: shutil.rmtree(t)
    return fdir, total

# ══════════════════════════════════════════════════════════════════════════════
# V27c: "Papa sitzt allein" (15s)
# Hook: gesellschaft (opa am tisch)
# Problem: arztbegleitung (allein in stadt)
# Wendung:
#   "Kaffee trinken" -> gesellschaft
#   "spazieren" -> spaziergang
#   "Redet über früher" -> gesellschaft
#   "Hört zu" -> gesellschaft
# Lösung: app
# ══════════════════════════════════════════════════════════════════════════════
def make_v27c():
    total=15*FPS; fdir=os.path.join(TMP,"frames_c")
    if os.path.exists(fdir): shutil.rmtree(fdir)
    os.makedirs(fdir)
    print("  Loading clips...")
    ges,t1=get_frames(CLIP_GES)
    arzt,t2=get_frames(CLIP_ARZT)
    spaz,t3=get_frames(CLIP_SPAZ)
    app_bg=prep(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS: bg=prep(darken(vf(ges,f),0.45))
        elif f<6*FPS: bg=prep(darken(vf(arzt,f-2*FPS),0.40))
        elif f<10*FPS:
            sub=f-6*FPS
            # "Aber jemand kann" (0) -> gesellschaft
            # "Trinkt Kaffee" (16) -> gesellschaft
            # "Geht spazieren" (24) -> spaziergang!
            # "Redet über früher" (32) -> gesellschaft
            # "Hört einfach zu" (40) -> gesellschaft
            if sub<24:
                bg=prep(darken(vf(ges,sub+40),0.38))
            elif sub<36:
                if sub<24+8:
                    old=prep(darken(vf(ges,63),0.38)); new=prep(darken(vf(spaz,0),0.38))
                    p=(sub-24)/8; p=p*p*(3-2*p); bg=Image.blend(old,new,p)
                else: bg=prep(darken(vf(spaz,sub-24),0.38))
            else:
                if sub<36+8:
                    old=prep(darken(vf(spaz,sub-24),0.38)); new=prep(darken(vf(ges,80),0.38))
                    p=(sub-36)/8; p=p*p*(3-2*p); bg=Image.blend(old,new,p)
                else: bg=prep(darken(vf(ges,sub+40),0.38))
        else:
            if f<10*FPS+15:
                v=prep(darken(vf(ges,len(ges)-1),0.35)); p=(f-10*FPS)/15; p=p*p*(3-2*p)
                bg=Image.blend(v,app_bg,p)
            else: bg=app_bg.copy()

        d=ImageDraw.Draw(bg); logo(d,f)

        if f<2*FPS:
            a0=fin(f,0,10); o0=sup(f,0,12,40)
            if a0>0: shtext(d,"Papa sitzt allein",490+o0,F_HOOK,col(GOLD_L,a0),4)
            a1=fin(f,8,10); o1=sup(f,8,12,40)
            if a1>0: shtext(d,"am Küchentisch.",580+o1,F_HOOK_SM,col(WHITE,a1),4)
            a2=fin(f,18,10); o2=sup(f,18,12,40)
            if a2>0: shtext(d,"Seit 3 Stunden.",660+o2,F_BODY_B,col(RED,a2),3)
        elif f<6*FPS:
            items=["Seit Mama weg ist,","redet er kaum noch.",None,"Das Essen bleibt stehen.",
                   "Die Wohnung wird leiser.",None,"Und du?","Du kannst nicht","jeden Tag da sein."]
            y=400
            for i,text in enumerate(items):
                if text is None: y+=22; continue
                fs=2*FPS+i*7; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                hl=text=="Und du?"; cc=GOLD_L if hl else CREAM; fn=F_HOOK_SM if hl else F_BODY
                y+=shtext(d,text,y+o,fn,col(cc,a),3)+10
        elif f<10*FPS:
            items=[("Aber jemand kann.",GOLD_L,F_HOOK_SM),None,
                   ("Trinkt Kaffee mit ihm.",CREAM,F_BODY),("Geht spazieren.",CREAM,F_BODY),
                   ("Redet über früher.",CREAM,F_BODY),("Hört einfach zu.",WHITE,F_BODY_B)]
            y=440
            for i,item in enumerate(items):
                if item is None: y+=20; continue
                text,color,font=item
                fs=6*FPS+i*8; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+12
        else:
            items=[("Keine Pflege. Keine Medizin.",CREAM,F_BODY),None,
                   ("Einfach",GOLD_L,F_HOOK_SM),("menschliche Nähe.",GOLD,F_HOOK)]
            y=440
            for i,item in enumerate(items):
                if item is None: y+=20; continue
                text,color,font=item
                fs=10*FPS+i*10; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+14
            cta_block(d,f,12*FPS,"131€/Monat von der Pflegekasse")

        bg.save(os.path.join(fdir,f"frame_{f:05d}.png")); del bg,d
        if f%60==0: print(f"    V27c: {f}/{total}")

    for t in [t1,t2,t3]: shutil.rmtree(t)
    return fdir, total

# ══════════════════════════════════════════════════════════════════════════════
# V27e: "Was Oma wirklich braucht" (14s)
# Hook: einkauf (oma + begleiterin)
# Realität:
#   "zum Markt geht" -> einkauf
#   "Einkaufen hilft" -> einkauf
#   "zuhört" -> gesellschaft
#   "durch den Park läuft" -> spaziergang
# Emotional: gesellschaft
# Lösung: app
# ══════════════════════════════════════════════════════════════════════════════
def make_v27e():
    total=14*FPS; fdir=os.path.join(TMP,"frames_e")
    if os.path.exists(fdir): shutil.rmtree(fdir)
    os.makedirs(fdir)
    print("  Loading clips...")
    eink,t1=get_frames(CLIP_EINK)
    ges,t2=get_frames(CLIP_GES)
    spaz,t3=get_frames(CLIP_SPAZ)
    app_bg=prep(darken(load_screen("screenshot-2-profil.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS: bg=prep(darken(vf(eink,f),0.42))
        elif f<6*FPS:
            sub=f-2*FPS
            # "zum Markt geht" (0,8) -> einkauf
            # "Einkaufen hilft" (16) -> einkauf
            # "zuhört" (24) -> gesellschaft
            # "durch den Park" (32,40) -> spaziergang
            if sub<24: bg=prep(darken(vf(eink,sub+30),0.38))
            elif sub<36:
                if sub<24+8:
                    old=prep(darken(vf(eink,sub+30),0.38)); new=prep(darken(vf(ges,0),0.38))
                    p=(sub-24)/8; p=p*p*(3-2*p); bg=Image.blend(old,new,p)
                else: bg=prep(darken(vf(ges,sub-24),0.38))
            else:
                if sub<36+8:
                    old=prep(darken(vf(ges,sub-24),0.38)); new=prep(darken(vf(spaz,0),0.38))
                    p=(sub-36)/8; p=p*p*(3-2*p); bg=Image.blend(old,new,p)
                else: bg=prep(darken(vf(spaz,sub-36),0.38))
        elif f<9*FPS:
            # Einsamkeit -> gesellschaft (emotional)
            bg=prep(darken(vf(ges,f-6*FPS+30),0.42))
        else:
            if f<9*FPS+15:
                v=prep(darken(vf(ges,len(ges)-1),0.35)); p=(f-9*FPS)/15; p=p*p*(3-2*p)
                bg=Image.blend(v,app_bg,p)
            else: bg=app_bg.copy()

        d=ImageDraw.Draw(bg); logo(d,f)

        if f<2*FPS:
            a=fin(f,0,12); o=sup(f,0,15,50)
            shtext(d,"Oma braucht keine",470+o,F_HOOK_SM,col(CREAM,a),4)
            a2=fin(f,8,10); o2=sup(f,8,12,40)
            shtext(d,"teure Therapie.",540+o2,F_HOOK_SM,col(GOLD_L,a2),4)
            a3=fin(f,15,10); o3=sup(f,15,12,35)
            shtext(d,"Sie braucht jemanden,",630+o3,F_BODY,col(GOLD,a3),3)
            shtext(d,"der da ist.",690+o3,F_BODY_B,col(GOLD,a3),3)
        elif f<6*FPS:
            items=["Jemanden, der mit ihr","zum Markt geht.","Der beim Einkaufen hilft.",
                   "Der einfach mal zuhört.","Der mit ihr durch","den Park läuft."]
            y=440
            for i,text in enumerate(items):
                fs=2*FPS+i*8; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,F_BODY,col(CREAM,a),3)+16
        elif f<9*FPS:
            items=[("Einsamkeit ist das",CREAM,F_BODY),("größte Problem im Alter.",WHITE,F_BODY_B),
                   None,("Kein Medikament",CREAM,F_BODY),("hilft dagegen.",CREAM,F_BODY),
                   None,("Aber ein Mensch schon.",GOLD_L,F_HOOK_SM)]
            y=440
            for i,item in enumerate(items):
                if item is None: y+=22; continue
                text,color,font=item
                fs=6*FPS+i*7; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+12
        else:
            items=[("AlltagsEngel",GOLD,F_HOOK),("vermittelt Alltagsbegleiter.",CREAM,F_BODY),
                   None,("Zertifiziert nach §45a.",CREAM,F_SMALL),("Versichert. Geprüft.",CREAM,F_SMALL)]
            y=410
            for i,item in enumerate(items):
                if item is None: y+=18; continue
                text,color,font=item
                fs=9*FPS+i*8; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+14
            ps=9*FPS+40; a=fin(f,ps,10)
            if a>0:
                o=sup(f,ps,12,30)
                shtext(d,"131€/Monat",y+25+o,F_CTA,col(GOLD,a),4)
                shtext(d,"Pflegekasse übernimmt das.",y+90+o,F_SMALL,col(CREAM,a),2)
            cta_block(d,f,12*FPS,"Gib Oma das, was sie wirklich braucht.")

        bg.save(os.path.join(fdir,f"frame_{f:05d}.png")); del bg,d
        if f%60==0: print(f"    V27e: {f}/{total}")

    for t in [t1,t2,t3]: shutil.rmtree(t)
    return fdir, total

def encode(fdir, name, total):
    out=os.path.join(OUT,name)
    subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",os.path.join(fdir,"frame_%05d.png"),
        "-frames:v",str(total),"-c:v","libx264","-pix_fmt","yuv420p","-crf","18",
        "-preset","medium","-movflags","+faststart",out],check=True,capture_output=True)
    mb=os.path.getsize(out)/1024/1024
    print(f"  ✓ {name} ({total/FPS:.0f}s, {mb:.1f}MB)")

def main():
    os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    import sys; sys.stdout=open(sys.stdout.fileno(),mode='w',buffering=1)

    for name,fn in [("V27a_rufst_du_an.mp4",make_v27a),
                    ("V27c_papa_sitzt_allein.mp4",make_v27c),
                    ("V27e_was_oma_braucht.mp4",make_v27e)]:
        print(f"\n🎬 {name}")
        fdir,total=fn()
        encode(fdir,name,total)
        shutil.rmtree(fdir)

    # Cleanup
    for d in os.listdir(TMP):
        p=os.path.join(TMP,d)
        if os.path.isdir(p): shutil.rmtree(p)
    print("\n✅ 3 text-matched composite videos ready!")

if __name__=="__main__":
    main()
