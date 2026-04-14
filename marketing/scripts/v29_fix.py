#!/usr/bin/env python3
"""V29 FIX: Replace V29b + V29e — no Oma, pure Aufklärung."""
import os,shutil,subprocess,sys,math
from PIL import Image,ImageDraw,ImageFont,ImageFilter

W,H=1080,1920; FPS=30
BASE="/Users/work/alltagsengel"
CLIPS=os.path.join(BASE,"_clips_v29")
SRC=os.path.join(BASE,"social-media-grafiken")
SCREENS=os.path.join(BASE,"app-store-screenshots")
OUT=os.path.join(BASE,"social-media-grafiken/tiktok-v29")
TMP=os.path.join(BASE,"_tmp_v29fix")

GOLD=(201,150,60);GOLD_L=(219,168,74);CREAM=(245,240,230)
WHITE=(255,255,255);RED=(220,50,40);DARK=(13,10,8)

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
    a=(1-(f-start)/dur)**2;return Image.blend(bg,Image.new("RGB",(W,H),(255,255,255)),a*0.85)
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
    t=min((f-start)/settle,1.0);font=font_big if t<0.3 else font_final
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

# ═══════════════════════════════════════════════════════════════
# V29b NEU: "Krankenfahrt vs. Krankentransport" (15s)
# Reine Aufklärung: Was ist der Unterschied? Wer zahlt was?
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
        elif f<int(5.5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.40),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(9*FPS):
            sub=f-int(5.5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5.5*FPS),4)
        elif f<int(12*FPS):
            sub=f-int(9*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(9*FPS),4)
        else:
            sub=f-int(12*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()
        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s): Direkte Frage
        if f<int(2*FPS):
            a=fin(f,0,6);o=sup(f,0,8,50)
            shtext(d,"Krankenfahrt",390+o,FH,col(GOLD,a),4)
            a2=fin(f,6,8);o2=sup(f,6,10,45)
            shtext(d,"vs.",500+o2,FHS,col(WHITE,a2),4)
            a3=fin(f,12,8);o3=sup(f,12,10,45)
            shtext(d,"Krankentransport",570+o3,FH,col(GOLD,a3),4)

        # KRANKENFAHRT erklärt (2-5.5s)
        elif f<int(5.5*FPS):
            sf=int(2*FPS)
            impact_text(d,"Krankenfahrt:",380,FIMPACT,FH,GOLD,f,sf,12)
            accent_line(d,f,sf+10,480)
            items=[("Patient sitzt selbst im Auto.",WHITE,FB),
                   ("Keine medizinische Betreuung.",WHITE,FB),None,
                   ("Normaler PKW reicht.",CREAM,FB),
                   ("Fahrer mit P-Schein.",CREAM,FB),None,
                   ("Für: Dialyse, Chemo,",GOLD_L,FHS),
                   ("Bestrahlung, Arztbesuch.",GOLD_L,FHS)]
            y=510
            for i,item in enumerate(items):
                if item is None:y+=14;continue
                t,c,fn=item;a=fin(f,sf+12+i*5,6);o=sup(f,sf+12+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # KRANKENTRANSPORT erklärt (5.5-9s)
        elif f<int(9*FPS):
            sf=int(5.5*FPS)
            impact_text(d,"Krankentransport:",380,FIMPACT,FH,RED,f,sf,12)
            accent_line(d,f,sf+10,480)
            items=[("Patient braucht med. Betreuung.",WHITE,FB),
                   ("Liegend oder mit Trage.",WHITE,FB),None,
                   ("Rettungswagen / KTW nötig.",CREAM,FB),
                   ("Sanitäter an Bord.",CREAM,FB),None,
                   ("Teurer. Andere Abrechnung.",RED,FBB)]
            y=510
            for i,item in enumerate(items):
                if item is None:y+=14;continue
                t,c,fn=item;a=fin(f,sf+12+i*5,6);o=sup(f,sf+12+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # WER ZAHLT (9-12s)
        elif f<int(12*FPS):
            sf=int(9*FPS)
            impact_text(d,"Wer zahlt?",380,FIMPACT,FH,GOLD,f,sf,12)
            accent_line(d,f,sf+10,490)
            items=[("Krankenfahrt:",GOLD_L,FHS),
                   ("Verordnung vom Arzt",CREAM,FB),
                   ("+ Genehmigung Krankenkasse.",CREAM,FB),None,
                   ("Ab Pflegegrad 3 oder",WHITE,FHS),
                   ("Schwerbehinderung:",WHITE,FHS),
                   ("IMMER genehmigungsfrei.",GOLD,FBB)]
            y=520
            for i,item in enumerate(items):
                if item is None:y+=14;continue
                t,c,fn=item;a=fin(f,sf+12+i*5,6);o=sup(f,sf+12+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # CTA (12-15s)
        else:
            sf=int(12*FPS)
            impact_text(d,"AlltagsEngel",400,FIMPACT,FH,GOLD,f,sf,14)
            a2=fin(f,sf+10,8)
            shtext(d,"vermittelt Krankenfahrten.",530,FB,col(CREAM,a2),3)
            accent_line(d,f,sf+16,610)
            a3=fin(f,sf+20,8)
            shtext(d,"Einfach. Schnell. Sicher.",640,FHS,col(WHITE,a3),4)
            cta(d,f,sf+24,"Jetzt Fahrt buchen.")

        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    b:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

# ═══════════════════════════════════════════════════════════════
# V29e NEU: "P-Schein: So wirst du Krankenfahrer" (15s)
# Fahrer-Aufklärung: Was brauchst du, wie geht's, was verdienst du
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
    c5,t5=ext("fahr_24s.mp4")
    app=prep(darken(load_screen("screenshot-2-profil.png").filter(ImageFilter.GaussianBlur(18)),0.25))

    for f in range(total):
        zf=1.0+0.001*f
        if f<int(2*FPS):bg=zoom_crop(darken(vf(c1,f),0.45),zf);bg=prep(bg)
        elif f<int(5.5*FPS):
            sub=f-int(2*FPS);bg=zoom_crop(darken(vf(c2,sub),0.40),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(2*FPS),4)
        elif f<int(9*FPS):
            sub=f-int(5.5*FPS);bg=zoom_crop(darken(vf(c3,sub),0.38),1.0+0.003*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(5.5*FPS),4)
        elif f<int(12.5*FPS):
            sub=f-int(9*FPS);bg=zoom_crop(darken(vf(c4,sub),0.36),1.0+0.002*sub);bg=prep(bg)
            if sub<4:bg=flash(bg,f,int(9*FPS),4)
        else:
            sub=f-int(12.5*FPS)
            if sub<10:v=prep(darken(vf(c5,len(c5)-1),0.30));p=sub/10;p=p*p*(3-2*p);bg=Image.blend(v,app,p)
            else:bg=app.copy()
        d=ImageDraw.Draw(bg);logo(d,f)

        # HOOK (0-2s): P-Schein direkt
        if f<int(2*FPS):
            impact_text(d,"P-Schein",350,FIMPACT,FBG,GOLD,f,0,12)
            a2=fin(f,8,8);o2=sup(f,8,10,50)
            shtext(d,"So wirst du",530+o2,FHS,col(WHITE,a2),4)
            shtext(d,"Krankenfahrer.",610+o2,FHS,col(WHITE,a2),4)

        # WAS IST EIN P-SCHEIN (2-5.5s)
        elif f<int(5.5*FPS):
            sf=int(2*FPS)
            impact_text(d,"Was ist das?",380,FIMPACT,FH,GOLD,f,sf,12)
            accent_line(d,f,sf+10,480)
            items=[("P-Schein = Personenbeförderungs-",CREAM,FB),
                   ("schein nach §48 FeV.",CREAM,FB),None,
                   ("Berechtigt dich,",WHITE,FHS),
                   ("Fahrgäste gewerblich",WHITE,FHS),
                   ("zu befördern.",WHITE,FHS),None,
                   ("Pflicht für Krankenfahrten.",GOLD_L,FBB)]
            y=510
            for i,item in enumerate(items):
                if item is None:y+=14;continue
                t,c,fn=item;a=fin(f,sf+12+i*5,6);o=sup(f,sf+12+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # WIE BEKOMMST DU IHN (5.5-9s)
        elif f<int(9*FPS):
            sf=int(5.5*FPS)
            impact_text(d,"3 Schritte:",380,FIMPACT,FH,GOLD,f,sf,12)
            accent_line(d,f,sf+10,480)
            items=[("1. Gesundheitscheck",WHITE,FHS),
                   ("   (Arzt, Sehtest, Erste Hilfe)",CREAM,FSM),None,
                   ("2. Antrag bei Straßenverkehrsamt",WHITE,FHS),
                   ("   (Führungszeugnis + Gebühr ~50€)",CREAM,FSM),None,
                   ("3. Genehmigung nach §49 PBefG",WHITE,FHS),
                   ("   (Mietwagen-Konzession)",CREAM,FSM)]
            y=510
            for i,item in enumerate(items):
                if item is None:y+=12;continue
                t,c,fn=item;a=fin(f,sf+12+i*5,6);o=sup(f,sf+12+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+6

        # VERDIENST + VORTEILE (9-12.5s)
        elif f<int(12.5*FPS):
            sf=int(9*FPS)
            impact_text(d,"Was du verdienst:",380,FIMPACT,FH,GOLD,f,sf,12)
            accent_line(d,f,sf+10,490)
            items=[("Abrechnung pro Kilometer.",CREAM,FB),
                   ("Krankenkasse zahlt direkt.",CREAM,FB),None,
                   ("Stammtouren möglich:",GOLD_L,FHS),
                   ("Dialyse 3x/Woche = festes",GOLD_L,FB),
                   ("Einkommen jeden Monat.",GOLD_L,FB),None,
                   ("Flexible Zeiten.",WHITE,FBB),
                   ("Dein Auto. Dein Tempo.",WHITE,FBB)]
            y=520
            for i,item in enumerate(items):
                if item is None:y+=12;continue
                t,c,fn=item;a=fin(f,sf+12+i*5,6);o=sup(f,sf+12+i*5,8,28)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+8

        # CTA (12.5-15s)
        else:
            sf=int(12.5*FPS)
            impact_text(d,"Werde Fahrer.",400,FIMPACT,FH,GOLD,f,sf,14)
            accent_line(d,f,sf+10,510)
            a2=fin(f,sf+14,8)
            shtext(d,"AlltagsEngel hilft dir",540,FB,col(CREAM,a2),3)
            shtext(d,"beim Einstieg.",600,FBB,col(WHITE,a2),3)
            cta(d,f,sf+20,"alltagsengel.care — Jetzt bewerben")

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
        ("V29b_krankenfahrt_vs_transport.mp4", make_v29b),
        ("V29e_pschein_krankenfahrer.mp4", make_v29e),
    ]
    for name,fn in videos:
        print(f"\n🎬 {name}")
        fd,total=fn();encode(fd,name,total);shutil.rmtree(fd)
    shutil.rmtree(TMP,ignore_errors=True)
    # Remove old files
    for old in ["V29b_oma_dialyse.mp4","V29e_pov_erster_tag_fahrer.mp4"]:
        p=os.path.join(OUT,old)
        if os.path.exists(p):os.remove(p);print(f"  🗑 removed {old}")
    print("\n✅ V29b + V29e replaced — pure Aufklärung!")

if __name__=="__main__":main()
