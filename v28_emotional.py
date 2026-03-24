#!/usr/bin/env python3
"""V28 EMOTIONAL: TikTok videos with real impact — flash cuts, zoom, kinetic text."""
import os,shutil,subprocess,sys,math
from PIL import Image,ImageDraw,ImageFont,ImageFilter

W,H=1080,1920; FPS=30
BASE="/Users/work/alltagsengel"
CLIPS=os.path.join(BASE,"_clips_v28")
SRC=os.path.join(BASE,"social-media-grafiken")
SCREENS=os.path.join(BASE,"app-store-screenshots")
OUT=os.path.join(BASE,"social-media-grafiken/tiktok-v28")
TMP=os.path.join(BASE,"_tmp_v28e")

GOLD=(201,150,60);GOLD_L=(219,168,74);CREAM=(245,240,230)
WHITE=(255,255,255);RED=(220,50,40);DARK=(13,10,8);BLACK=(0,0,0)

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

# ── easing ──
def ease(t):return 1-(1-min(max(t,0),1))**3
def ease_elastic(t):
    t=min(max(t,0),1)
    if t==0 or t==1:return t
    return 2**(-10*t)*math.sin((t-0.1)*5*math.pi)+1
def ease_back(t):
    t=min(max(t,0),1);s=1.7
    return t*t*((s+1)*t-s)

def fin(f,s,d=8):
    if f<s:return 0.0
    if f>=s+d:return 1.0
    return ease((f-s)/d)
def fout(f,s,d=8):
    """Fade out starting at frame s over d frames"""
    if f<s:return 1.0
    if f>=s+d:return 0.0
    return 1-ease((f-s)/d)
def sup(f,s,d=10,dist=50):
    if f<s:return dist
    if f>=s+d:return 0
    return int(dist*(1-ease((f-s)/d)))
def col(c,a):return tuple(max(0,min(255,int(v*a))) for v in c)

# ── ZOOM: slow Ken Burns on backgrounds ──
def zoom_crop(img,z):
    """Crop center with zoom factor z (1.0=no zoom, 1.2=20% zoom in)"""
    nw,nh=int(W/z),int(H/z)
    l=(img.width-nw)//2;t=(img.height-nh)//2
    return img.crop((l,t,l+nw,t+nh)).resize((W,H),Image.LANCZOS)

# ── FLASH: white flash transition ──
def flash(bg,f,start,dur=6):
    """White flash at start frame, fading out over dur frames"""
    if f<start or f>=start+dur:return bg
    a=(1-(f-start)/dur)**2
    return Image.blend(bg,Image.new("RGB",(W,H),(255,255,255)),a*0.85)

# ── RED PULSE: emotional overlay ──
def red_vignette(bg,f,start,dur=20):
    if f<start or f>=start+dur:return bg
    t=(f-start)/dur;intensity=math.sin(t*math.pi)*0.15
    ov=Image.new("RGB",(W,H),(180,20,10))
    return Image.blend(bg,ov,intensity)

# ── darken + gradients ──
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

# ── TEXT: shadow text with glow option ──
def shtext(d,text,y,font,fill,sh=3,glow=False):
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    if glow:
        for dx in range(-2,3):
            for dy in range(-2,3):
                d.text((x+dx,y+dy),text,font=font,fill=(fill[0]//3,fill[1]//3,fill[2]//3))
    d.text((x+sh,y+sh),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)
    return bb[3]-bb[1]

# ── IMPACT TEXT: word appears huge then settles ──
def impact_text(d,text,y_target,font_big,font_final,fill,f,start,settle=12):
    """Text slams in big then shrinks to final size"""
    if f<start:return 0
    t=min((f-start)/settle,1.0)
    # Use elastic easing for slam effect
    if t<1.0:
        scale=1.0+(1-ease_elastic(t))*0.4  # starts 40% bigger
        a=min(t*3,1.0)
        font=font_big if t<0.3 else font_final
    else:
        scale=1.0;a=1.0;font=font_final
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+4,y_target+4),text,font=font,fill=(0,0,0))
    d.text((x,y_target),text,font=font,fill=col(fill,a))
    return bb[3]-bb[1]

# ── COUNTER: number counting up ──
def counter_text(d,target,prefix,suffix,y,font,fill,f,start,dur=20):
    if f<start:return
    t=min((f-start)/dur,1.0);t=ease(t)
    val=int(target*t)
    text=f"{prefix}{val}{suffix}"
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+4,y+4),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)

# ── LOGO ──
def logo(d,f):
    a=fin(f,0,12)
    if a<=0:return
    c=col(GOLD,a);bb=d.textbbox((0,0),"AlltagsEngel",font=FBR);tw=bb[2]-bb[0]
    d.text(((W-tw)//2+2,57),"AlltagsEngel",font=FBR,fill=(0,0,0))
    d.text(((W-tw)//2,55),"AlltagsEngel",font=FBR,fill=c)
    d.line([(W//2-60,88),(W//2+60,88)],fill=c,width=1)

# ── CTA ──
def cta(d,f,sf,extra=None):
    a=fin(f,sf,10)
    if a<=0:return
    gc=col(GOLD,a);cc=col(CREAM,a)
    y=H-310;d.line([(W//2-280,y),(W//2+280,y)],fill=gc,width=2);y+=30
    if extra:shtext(d,extra,y,FSM,cc,2);y+=55
    shtext(d,"alltagsengel.care",y,FU,gc,3,glow=True);y+=70
    shtext(d,"Finde deinen Engel.",y,FSM,cc,2)

# ── DECORATIVE LINE accent ──
def accent_line(d,f,start,y,w=400):
    a=fin(f,start,8)
    if a<=0:return
    prog=ease(min((f-start)/15,1.0))
    hw=int(w*prog/2)
    d.line([(W//2-hw,y),(W//2+hw,y)],fill=col(GOLD,a),width=2)

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

# ═══════════════════════════════════════════════════════════════
# V28a: "POV: Deine Oma ruft an" (13s) — EMOTIONAL
# Faster cuts, flash transitions, zoom, impact text
# ═══════════════════════════════════════════════════════════════
def make_v28a():
    total=13*FPS;fd=os.path.join(TMP,"v28a")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V28a clips...")
    c1,t1=ext("gesellschaft.mp4")    # Oma+Gesellschaft
    c2,t2=ext("cafe.mp4")            # Cafe scene
    c3,t3=ext("nomusic_12s.mp4")     # Emotional
    c4,t4=ext("real_0s.mp4")         # Real footage
    app=prep(darken(load_screen("screenshot-1-home.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        # Slow zoom on each clip (Ken Burns)
        zf=1.0+0.0015*f  # slowly zooming in over whole video
        # Scene cuts with FLASH transitions
        if f<int(1.5*FPS):  # 0-1.5s: Hook
            bg=zoom_crop(darken(vf(c1,f),0.38),zf)
            bg=prep(bg)
        elif f==int(1.5*FPS):  # FLASH!
            bg=Image.new("RGB",(W,H),WHITE)
        elif f<int(3.5*FPS):  # 1.5-3.5s
            sub=f-int(1.5*FPS)
            bg=zoom_crop(darken(vf(c1,sub+40),0.36),1.0+0.003*sub)
            bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(1.5*FPS),4)
        elif f<int(5.5*FPS):  # 3.5-5.5s: Problem
            sub=f-int(3.5*FPS)
            bg=zoom_crop(darken(vf(c2,sub),0.40),1.0+0.003*sub)
            bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(3.5*FPS),4)
            bg=red_vignette(bg,f,int(4*FPS),int(1.5*FPS))  # red pulse on guilt
        elif f<int(8*FPS):  # 5.5-8s: Wendung
            sub=f-int(5.5*FPS)
            bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.002*sub)
            bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5.5*FPS),4)
        elif f<int(10.5*FPS):  # 8-10.5s: Lösung
            sub=f-int(8*FPS)
            bg=zoom_crop(darken(vf(c4,sub),0.35),1.0+0.002*sub)
            bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(8*FPS),4)
        else:  # 10.5-13s: CTA
            sub=f-int(10.5*FPS)
            if sub<10:
                v=prep(darken(vf(c4,len(c4)-1),0.30))
                p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # ── HOOK: POV slam (0-1.5s) ──
        if f<int(1.5*FPS):
            # "POV:" slams in
            impact_text(d,"POV:",360,FIMPACT,FHOOK,GOLD,f,0,10)
            # Then subtitle
            a2=fin(f,6,8);o2=sup(f,6,10,60)
            shtext(d,"Deine Oma ruft an.",510+o2,FHS,col(WHITE,a2),4)

        # ── GUILT (1.5-3.5s) ──
        elif f<int(3.5*FPS):
            sf=int(1.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,50)
            shtext(d,"\"Ich hab leider",430+o,FQUOTE,col(GOLD_L,a),4)
            shtext(d,"keine Zeit.\"",510+o,FQUOTE,col(GOLD_L,a),4)
            accent_line(d,f,sf+10,600)
            a2=fin(f,sf+18,8);o2=sup(f,sf+18,10,40)
            shtext(d,"Du legst auf.",630+o2,FB,col(CREAM,a2),3)
            a3=fin(f,sf+26,8);o3=sup(f,sf+26,10,40)
            shtext(d,"Schlechtes Gewissen.",700+o3,FBB,col(RED,a3),3,glow=True)

        # ── PROBLEM: emotional weight (3.5-5.5s) ──
        elif f<int(5.5*FPS):
            sf=int(3.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Sie sitzt allein.",440+o,FHS,col(WHITE,a),4)
            a2=fin(f,sf+14,6);o2=sup(f,sf+14,8,45)
            shtext(d,"Den ganzen Tag.",530+o2,FHS,col(CREAM,a2),4)
            accent_line(d,f,sf+22,620)
            a3=fin(f,sf+26,8);o3=sup(f,sf+26,10,40)
            shtext(d,"Und wartet.",650+o3,FH,col(RED,a3),5,glow=True)

        # ── WENDUNG: hope (5.5-8s) ──
        elif f<int(8*FPS):
            sf=int(5.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,50)
            shtext(d,"Aber stell dir vor:",420+o,FB,col(CREAM,a),3)
            # IMPACT: "Jemand IST da."
            impact_text(d,"Jemand IST da.",520,FIMPACT,FH,GOLD,f,sf+12,14)
            accent_line(d,f,sf+20,610)
            items=[("Trinkt Tee mit ihr.",CREAM),("Hört ihre Geschichten.",CREAM),
                   ("Lacht mit ihr.",GOLD_L)]
            y=640
            for i,(t,c) in enumerate(items):
                a2=fin(f,sf+24+i*8,8);o2=sup(f,sf+24+i*8,10,35)
                if a2<=0:continue
                y+=shtext(d,t,y+o2,FB,col(c,a2),3)+14

        # ── LÖSUNG (8-10.5s) ──
        elif f<int(10.5*FPS):
            sf=int(8*FPS)
            impact_text(d,"Alltagsbegleitung.",420,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,510)
            a2=fin(f,sf+14,8);o2=sup(f,sf+14,10,40)
            shtext(d,"Kein Pflegedienst.",540+o2,FB,col(CREAM,a2),3)
            a3=fin(f,sf+22,8);o3=sup(f,sf+22,10,40)
            shtext(d,"Ein Mensch mit Herz.",620+o3,FHS,col(WHITE,a3),4,glow=True)
            counter_text(d,131,"","€/Monat",730,FC,GOLD,f,sf+30,18)

        # ── CTA (10.5-13s) ──
        else:
            sf=int(10.5*FPS)
            a=fin(f,sf,8)
            shtext(d,"131€/Monat",420,FC,col(GOLD,a),4,glow=True)
            a2=fin(f,sf+8,8)
            shtext(d,"zahlt die Pflegekasse.",510,FB,col(CREAM,a2),3)
            cta(d,f,sf+12,"Oma wartet nicht. Du auch nicht.")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    a:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28b: "3 Zeichen" (15s) — LISTICLE with counter + flash cuts
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
    app=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        # 0-2: hook, 2-5: #1, 5-8: #2, 8-11: #3, 11-13: lösung, 13-15: cta
        zf=1.0+0.001*f
        if f<int(2*FPS):
            bg=zoom_crop(darken(vf(c1,f),0.42),zf);bg=prep(bg)
        elif f<int(5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(8*FPS):
            sub=f-int(5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5*FPS),4)
            bg=red_vignette(bg,f,int(6*FPS),int(1.5*FPS))
        elif f<int(11*FPS):
            sub=f-int(8*FPS);bg=zoom_crop(darken(vf(c4,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(8*FPS),4)
            bg=red_vignette(bg,f,int(9.5*FPS),int(1.5*FPS))
        elif f<int(13*FPS):
            sub=f-int(11*FPS);bg=zoom_crop(darken(vf(c5,sub),0.35),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(11*FPS),4)
        else:
            sub=f-int(13*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s): Big "3" slams in
        if f<int(2*FPS):
            impact_text(d,"3",300,FIMPACT,FNUM,GOLD,f,0,12)
            a=fin(f,6,8);o=sup(f,6,10,50)
            shtext(d,"Zeichen, dass dein",500+o,FHS,col(WHITE,a),4)
            shtext(d,"Elternteil Hilfe braucht",580+o,FHS,col(WHITE,a),4)

        # ZEICHEN 1 (2-5s)
        elif f<int(5*FPS):
            sf=int(2*FPS)
            impact_text(d,"1",280,FIMPACT,FNUM,GOLD,f,sf,10)
            accent_line(d,f,sf+8,420)
            a=fin(f,sf+10,6);o=sup(f,sf+10,8,40)
            shtext(d,"Der Kühlschrank",450+o,FHS,col(WHITE,a),4)
            shtext(d,"ist immer leer.",530+o,FHS,col(WHITE,a),4)
            accent_line(d,f,sf+20,620)
            a2=fin(f,sf+24,8);o2=sup(f,sf+24,10,35)
            shtext(d,"Früher hat sie für",650+o2,FB,col(CREAM,a2),3)
            shtext(d,"10 Leute gekocht.",710+o2,FB,col(CREAM,a2),3)

        # ZEICHEN 2 (5-8s)
        elif f<int(8*FPS):
            sf=int(5*FPS)
            impact_text(d,"2",280,FIMPACT,FNUM,GOLD,f,sf,10)
            accent_line(d,f,sf+8,420)
            a=fin(f,sf+10,6);o=sup(f,sf+10,8,40)
            shtext(d,"Sie geht kaum",450+o,FHS,col(WHITE,a),4)
            shtext(d,"noch raus.",530+o,FHS,col(WHITE,a),4)
            accent_line(d,f,sf+20,620)
            a2=fin(f,sf+22,8);o2=sup(f,sf+22,10,40)
            shtext(d,"\"Ich brauch nichts.\"",650+o2,FQUOTE,col(GOLD_L,a2),4)
            a3=fin(f,sf+32,8);o3=sup(f,sf+32,10,35)
            shtext(d,"Sagt sie. Jeden Tag.",700+o3,FB,col(RED,a3),3,glow=True)

        # ZEICHEN 3 (8-11s)
        elif f<int(11*FPS):
            sf=int(8*FPS)
            impact_text(d,"3",280,FIMPACT,FNUM,RED,f,sf,10)
            accent_line(d,f,sf+8,420)
            a=fin(f,sf+10,6);o=sup(f,sf+10,8,40)
            shtext(d,"Du rufst an —",450+o,FHS,col(WHITE,a),4)
            a2=fin(f,sf+16,6);o2=sup(f,sf+16,8,50)
            shtext(d,"niemand geht ran.",540+o2,FH,col(RED,a2),5,glow=True)
            accent_line(d,f,sf+26,640)
            a3=fin(f,sf+30,8);o3=sup(f,sf+30,10,40)
            shtext(d,"Dein Herz rast.",670+o3,FHS,col(CREAM,a3),4)
            a4=fin(f,sf+40,8);o4=sup(f,sf+40,10,35)
            shtext(d,"Jedes. Einzelne. Mal.",750+o4,FBB,col(GOLD_L,a4),3,glow=True)

        # LÖSUNG (11-13s)
        elif f<int(13*FPS):
            sf=int(11*FPS)
            impact_text(d,"Es gibt Hilfe.",420,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,520)
            a2=fin(f,sf+14,8);o2=sup(f,sf+14,10,40)
            shtext(d,"Alltagsbegleitung.",550+o2,FHS,col(WHITE,a2),4)
            a3=fin(f,sf+22,8);o3=sup(f,sf+22,10,35)
            shtext(d,"Jemand schaut regelmäßig",640+o3,FB,col(CREAM,a3),3)
            shtext(d,"nach deinen Eltern.",700+o3,FB,col(CREAM,a3),3)

        # CTA (13-15s)
        else:
            sf=int(13*FPS)
            counter_text(d,131,"","€/Monat",420,FC,GOLD,f,sf,18)
            a2=fin(f,sf+10,8)
            shtext(d,"ab Pflegegrad 1",520,FB,col(CREAM,a2),3)
            cta(d,f,sf+15,"Warte nicht auf Zeichen Nr. 4.")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    b:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28c: "Diese App gibt es wirklich" (12s) — Disbelief + Reveal
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
    app=prep(darken(load_screen("screenshot-2-profil.mp4" if False else "screenshot-2-profil.png").filter(ImageFilter.GaussianBlur(18)),0.28))
    appClean=load_screen("screenshot-1-home.png")

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):
            bg=zoom_crop(darken(vf(c1,f),0.42),zf);bg=prep(bg)
        elif f<int(4.5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(7*FPS):
            sub=f-int(4.5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(4.5*FPS),4)
        elif f<int(9.5*FPS):
            sub=f-int(7*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(7*FPS),4)
        else:
            sub=f-int(9.5*FPS)
            if sub<10:v=prep(darken(vf(c4,len(c4)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s)
        if f<int(2*FPS):
            impact_text(d,"Diese App",380,FIMPACT,FH,GOLD,f,0,12)
            a2=fin(f,8,8);o2=sup(f,8,10,50)
            shtext(d,"gibt es wirklich.",520+o2,FH,col(WHITE,a2),5)

        # FEATURES (2-4.5s)
        elif f<int(4.5*FPS):
            sf=int(2*FPS)
            items=[("Du öffnest die App.",CREAM),("Wählst deine Leistung.",CREAM),
                   None,("Gesellschaft. Einkaufen.",GOLD_L),("Arztbegleitung. Fahrdienst.",GOLD_L),
                   None,("Innerhalb von 48h",WHITE),("kommt jemand.",WHITE)]
            y=380
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c=item;a=fin(f,sf+4+i*5,6);o=sup(f,sf+4+i*5,8,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,FB,col(c,a),3)+10

        # TRUST (4.5-7s)
        elif f<int(7*FPS):
            sf=int(4.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Geprüft.",430+o,FH,col(WHITE,a),4)
            a2=fin(f,sf+12,6);o2=sup(f,sf+12,8,45)
            shtext(d,"Versichert.",520+o2,FH,col(WHITE,a2),4)
            a3=fin(f,sf+20,6);o3=sup(f,sf+20,8,45)
            shtext(d,"Zertifiziert.",610+o3,FH,col(GOLD,a3),4,glow=True)
            accent_line(d,f,sf+28,700)
            a4=fin(f,sf+32,8);o4=sup(f,sf+32,10,35)
            shtext(d,"Keine Pflege. Menschliche Nähe.",730+o4,FB,col(CREAM,a4),3)

        # MONEY (7-9.5s)
        elif f<int(9.5*FPS):
            sf=int(7*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,40)
            shtext(d,"Und das Beste?",400+o,FB,col(CREAM,a),3)
            counter_text(d,131,"","€",480,FIMPACT,GOLD,f,sf+10,20)
            a3=fin(f,sf+25,8);o3=sup(f,sf+25,10,35)
            shtext(d,"pro Monat von der Pflegekasse.",660+o3,FB,col(CREAM,a3),3)
            a4=fin(f,sf+33,8);o4=sup(f,sf+33,10,35)
            shtext(d,"Ab Pflegegrad 1. Sofort.",730+o4,FSM,col(GOLD_L,a4),2)

        # CTA (9.5-12s)
        else:
            sf=int(9.5*FPS)
            impact_text(d,"AlltagsEngel",400,FIMPACT,FH,GOLD,f,sf,14)
            a2=fin(f,sf+10,8)
            shtext(d,"Die App für Alltagsbegleitung.",530,FB,col(CREAM,a2),3)
            cta(d,f,sf+15,"Jetzt herunterladen. Kostenlos.")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    c:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28d: "20€/Stunde Nebenjob mit Sinn" (14s) — Recruiting
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
    app=prep(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):
            bg=zoom_crop(darken(vf(c1,f),0.42),zf);bg=prep(bg)
        elif f<int(4.5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(7*FPS):
            sub=f-int(4.5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.36),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(4.5*FPS),4)
        elif f<int(10*FPS):
            sub=f-int(7*FPS);bg=zoom_crop(darken(vf(c4,sub),0.38),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(7*FPS),4)
        elif f<int(12*FPS):
            sub=f-int(10*FPS);bg=zoom_crop(darken(vf(c5,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(10*FPS),4)
        else:
            sub=f-int(12*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s): Money slams
        if f<int(2*FPS):
            impact_text(d,"20€",320,FIMPACT,FBG,GOLD,f,0,12)
            a2=fin(f,8,8);o2=sup(f,8,10,50)
            shtext(d,"pro Stunde.",500+o2,FHS,col(WHITE,a2),4)
            a3=fin(f,16,8);o3=sup(f,16,10,40)
            shtext(d,"Dein sinnvollster Nebenjob.",600+o3,FB,col(CREAM,a3),3)

        # WAS DU MACHST (2-4.5s)
        elif f<int(4.5*FPS):
            sf=int(2*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Du gehst spazieren.",420+o,FHS,col(CREAM,a),4)
            a2=fin(f,sf+12,6);o2=sup(f,sf+12,8,45)
            shtext(d,"Du trinkst Kaffee.",510+o2,FHS,col(CREAM,a2),4)
            a3=fin(f,sf+20,6);o3=sup(f,sf+20,8,45)
            shtext(d,"Du hörst zu.",600+o3,FHS,col(GOLD_L,a3),4,glow=True)
            accent_line(d,f,sf+28,690)
            a4=fin(f,sf+32,8);o4=sup(f,sf+32,10,35)
            shtext(d,"Mit jemandem, der genau",720+o4,FB,col(CREAM,a4),3)
            shtext(d,"das braucht.",778+o4,FBB,col(WHITE,a4),3)

        # WARUM BESONDERS (4.5-7s)
        elif f<int(7*FPS):
            sf=int(4.5*FPS)
            items=[("Kein Stress.",WHITE,FHS),("Kein Büro.",WHITE,FHS),
                   ("Keine Pflege.",GOLD_L,FHS),None,
                   ("Flexible Zeiten.",CREAM,FB),
                   ("Echte Dankbarkeit.",CREAM,FB),
                   ("Ein gutes Gefühl.",GOLD,FBB)]
            y=380
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,sf+4+i*5,6);o=sup(f,sf+4+i*5,8,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12

        # WER KANN DAS (7-10s)
        elif f<int(10*FPS):
            sf=int(7*FPS)
            impact_text(d,"Wer kann das?",380,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,490)
            items=[("Studenten.",CREAM),("Rentner.",CREAM),
                   ("Hausfrauen.",CREAM),("Schichtarbeiter.",CREAM)]
            y=520
            for i,(t,c) in enumerate(items):
                a=fin(f,sf+14+i*6,6);o=sup(f,sf+14+i*6,8,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,FB,col(c,a),3)+10
            accent_line(d,f,sf+40,y+10)
            a5=fin(f,sf+44,8);o5=sup(f,sf+44,10,40)
            shtext(d,"Jeder mit Herz",y+30+o5,FHS,col(WHITE,a5),4)
            shtext(d,"und 2-3 Stunden/Woche.",y+90+o5,FB,col(CREAM,a5),3)

        # ENGEL WERDEN (10-12s)
        elif f<int(12*FPS):
            sf=int(10*FPS)
            impact_text(d,"Werde Engel.",420,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,530)
            a2=fin(f,sf+14,8);o2=sup(f,sf+14,10,40)
            shtext(d,"Verdiene Geld",560+o2,FHS,col(WHITE,a2),4)
            a3=fin(f,sf+22,8);o3=sup(f,sf+22,10,35)
            shtext(d,"mit Menschlichkeit.",640+o3,FHS,col(GOLD_L,a3),4,glow=True)

        # CTA (12-14s)
        else:
            sf=int(12*FPS)
            counter_text(d,20,"","€/Stunde",420,FC,GOLD,f,sf,15)
            a2=fin(f,sf+10,8)
            shtext(d,"Flexibel. Sinnvoll. Echt.",520,FB,col(CREAM,a2),3)
            cta(d,f,sf+12,"alltagsengel.care — Jetzt bewerben")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    d:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V28e: "Stell dir vor: Oma lächelt wieder" (15s) — MAX EMOTION
# Flash cuts, red pulses, impact slams, zoom, counter
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
    app=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):
            bg=zoom_crop(darken(vf(c1,f),0.45),zf);bg=prep(bg)
        elif f<int(4.5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.42),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
            bg=red_vignette(bg,f,int(3*FPS),int(1.5*FPS))
        elif f<int(7*FPS):
            sub=f-int(4.5*FPS);bg=zoom_crop(darken(vf(c2,sub+40),0.40),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(4.5*FPS),4)
            bg=red_vignette(bg,f,int(5.5*FPS),int(1*FPS))
        elif f<int(9.5*FPS):
            sub=f-int(7*FPS);bg=zoom_crop(darken(vf(c3,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(7*FPS),4)
        elif f<int(12*FPS):
            sub=f-int(9.5*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(9.5*FPS),4)
        else:
            sub=f-int(12*FPS)
            if sub<12:
                v=zoom_crop(darken(vf(c5,sub),0.35),1.0+0.002*sub);v=prep(v)
                p=sub/12;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s): Emotional future
        if f<int(2*FPS):
            a=fin(f,0,6);o=sup(f,0,8,50)
            shtext(d,"Stell dir vor:",400+o,FB,col(CREAM,a),3)
            impact_text(d,"Oma lächelt",490,FIMPACT,FH,GOLD,f,5,14)
            a3=fin(f,14,8);o3=sup(f,14,10,45)
            shtext(d,"wieder.",610+o3,FH,col(GOLD_L,a3),5,glow=True)

        # PROBLEM (2-4.5s): Why she doesn't smile
        elif f<int(4.5*FPS):
            sf=int(2*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Seit Wochen",430+o,FHS,col(CREAM,a),4)
            shtext(d,"redet sie kaum.",510+o,FHS,col(CREAM,a),4)
            accent_line(d,f,sf+14,600)
            a2=fin(f,sf+16,6);o2=sup(f,sf+16,8,50)
            shtext(d,"Sitzt am Fenster.",630+o2,FB,col(CREAM,a2),3)
            a3=fin(f,sf+24,8);o3=sup(f,sf+24,10,50)
            shtext(d,"Wartet.",710+o3,FH,col(RED,a3),5,glow=True)

        # DEEPER (4.5-7s): Loneliness
        elif f<int(7*FPS):
            sf=int(4.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,45)
            shtext(d,"Auf was?",430+o,FHS,col(CREAM,a),4)
            a2=fin(f,sf+12,8);o2=sup(f,sf+12,10,50)
            shtext(d,"Auf jemanden.",530+o2,FH,col(GOLD,a2),5,glow=True)
            accent_line(d,f,sf+22,640)
            a3=fin(f,sf+26,8);o3=sup(f,sf+26,10,40)
            shtext(d,"Nicht auf Medikamente.",670+o3,FB,col(CREAM,a3),3)
            a4=fin(f,sf+34,8);o4=sup(f,sf+34,10,40)
            shtext(d,"Nicht auf Therapie.",740+o4,FB,col(CREAM,a4),3)
            a5=fin(f,sf+42,8);o5=sup(f,sf+42,10,40)
            shtext(d,"Auf einen Menschen.",810+o5,FHS,col(GOLD_L,a5),4,glow=True)

        # WENDUNG (7-9.5s): Someone comes
        elif f<int(9.5*FPS):
            sf=int(7*FPS)
            impact_text(d,"Dann klingelt es.",400,FIMPACT,FH,WHITE,f,sf,14)
            accent_line(d,f,sf+10,510)
            items=[("Ein AlltagsEngel.",GOLD_L,FH),None,
                   ("Geht mit ihr spazieren.",CREAM,FB),
                   ("Kocht zusammen.",CREAM,FB),
                   ("Erzählt. Lacht. Lebt.",GOLD_L,FHS)]
            y=540
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,sf+14+i*7,6);o=sup(f,sf+14+i*7,8,30)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12

        # EMOTIONAL PEAK (9.5-12s): She calls YOU
        elif f<int(12*FPS):
            sf=int(9.5*FPS)
            a=fin(f,sf+4,6);o=sup(f,sf+4,8,40)
            shtext(d,"Nach 2 Wochen",420+o,FB,col(CREAM,a),3)
            shtext(d,"ruft sie DICH an:",490+o,FBB,col(WHITE,a),3)
            accent_line(d,f,sf+14,570)
            a2=fin(f,sf+16,8);o2=sup(f,sf+16,10,50)
            shtext(d,"\"Der nette Herr",600+o2,FQUOTE,col(GOLD_L,a2),4)
            shtext(d,"war heute wieder da.\"",670+o2,FQUOTE,col(GOLD_L,a2),4)
            accent_line(d,f,sf+30,760)
            a3=fin(f,sf+34,8);o3=sup(f,sf+34,10,45)
            shtext(d,"Und du hörst:",790+o3,FB,col(CREAM,a3),3)
            impact_text(d,"Sie lächelt.",870,FIMPACT,FH,GOLD,f,sf+40,14)

        # CTA (12-15s)
        else:
            sf=int(12*FPS)
            impact_text(d,"Alltagsbegleitung",390,FIMPACT,FH,GOLD,f,sf,14)
            a2=fin(f,sf+10,8)
            shtext(d,"verändert Leben.",520,FH,col(WHITE,a2),5)
            accent_line(d,f,sf+16,610)
            counter_text(d,131,"","€/Monat",640,FC,GOLD,f,sf+18,18)
            a4=fin(f,sf+28,8)
            shtext(d,"Pflegekasse zahlt.",740,FB,col(CREAM,a4),3)
            cta(d,f,sf+32,"Gib ihr einen Grund zu lächeln.")

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
    print("\n✅ All 5 V28 EMOTIONAL videos done!")

if __name__=="__main__":main()
