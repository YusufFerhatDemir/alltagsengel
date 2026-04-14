#!/usr/bin/env python3
"""V30 VIRAL: 5 TikTok videos optimized for algorithm — strong hooks, fast cuts, trending formats."""
import os,shutil,subprocess,sys,math
from PIL import Image,ImageDraw,ImageFont,ImageFilter

W,H=1080,1920; FPS=30
BASE="/Users/work/alltagsengel"
SRC=os.path.join(BASE,"social-media-grafiken")
OUT=os.path.join(BASE,"social-media-grafiken/tiktok-v30")
TMP=os.path.join(BASE,"_tmp_v30")
CLIPDIR=os.path.join(BASE,"_clips_v30")

GOLD=(201,150,60);GOLD_L=(219,168,74);CREAM=(245,240,230)
WHITE=(255,255,255);RED=(220,50,40);DARK=(13,10,8);BLACK=(0,0,0)
GREEN=(40,180,80);BLUE=(60,120,220)

def _f(sz):
    for p in ["/System/Library/Fonts/Supplemental/Georgia.ttf","/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()
def _s(sz):
    for p in ["/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()

FH=_f(72);FHS=_f(56);FB=_s(46);FSM=_s(36);FC=_s(56)
FU=_f(50);FHOOK=_f(84);FNUM=_f(110);FIMPACT=_f(130)
FBIG=_f(100);FMED=_f(60);FTAG=_s(32);FCTA=_s(42)
FMYTHOS=_f(68);FFAKT=_f(68);FCHECK=_f(80)

# ── easing ──
def ease(t):return 1-(1-min(max(t,0),1))**3
def ease_elastic(t):
    t=min(max(t,0),1)
    if t==0 or t==1:return t
    return 2**(-10*t)*math.sin((t-0.1)*5*math.pi)+1
def ease_back(t):
    t=min(max(t,0),1);s=1.7
    return t*t*((s+1)*t-s)
def ease_bounce(t):
    t=min(max(t,0),1)
    if t<1/2.75: return 7.5625*t*t
    elif t<2/2.75: t-=1.5/2.75; return 7.5625*t*t+0.75
    elif t<2.5/2.75: t-=2.25/2.75; return 7.5625*t*t+0.9375
    else: t-=2.625/2.75; return 7.5625*t*t+0.984375

def fin(f,s,d=8):
    if f<s:return 0.0
    if f>=s+d:return 1.0
    return ease((f-s)/d)
def fout(f,s,d=8):
    if f<s:return 1.0
    if f>=s+d:return 0.0
    return 1-ease((f-s)/d)
def sup(f,s,d=10,dist=50):
    if f<s:return dist
    if f>=s+d:return 0
    return int(dist*(1-ease((f-s)/d)))
def col(c,a):return tuple(max(0,min(255,int(v*a))) for v in c)

# ── ZOOM: Ken Burns ──
def zoom_crop(img,z):
    nw,nh=int(W/z),int(H/z)
    l=(img.width-nw)//2;t=(img.height-nh)//2
    return img.crop((l,t,l+nw,t+nh)).resize((W,H),Image.LANCZOS)

# ── FLASH ──
def flash(bg,f,start,dur=6):
    if f<start or f>=start+dur:return bg
    a=(1-(f-start)/dur)**2
    return Image.blend(bg,Image.new("RGB",(W,H),(255,255,255)),a*0.85)

# ── RED PULSE ──
def red_vignette(bg,f,start,dur=20):
    if f<start or f>=start+dur:return bg
    t=(f-start)/dur;intensity=math.sin(t*math.pi)*0.15
    return Image.blend(bg,Image.new("RGB",(W,H),(180,20,10)),intensity)

# ── GOLD PULSE ──
def gold_pulse(bg,f,start,dur=15):
    if f<start or f>=start+dur:return bg
    t=(f-start)/dur;intensity=math.sin(t*math.pi)*0.08
    return Image.blend(bg,Image.new("RGB",(W,H),(201,150,60)),intensity)

# ── darken + grads ──
def darken(img,a=0.40):return Image.blend(img,Image.new("RGB",(W,H),(0,0,0)),1-a)
def grad_bot(img,h=550,op=240):
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    for i in range(h):od.line([(0,H-h+i),(W,H-h+i)],fill=(13,10,8,int(op*(i/h)**1.5)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
def grad_top(img,h=350,op=200):
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    for i in range(h):od.line([(0,i),(W,i)],fill=(13,10,8,int(op*((h-i)/h)**1.5)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
def prep(img):return grad_bot(grad_top(img))

# ── TEXT helpers ──
def shtext(d,text,y,font,fill,sh=3,glow=False):
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    if glow:
        for dx in range(-2,3):
            for dy in range(-2,3):
                d.text((x+dx,y+dy),text,font=font,fill=(fill[0]//3,fill[1]//3,fill[2]//3))
    d.text((x+sh,y+sh),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)
    return bb[3]-bb[1]

def text_centered(d,text,y,font,fill):
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+3,y+3),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)
    return bb[3]-bb[1]

def impact_text(d,text,y_target,font_big,font_final,fill,f,start,settle=12):
    if f<start:return 0
    t=min((f-start)/settle,1.0)
    if t<1.0:
        a=min(t*3,1.0);font=font_big if t<0.3 else font_final
    else:
        a=1.0;font=font_final
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+4,y_target+4),text,font=font,fill=(0,0,0))
    d.text((x,y_target),text,font=font,fill=col(fill,a))
    return bb[3]-bb[1]

def counter_text(d,target,prefix,suffix,y,font,fill,f,start,dur=20):
    if f<start:return
    t=min((f-start)/dur,1.0);t=ease(t)
    val=int(target*t)
    text=f"{prefix}{val}{suffix}"
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];x=(W-tw)//2
    d.text((x+4,y+4),text,font=font,fill=(0,0,0))
    d.text((x,y),text,font=font,fill=fill)

# ── SHAKE: screen shake on impact ──
def shake(img,f,start,dur=6,intensity=8):
    if f<start or f>=start+dur:return img
    t=(f-start)/dur
    dx=int(intensity*math.sin(t*20)*(1-t))
    dy=int(intensity*math.cos(t*15)*(1-t))
    shifted=Image.new("RGB",(W,H),BLACK)
    shifted.paste(img,(dx,dy))
    return shifted

# ── STRIPE: animated text stripe (like TikTok native) ──
def stripe_bg(d,y,h,color,alpha,f,start):
    a=fin(f,start,6)
    if a<=0:return
    for i in range(h):
        row_a=int(alpha*a)
        d.line([(0,y+i),(W,y+i)],fill=(*color,))

def logo(d,f):
    a=fin(f,0,12)
    if a<=0:return
    c=col(GOLD,a);bb=d.textbbox((0,0),"AlltagsEngel",font=FTAG);tw=bb[2]-bb[0]
    d.text(((W-tw)//2+2,57),"AlltagsEngel",font=FTAG,fill=(0,0,0))
    d.text(((W-tw)//2,55),"AlltagsEngel",font=FTAG,fill=c)
    d.line([(W//2-60,88),(W//2+60,88)],fill=c,width=1)

def cta(d,f,sf,line1="alltagsengel.care",line2="Jetzt App laden."):
    a=fin(f,sf,10)
    if a<=0:return
    gc=col(GOLD,a);cc=col(CREAM,a)
    y=H-310;d.line([(W//2-280,y),(W//2+280,y)],fill=gc,width=2);y+=30
    shtext(d,line1,y,FU,gc,3,glow=True);y+=70
    shtext(d,line2,y,FSM,cc,2)

def accent_line(d,f,start,y,w=400):
    a=fin(f,start,8)
    if a<=0:return
    prog=ease(min((f-start)/15,1.0))
    hw=int(w*prog/2)
    d.line([(W//2-hw,y),(W//2+hw,y)],fill=col(GOLD,a),width=2)

# ── pill box (rounded rect with text) ──
def pill(d,text,cx,cy,font,fg,bg_color,f,start):
    a=fin(f,start,6)
    if a<=0:return
    bb=d.textbbox((0,0),text,font=font);tw=bb[2]-bb[0];th=bb[3]-bb[1]
    px,py=20,10
    x1=cx-tw//2-px;y1=cy-th//2-py;x2=cx+tw//2+px;y2=cy+th//2+py
    d.rounded_rectangle([(x1,y1),(x2,y2)],radius=15,fill=col(bg_color,a))
    d.text((cx-tw//2,cy-th//2),text,font=font,fill=col(fg,a))

# ── clip extraction ──
def extract_clips():
    """Extract fresh clips from source videos not heavily used before."""
    if os.path.exists(CLIPDIR) and len(os.listdir(CLIPDIR))>=20:
        print("  Clips already extracted, reusing...")
        return
    os.makedirs(CLIPDIR,exist_ok=True)
    sources=[
        # (source_file, start_sec, duration, output_name)
        (f"{SRC}/REELS-engel-walkthrough.mp4",0,4,"engwalk_0s.mp4"),
        (f"{SRC}/REELS-engel-walkthrough.mp4",8,4,"engwalk_8s.mp4"),
        (f"{SRC}/REELS-engel-walkthrough.mp4",14,4,"engwalk_14s.mp4"),
        (f"{SRC}/REELS-kunde-walkthrough.mp4",0,4,"kwalk_0s.mp4"),
        (f"{SRC}/REELS-kunde-walkthrough.mp4",8,4,"kwalk_8s.mp4"),
        (f"{SRC}/REELS-kunde-walkthrough.mp4",14,4,"kwalk_14s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-kunden.mp4",2,4,"fkund_2s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-kunden.mp4",10,4,"fkund_10s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-kunden.mp4",18,4,"fkund_18s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-kunden.mp4",26,4,"fkund_26s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-engel-recruiting.mp4",2,4,"frec_2s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-engel-recruiting.mp4",10,4,"frec_10s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-engel-recruiting.mp4",18,4,"frec_18s.mp4"),
        (f"{SRC}/neue-kampagne-2/FINAL-engel-recruiting.mp4",26,4,"frec_26s.mp4"),
        (f"{SRC}/neue-kampagne-2/REEL-kunden.mp4",0,4,"rkund_0s.mp4"),
        (f"{SRC}/neue-kampagne-2/REEL-kunden.mp4",6,4,"rkund_6s.mp4"),
        (f"{SRC}/neue-kampagne-2/REEL-engel-recruiting.mp4",0,4,"rrec_0s.mp4"),
        (f"{SRC}/neue-kampagne-2/REEL-engel-recruiting.mp4",6,4,"rrec_6s.mp4"),
        (f"{SRC}/REELS-viral-real-v1.mp4",0,4,"vreal_0s.mp4"),
        (f"{SRC}/REELS-viral-real-v1.mp4",12,4,"vreal_12s.mp4"),
        (f"{SRC}/REELS-viral-real-v1.mp4",20,4,"vreal_20s.mp4"),
        (f"{SRC}/REELS-viral-nomusic-v2.mp4",0,4,"vnm_0s.mp4"),
        (f"{SRC}/REELS-viral-nomusic-v2.mp4",16,4,"vnm_16s.mp4"),
        (f"{SRC}/REELS-viral-nomusic-v2.mp4",32,4,"vnm_32s.mp4"),
        (f"{SRC}/REELS-gesellschaft-neu.mp4",0,4,"gesell.mp4"),
        (f"{SRC}/REELS-einkauf-neu.mp4",0,4,"einkauf.mp4"),
        (f"{SRC}/REELS-spaziergang-neu.mp4",0,4,"spazier.mp4"),
        (f"{SRC}/REELS-arztbegleitung-neu.mp4",0,4,"arzt.mp4"),
        (f"{SRC}/REELS-cafe-freizeit-neu.mp4",0,4,"cafe.mp4"),
    ]
    for src,ss,dur,out in sources:
        op=os.path.join(CLIPDIR,out)
        if os.path.exists(op):continue
        subprocess.run(["ffmpeg","-y","-ss",str(ss),"-i",src,"-t",str(dur),
            "-vf",f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
            "-r",str(FPS),"-c:v","libx264","-preset","fast","-an",op],
            capture_output=True)
        print(f"    extracted {out}")

_ec=[0]
def ext(clip_name):
    _ec[0]+=1;d=os.path.join(TMP,f"e{_ec[0]}")
    if os.path.exists(d):shutil.rmtree(d)
    os.makedirs(d)
    subprocess.run(["ffmpeg","-y","-i",os.path.join(CLIPDIR,clip_name),
        "-vf",f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
        os.path.join(d,"f_%05d.png")],capture_output=True,check=True)
    frames=sorted([os.path.join(d,ff) for ff in os.listdir(d) if ff.endswith(".png")])
    print(f"    {clip_name}: {len(frames)}f")
    return frames,d

def vf(frames,idx):return Image.open(frames[idx%len(frames)]).convert("RGB")

def encode(fd,name,total):
    out=os.path.join(OUT,name)
    subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",os.path.join(fd,"f_%05d.png"),
        "-c:v","libx264","-pix_fmt","yuv420p","-crf","18","-preset","medium",out],
        capture_output=True,check=True)
    sz=os.path.getsize(out)/(1024*1024)
    dur=total/FPS
    print(f"  \u2713 {name} ({dur:.0f}s, {sz:.1f}MB)")
    return out

# ═══════════════════════════════════════════════════════════════
# V30a: "STOPP \u270b Du verschenkst 131\u20ac" (12s) — HOOK FORMAT
# Aggressive stop-scroll hook → educational → CTA
# ═══════════════════════════════════════════════════════════════
def make_v30a():
    total=12*FPS;fd=os.path.join(TMP,"v30a")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V30a clips...")
    c1,t1=ext("vreal_0s.mp4")       # real footage for hook
    c2,t2=ext("gesell.mp4")         # Gesellschaft scene
    c3,t3=ext("fkund_2s.mp4")       # Kunden scene
    c4,t4=ext("engwalk_0s.mp4")     # App walkthrough
    c5,t5=ext("kwalk_8s.mp4")       # Kunden walkthrough

    # Scene boundaries (in frames)
    s1=0;s2=int(2*FPS);s3=int(4.5*FPS);s4=int(7*FPS);s5=int(9.5*FPS)

    for f in range(total):
        zf=1.0+0.002*f
        if f<s2:
            bg=zoom_crop(darken(vf(c1,f),0.35),zf);bg=prep(bg)
        elif f<s3:
            bg=zoom_crop(darken(vf(c2,f-s2),0.40),1.0+0.003*(f-s2));bg=prep(bg)
        elif f<s4:
            bg=zoom_crop(darken(vf(c3,f-s3),0.40),1.0+0.003*(f-s3));bg=prep(bg)
        elif f<s5:
            bg=zoom_crop(darken(vf(c4,f-s4),0.38),1.0+0.003*(f-s4));bg=prep(bg)
        else:
            bg=zoom_crop(darken(vf(c5,f-s5),0.38),1.0+0.003*(f-s5));bg=prep(bg)

        # Flash transitions
        bg=flash(bg,f,s2);bg=flash(bg,f,s3);bg=flash(bg,f,s4);bg=flash(bg,f,s5)
        # Red vignette on hook
        bg=red_vignette(bg,f,0,int(2*FPS))
        # Shake on STOPP
        bg=shake(bg,f,3,8,12)

        d=ImageDraw.Draw(bg)
        logo(d,f)

        # Scene 1: STOPP hook (0-2s)
        if f<s2:
            impact_text(d,"STOPP \u270b",700,FIMPACT,FBIG,RED,f,2,10)
            if f>=12:
                shtext(d,"Du verschenkst",830,FHOOK,WHITE)
                impact_text(d,"131\u20ac / Monat",920,FIMPACT,FBIG,GOLD_L,f,15,12)

        # Scene 2: Was ist das? (2-4.5s)
        elif f<s3:
            sf=s2+5
            shtext(d,"\u00a745b SGB XI",680,FHS,GOLD_L,glow=True)
            accent_line(d,f,sf,740)
            if f>=sf+5:
                shtext(d,"Entlastungsbetrag",770,FHOOK,WHITE)
            if f>=sf+12:
                shtext(d,"Jeder mit Pflegegrad",870,FB,CREAM)
                shtext(d,"bekommt 131\u20ac/Monat",930,FB,CREAM)

        # Scene 3: Wof\u00fcr? (4.5-7s)
        elif f<s4:
            sf=s3+5
            shtext(d,"Wof\u00fcr?",680,FBIG,GOLD_L)
            items=["Einkaufshilfe","Arztbegleitung","Spaziergang","Haushaltshilfe"]
            for i,item in enumerate(items):
                t_start=sf+i*8
                if f>=t_start:
                    a=fin(f,t_start,6)
                    text_centered(d,f"\u2713 {item}",780+i*65,FB,col(WHITE,a))

        # Scene 4: Geld verfällt! (7-9.5s)
        elif f<s5:
            sf=s4+5
            bg=red_vignette(bg,f,s4,int(2*FPS))
            d=ImageDraw.Draw(bg)
            shtext(d,"Nicht genutzt?",700,FHOOK,RED)
            if f>=sf+6:
                shtext(d,"Geld verf\u00e4llt!",810,FBIG,WHITE)
            if f>=sf+14:
                counter_text(d,1572,"","€/Jahr weg",920,FNUM,RED,f,sf+14,18)

        # Scene 5: CTA (9.5-12s)
        else:
            sf=s5+5
            shtext(d,"Jetzt sichern:",700,FHOOK,WHITE)
            if f>=sf+5:
                shtext(d,"alltagsengel.care",810,FBIG,GOLD_L,glow=True)
            if f>=sf+12:
                shtext(d,"Kostenlos. In 2 Minuten.",930,FB,CREAM)

        bg.save(os.path.join(fd,f"f_{f+1:05d}.png"))
    for t in [t1,t2,t3,t4,t5]:shutil.rmtree(t,ignore_errors=True)
    return encode(fd,"V30a_stopp_131_euro.mp4",total)


# ═══════════════════════════════════════════════════════════════
# V30b: "3 Mythen \u00fcber Pflegegrad" (13s) — MYTHOS VS FAKT
# TikTok trending debunk format
# ═══════════════════════════════════════════════════════════════
def make_v30b():
    total=13*FPS;fd=os.path.join(TMP,"v30b")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V30b clips...")
    c1,t1=ext("vnm_0s.mp4")
    c2,t2=ext("fkund_10s.mp4")
    c3,t3=ext("vreal_12s.mp4")
    c4,t4=ext("frec_10s.mp4")
    c5,t5=ext("engwalk_14s.mp4")

    s1=0;s2=int(2*FPS);s3=int(5*FPS);s4=int(8.5*FPS);s5=int(11*FPS)

    for f in range(total):
        zf=1.0+0.0018*f
        if f<s2:bg=zoom_crop(darken(vf(c1,f),0.35),zf);bg=prep(bg)
        elif f<s3:bg=zoom_crop(darken(vf(c2,f-s2),0.40),1.0+0.003*(f-s2));bg=prep(bg)
        elif f<s4:bg=zoom_crop(darken(vf(c3,f-s3),0.40),1.0+0.003*(f-s3));bg=prep(bg)
        elif f<s5:bg=zoom_crop(darken(vf(c4,f-s4),0.40),1.0+0.003*(f-s4));bg=prep(bg)
        else:bg=zoom_crop(darken(vf(c5,f-s5),0.38),1.0+0.003*(f-s5));bg=prep(bg)

        bg=flash(bg,f,s2);bg=flash(bg,f,s3);bg=flash(bg,f,s4);bg=flash(bg,f,s5)

        d=ImageDraw.Draw(bg)
        logo(d,f)

        # Scene 1: Hook (0-2s)
        if f<s2:
            impact_text(d,"3 MYTHEN",700,FIMPACT,FBIG,RED,f,2,10)
            if f>=12:
                shtext(d,"\u00fcber Pflegegrad",840,FHOOK,WHITE)

        # Scene 2: Mythos 1 (2-5s)
        elif f<s3:
            sf=s2+3
            pill(d,"MYTHOS",W//2,660,FTAG,WHITE,RED,f,s2)
            if f>=sf:
                shtext(d,"\"Pflegegrad = bettl\u00e4gerig\"",740,FMED,WHITE)
            if f>=sf+15:
                pill(d,"FAKT",W//2,860,FTAG,WHITE,GREEN,f,sf+15)
            if f>=sf+20:
                shtext(d,"Ab Pflegegrad 1 reicht",920,FB,CREAM)
                shtext(d,"schon leichte Einschr\u00e4nkung",980,FB,CREAM)

        # Scene 3: Mythos 2 (5-8.5s)
        elif f<s4:
            sf=s3+3
            pill(d,"MYTHOS",W//2,660,FTAG,WHITE,RED,f,s3)
            if f>=sf:
                shtext(d,"\"Kostet extra Geld\"",740,FMED,WHITE)
            if f>=sf+15:
                pill(d,"FAKT",W//2,860,FTAG,WHITE,GREEN,f,sf+15)
            if f>=sf+20:
                shtext(d,"131\u20ac/Monat von der Kasse",920,FB,CREAM)
                shtext(d,"Kein Cent aus eigener Tasche",980,FB,CREAM)

        # Scene 4: Mythos 3 (8.5-11s)
        elif f<s5:
            sf=s4+3
            pill(d,"MYTHOS",W//2,660,FTAG,WHITE,RED,f,s4)
            if f>=sf:
                shtext(d,"\"Nur f\u00fcr Senioren\"",740,FMED,WHITE)
            if f>=sf+15:
                pill(d,"FAKT",W//2,860,FTAG,WHITE,GREEN,f,sf+15)
            if f>=sf+20:
                shtext(d,"Jedes Alter, jeder",920,FB,CREAM)
                shtext(d,"mit Pflegegrad 1-5",980,FB,CREAM)

        # Scene 5: CTA (11-13s)
        else:
            sf=s5+3
            shtext(d,"Nicht verschenken!",720,FHOOK,GOLD_L)
            if f>=sf+5:
                shtext(d,"alltagsengel.care",850,FBIG,WHITE,glow=True)
            if f>=sf+10:
                shtext(d,"Dein Geld. Dein Recht.",960,FB,CREAM)

        bg.save(os.path.join(fd,f"f_{f+1:05d}.png"))
    for t in [t1,t2,t3,t4,t5]:shutil.rmtree(t,ignore_errors=True)
    return encode(fd,"V30b_3_mythen_pflegegrad.mp4",total)


# ═══════════════════════════════════════════════════════════════
# V30c: "POV: Dein Nachbar verdient 20\u20ac/h mit Spazieren" (12s)
# POV reveal format — Nebenjob recruiting
# ═══════════════════════════════════════════════════════════════
def make_v30c():
    total=12*FPS;fd=os.path.join(TMP,"v30c")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V30c clips...")
    c1,t1=ext("spazier.mp4")        # Spaziergang footage
    c2,t2=ext("frec_2s.mp4")        # Recruiting
    c3,t3=ext("vreal_20s.mp4")      # Real footage
    c4,t4=ext("rrec_0s.mp4")        # Reel recruiting
    c5,t5=ext("engwalk_8s.mp4")     # App walkthrough

    s1=0;s2=int(2.5*FPS);s3=int(5*FPS);s4=int(8*FPS);s5=int(10*FPS)

    for f in range(total):
        zf=1.0+0.002*f
        if f<s2:bg=zoom_crop(darken(vf(c1,f),0.38),zf);bg=prep(bg)
        elif f<s3:bg=zoom_crop(darken(vf(c2,f-s2),0.40),1.0+0.003*(f-s2));bg=prep(bg)
        elif f<s4:bg=zoom_crop(darken(vf(c3,f-s3),0.40),1.0+0.003*(f-s3));bg=prep(bg)
        elif f<s5:bg=zoom_crop(darken(vf(c4,f-s4),0.38),1.0+0.003*(f-s4));bg=prep(bg)
        else:bg=zoom_crop(darken(vf(c5,f-s5),0.38),1.0+0.003*(f-s5));bg=prep(bg)

        bg=flash(bg,f,s2);bg=flash(bg,f,s3);bg=flash(bg,f,s4);bg=flash(bg,f,s5)
        bg=gold_pulse(bg,f,int(5*FPS),int(3*FPS))

        d=ImageDraw.Draw(bg)
        logo(d,f)

        # Scene 1: POV Hook (0-2.5s)
        if f<s2:
            pill(d,"POV",W//2,640,FTAG,BLACK,GOLD_L,f,0)
            if f>=5:
                shtext(d,"Dein Nachbar verdient",730,FHOOK,WHITE)
                impact_text(d,"20\u20ac/Stunde",840,FIMPACT,FBIG,GOLD_L,f,8,10)
            if f>=22:
                shtext(d,"mit Spazierengehen",960,FHS,CREAM)

        # Scene 2: Wie das? (2.5-5s)
        elif f<s3:
            sf=s2+5
            shtext(d,"Alltagsbegleiter",700,FHOOK,GOLD_L)
            accent_line(d,f,sf-3,770)
            if f>=sf:
                shtext(d,"Senioren im Alltag",800,FHS,WHITE)
                shtext(d,"begleiten & Geld verdienen",870,FHS,WHITE)

        # Scene 3: Was machst du? (5-8s)
        elif f<s4:
            sf=s3+5
            shtext(d,"Deine Aufgaben:",680,FMED,GOLD_L)
            tasks=["\u2192 Spazieren gehen","\u2192 Einkaufen begleiten","\u2192 Arztbesuche fahren","\u2192 Gesellschaft leisten"]
            for i,task in enumerate(tasks):
                t_start=sf+i*7
                if f>=t_start:
                    a=fin(f,t_start,5)
                    text_centered(d,task,770+i*60,FB,col(WHITE,a))

        # Scene 4: Verdienst (8-10s)
        elif f<s5:
            sf=s4+3
            shtext(d,"Verdienst:",700,FHOOK,WHITE)
            counter_text(d,20,"","€/Stunde",810,FNUM,GOLD_L,f,sf,15)
            if f>=sf+12:
                shtext(d,"Flexible Zeiten",950,FB,CREAM)
                shtext(d,"Kein Abschluss n\u00f6tig",1010,FB,CREAM)

        # Scene 5: CTA (10-12s)
        else:
            sf=s5+3
            shtext(d,"Werde AlltagsEngel",720,FHOOK,GOLD_L)
            if f>=sf+5:
                shtext(d,"alltagsengel.care",850,FBIG,WHITE,glow=True)
            if f>=sf+10:
                shtext(d,"In 5 Min registriert.",960,FB,CREAM)

        bg.save(os.path.join(fd,f"f_{f+1:05d}.png"))
    for t in [t1,t2,t3,t4,t5]:shutil.rmtree(t,ignore_errors=True)
    return encode(fd,"V30c_pov_20euro_spazieren.mp4",total)


# ═══════════════════════════════════════════════════════════════
# V30d: "Wusstest du? Einkaufen wird bezahlt" (11s)
# "Wusstest du" trending format
# ═══════════════════════════════════════════════════════════════
def make_v30d():
    total=11*FPS;fd=os.path.join(TMP,"v30d")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V30d clips...")
    c1,t1=ext("einkauf.mp4")        # Einkauf footage
    c2,t2=ext("fkund_18s.mp4")      # Kunden
    c3,t3=ext("kwalk_0s.mp4")       # Walkthrough
    c4,t4=ext("vnm_16s.mp4")        # Nomusic footage
    c5,t5=ext("arzt.mp4")           # Arztbegleitung

    s1=0;s2=int(2*FPS);s3=int(4.5*FPS);s4=int(7.5*FPS);s5=int(9.5*FPS)

    for f in range(total):
        zf=1.0+0.002*f
        if f<s2:bg=zoom_crop(darken(vf(c1,f),0.36),zf);bg=prep(bg)
        elif f<s3:bg=zoom_crop(darken(vf(c2,f-s2),0.40),1.0+0.003*(f-s2));bg=prep(bg)
        elif f<s4:bg=zoom_crop(darken(vf(c3,f-s3),0.40),1.0+0.003*(f-s3));bg=prep(bg)
        elif f<s5:bg=zoom_crop(darken(vf(c4,f-s4),0.40),1.0+0.003*(f-s4));bg=prep(bg)
        else:bg=zoom_crop(darken(vf(c5,f-s5),0.38),1.0+0.003*(f-s5));bg=prep(bg)

        bg=flash(bg,f,s2);bg=flash(bg,f,s3);bg=flash(bg,f,s4);bg=flash(bg,f,s5)

        d=ImageDraw.Draw(bg)
        logo(d,f)

        # Scene 1: Hook (0-2s)
        if f<s2:
            pill(d,"WUSSTEST DU?",W//2,660,FTAG,BLACK,GOLD_L,f,0)
            if f>=6:
                shtext(d,"Einkaufen",760,FBIG,WHITE)
                impact_text(d,"wird bezahlt",860,FIMPACT,FHOOK,GOLD_L,f,10,10)

        # Scene 2: Wie? (2-4.5s)
        elif f<s3:
            sf=s2+5
            shtext(d,"Die Pflegekasse zahlt",700,FHOOK,WHITE)
            if f>=sf:
                shtext(d,"131\u20ac/Monat",810,FBIG,GOLD_L,glow=True)
            if f>=sf+10:
                shtext(d,"f\u00fcr Alltagshilfe",920,FHS,CREAM)
                shtext(d,"ab Pflegegrad 1",980,FHS,CREAM)

        # Scene 3: Was genau? (4.5-7.5s)
        elif f<s4:
            sf=s3+3
            shtext(d,"Was wird bezahlt?",680,FMED,GOLD_L)
            items=[("Einkaufen","\U0001F6D2"),("Kochen helfen","\U0001F373"),("Arzt begleiten","\U0001F3E5"),("Spazieren gehen","\U0001F6B6")]
            for i,(item,emoji) in enumerate(items):
                t_start=sf+i*8
                if f>=t_start:
                    a=fin(f,t_start,5)
                    text_centered(d,f"{emoji} {item}",780+i*65,FB,col(WHITE,a))

        # Scene 4: Kein Eigenanteil (7.5-9.5s)
        elif f<s5:
            sf=s4+3
            bg=gold_pulse(bg,f,s4,int(2*FPS))
            d=ImageDraw.Draw(bg)
            impact_text(d,"0\u20ac",700,FIMPACT,FBIG,GOLD_L,f,sf,10)
            if f>=sf+10:
                shtext(d,"Eigenanteil",840,FHOOK,WHITE)
            if f>=sf+16:
                shtext(d,"Kasse zahlt alles",950,FB,CREAM)

        # Scene 5: CTA (9.5-11s)
        else:
            sf=s5+3
            shtext(d,"Jetzt beantragen:",720,FHOOK,WHITE)
            if f>=sf+3:
                shtext(d,"alltagsengel.care",840,FBIG,GOLD_L,glow=True)

        bg.save(os.path.join(fd,f"f_{f+1:05d}.png"))
    for t in [t1,t2,t3,t4,t5]:shutil.rmtree(t,ignore_errors=True)
    return encode(fd,"V30d_wusstest_du_einkauf.mp4",total)


# ═══════════════════════════════════════════════════════════════
# V30e: "1 App. 4 Leistungen. 0\u20ac." (12s) — APP SHOWCASE
# Minimalist counter reveal
# ═══════════════════════════════════════════════════════════════
def make_v30e():
    total=12*FPS;fd=os.path.join(TMP,"v30e")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V30e clips...")
    c1,t1=ext("kwalk_14s.mp4")      # Kunden walkthrough
    c2,t2=ext("fkund_26s.mp4")      # FINAL kunden
    c3,t3=ext("frec_18s.mp4")       # Recruiting
    c4,t4=ext("rkund_6s.mp4")       # Reel kunden
    c5,t5=ext("vnm_32s.mp4")        # Nomusic footage

    s1=0;s2=int(2*FPS);s3=int(4.5*FPS);s4=int(7.5*FPS);s5=int(10*FPS)

    for f in range(total):
        zf=1.0+0.002*f
        if f<s2:bg=zoom_crop(darken(vf(c1,f),0.35),zf);bg=prep(bg)
        elif f<s3:bg=zoom_crop(darken(vf(c2,f-s2),0.40),1.0+0.003*(f-s2));bg=prep(bg)
        elif f<s4:bg=zoom_crop(darken(vf(c3,f-s3),0.40),1.0+0.003*(f-s3));bg=prep(bg)
        elif f<s5:bg=zoom_crop(darken(vf(c4,f-s4),0.40),1.0+0.003*(f-s4));bg=prep(bg)
        else:bg=zoom_crop(darken(vf(c5,f-s5),0.38),1.0+0.003*(f-s5));bg=prep(bg)

        bg=flash(bg,f,s2);bg=flash(bg,f,s3);bg=flash(bg,f,s4);bg=flash(bg,f,s5)

        d=ImageDraw.Draw(bg)
        logo(d,f)

        # Scene 1: Hook — numbers (0-2s)
        if f<s2:
            impact_text(d,"1 App.",680,FIMPACT,FBIG,WHITE,f,2,8)
            if f>=12:
                impact_text(d,"4 Leistungen.",810,FIMPACT,FHOOK,GOLD_L,f,14,10)
            if f>=26:
                impact_text(d,"0\u20ac.",940,FIMPACT,FBIG,GREEN,f,28,8)

        # Scene 2: Leistung 1+2 (2-4.5s)
        elif f<s3:
            sf=s2+3
            pill(d,"1",W//4,680,FMED,WHITE,GOLD,f,sf)
            if f>=sf+3:
                shtext(d,"Alltagsbegleitung",760,FHS,WHITE)
            pill(d,"2",W//4,870,FMED,WHITE,GOLD,f,sf+12)
            if f>=sf+15:
                shtext(d,"Krankenfahrten",950,FHS,WHITE)

        # Scene 3: Leistung 3+4 (4.5-7.5s)
        elif f<s4:
            sf=s3+3
            pill(d,"3",W//4,680,FMED,WHITE,GOLD,f,sf)
            if f>=sf+3:
                shtext(d,"Pflegebox gratis",760,FHS,WHITE)
            pill(d,"4",W//4,870,FMED,WHITE,GOLD,f,sf+12)
            if f>=sf+15:
                shtext(d,"Notfall-Pass",950,FHS,WHITE)

        # Scene 4: Zahlen (7.5-10s)
        elif f<s5:
            sf=s4+3
            bg=gold_pulse(bg,f,s4,int(2.5*FPS))
            d=ImageDraw.Draw(bg)
            counter_text(d,131,"","\u20ac/Monat",700,FNUM,GOLD_L,f,sf,18)
            if f>=sf+12:
                shtext(d,"von der Pflegekasse",830,FHS,WHITE)
            if f>=sf+18:
                shtext(d,"Ab Pflegegrad 1",920,FB,CREAM)

        # Scene 5: CTA (10-12s)
        else:
            sf=s5+3
            shtext(d,"Alles in einer App:",720,FHOOK,WHITE)
            if f>=sf+5:
                shtext(d,"alltagsengel.care",850,FBIG,GOLD_L,glow=True)
            if f>=sf+10:
                shtext(d,"Jetzt kostenlos starten",970,FB,CREAM)

        bg.save(os.path.join(fd,f"f_{f+1:05d}.png"))
    for t in [t1,t2,t3,t4,t5]:shutil.rmtree(t,ignore_errors=True)
    return encode(fd,"V30e_1app_4leistungen.mp4",total)


def main():
    os.makedirs(OUT,exist_ok=True)
    os.makedirs(TMP,exist_ok=True)
    print("Extracting clips...")
    extract_clips()
    print()
    for fn,name in [(make_v30a,"V30a"),(make_v30b,"V30b"),(make_v30c,"V30c"),(make_v30d,"V30d"),(make_v30e,"V30e")]:
        print(f"\U0001F3AC {name}")
        fn()
        print()
    # cleanup temp
    if os.path.exists(TMP):shutil.rmtree(TMP,ignore_errors=True)
    print("\u2705 V30 complete — 5 viral TikTok videos!")

if __name__=="__main__":
    main()
