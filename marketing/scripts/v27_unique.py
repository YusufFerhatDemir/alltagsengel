#!/usr/bin/env python3
"""V27 UNIQUE: Each video gets its own distinct clip set, text-matched."""
import os,shutil,subprocess,sys
from PIL import Image,ImageDraw,ImageFont,ImageFilter

W,H=1080,1920; FPS=30
BASE="/Users/work/alltagsengel"
CLIPS=os.path.join(BASE,"_clips")
SCREENS=os.path.join(BASE,"app-store-screenshots")
OUT=os.path.join(BASE,"social-media-grafiken/tiktok-v27")
TMP=os.path.join(BASE,"_tmp_v27u")

GOLD=(201,150,60);GOLD_L=(219,168,74);CREAM=(245,240,230)
WHITE=(255,255,255);RED=(200,60,50)

def _f(sz):
    for p in ["/System/Library/Fonts/Supplemental/Georgia.ttf","/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()
def _s(sz):
    for p in ["/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default()

FH=_f(68);FHS=_f(52);FB=_s(44);FBB=_s(44);FSM=_s(34);FC=_s(52);FU=_f(48);FBG=_f(110);FBR=_s(26)

def ease(t):return 1-(1-min(max(t,0),1))**3
def fin(f,s,d=8):
    if f<s:return 0.0
    if f>=s+d:return 1.0
    return ease((f-s)/d)
def sup(f,s,d=10,dist=50):
    if f<s:return dist
    if f>=s+d:return 0
    return int(dist*(1-ease((f-s)/d)))
def col(c,a):return tuple(int(v*a) for v in c)

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

def xfade(bg1,bg2,f,start,dur=12):
    if f<start:return bg1
    if f>=start+dur:return bg2
    p=(f-start)/dur;p=p*p*(3-2*p)
    return Image.blend(bg1,bg2,p)

def get_bg(clips_map, f, total):
    """Get background based on frame, with crossfades between scenes.
    clips_map: list of (start_frame, clip_frames, darkness)"""
    for i,(start,frames,dark) in enumerate(clips_map):
        end = clips_map[i+1][0] if i+1<len(clips_map) else total
        if start<=f<end:
            bg=prep(darken(vf(frames,f-start),dark))
            # Crossfade at scene boundaries
            if i>0 and f<start+12:
                prev_s,prev_f,prev_d=clips_map[i-1]
                prev_bg=prep(darken(vf(prev_f,len(prev_f)-1),prev_d))
                p=(f-start)/12;p=p*p*(3-2*p)
                bg=Image.blend(prev_bg,bg,p)
            return bg
    return prep(darken(vf(clips_map[-1][1],0),0.4))

# ═══ V27a: "Rufst du bei Mama an?" ═══
# sofa_gespraech → oma_frankfurt → spaziergang+oma_einkauf → app
def make_v27a():
    total=15*FPS;fd=os.path.join(TMP,"fa")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V27a clips...")
    c1,t1=ext("sofa_gespraech.mp4")   # Hook: Oma+Frau auf Sofa
    c2,t2=ext("oma_frankfurt.mp4")     # Problem: Oma+Frau Frankfurt skyline
    c3,t3=ext("spaziergang.mp4")       # Wendung: spazieren
    c4,t4=ext("oma_einkauf.mp4")       # Wendung: einkaufen
    app=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(20)),0.30))

    scenes=[(0,c1,0.40),(2*FPS,c2,0.38),(6*FPS,c3,0.36)]

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.40))
        elif f<6*FPS:
            if f<2*FPS+12:
                old=prep(darken(vf(c1,len(c1)-1),0.40));new=prep(darken(vf(c2,0),0.38))
                p=(f-2*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,f-2*FPS),0.38))
        elif f<10*FPS:
            sub=f-6*FPS
            if sub<30:  # "spazieren" text -> spaziergang clip
                if sub<12:
                    old=prep(darken(vf(c2,len(c2)-1),0.38));new=prep(darken(vf(c3,0),0.36))
                    p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c3,sub),0.36))
            else:  # "einkaufen" text -> einkauf clip
                if sub<42:
                    old=prep(darken(vf(c3,sub),0.36));new=prep(darken(vf(c4,0),0.36))
                    p=(sub-30)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c4,sub-30),0.36))
        else:
            if f<10*FPS+15:
                v=prep(darken(vf(c4,len(c4)-1),0.35));p=(f-10*FPS)/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        if f<2*FPS:
            a=fin(f,0,12);o=sup(f,0,15,50)
            shtext(d,"Wann hast du zuletzt",450+o,FH,col(GOLD_L,a),4)
            a2=fin(f,8,12);o2=sup(f,8,15,50)
            shtext(d,"bei Mama angerufen?",540+o2,FH,col(WHITE,a2),4)
        elif f<6*FPS:
            items=[("Du arbeitest. Du hast Kinder.",CREAM,FB),("Du hast Stress.",CREAM,FB),
                   None,("Und im Hinterkopf",CREAM,FB),("immer dieser Gedanke:",CREAM,FB),
                   None,("\"Ist sie allein?\"",GOLD_L,FHS),("\"Geht es ihr gut?\"",GOLD_L,FHS)]
            y=420
            for i,item in enumerate(items):
                if item is None:y+=25;continue
                t,c,fn=item;a=fin(f,2*FPS+i*8,10);o=sup(f,2*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
        elif f<10*FPS:
            items=[("Stell dir vor,",GOLD_L,FHS),("jemand ist bei ihr.",WHITE,FHS),
                   None,("Geht mit ihr spazieren.",CREAM,FB),("Hört ihr zu.",CREAM,FB),
                   ("Spielt Karten.",CREAM,FB),("Begleitet sie zum Einkaufen.",CREAM,FB)]
            y=430
            for i,item in enumerate(items):
                if item is None:y+=25;continue
                t,c,fn=item;a=fin(f,6*FPS+i*8,10);o=sup(f,6*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        else:
            items=[("Alltagsbegleitung.",GOLD_L,FHS),("Keine Pflege.",CREAM,FB),
                   ("Einfach ein Mensch,",CREAM,FB),("der da ist.",CREAM,FB)]
            y=450
            for i,(t,c,fn) in enumerate(items):
                a=fin(f,10*FPS+i*8,10);o=sup(f,10*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
            ps=10*FPS+35;a=fin(f,ps,10)
            if a>0:
                o=sup(f,ps,12,30)
                shtext(d,"131€/Monat",y+35+o,FC,col(GOLD,a),4)
                shtext(d,"zahlt die Pflegekasse",y+100+o,FSM,col(CREAM,a),2)
            cta(d,f,12*FPS)
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    a:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══ V27b: "Ich schaff das schon" ═══
# haushalt → kueche_essen → oma_frankfurt → sofa_gespraech → app
def make_v27b():
    total=13*FPS;fd=os.path.join(TMP,"fb")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V27b clips...")
    c1,t1=ext("haushalt.mp4")         # Hook: Wäsche falten (Alltag!)
    c2,t2=ext("kueche_essen.mp4")     # Problem: morgens Mama versorgen
    c3,t3=ext("oma_frankfurt.mp4")     # Emotional: draußen, Luft
    c4,t4=ext("sofa_gespraech.mp4")   # Lösung: Gespräch, Ruhe
    app=prep(darken(load_screen("screenshot-1-home.png").filter(ImageFilter.GaussianBlur(20)),0.30))

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.42))
        elif f<6*FPS:
            if f<2*FPS+12:
                old=prep(darken(vf(c1,len(c1)-1),0.42));new=prep(darken(vf(c2,0),0.38))
                p=(f-2*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,f-2*FPS),0.38))
        elif f<9*FPS:
            if f<6*FPS+12:
                old=prep(darken(vf(c2,len(c2)-1),0.38));new=prep(darken(vf(c3,0),0.38))
                p=(f-6*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c3,f-6*FPS),0.38))
        else:
            if f<9*FPS+12:
                old=prep(darken(vf(c3,len(c3)-1),0.38));new=prep(darken(vf(c4,0),0.36))
                p=(f-9*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            elif f<12*FPS:bg=prep(darken(vf(c4,f-9*FPS),0.36))
            else:
                if f<12*FPS+12:
                    old=prep(darken(vf(c4,f-9*FPS),0.36));p=(f-12*FPS)/12;p=p*p*(3-2*p)
                    bg=Image.blend(old,app,p)
                else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        if f<2*FPS:
            a=fin(f,0,12);o=sup(f,0,15,50)
            shtext(d,"\"Ich schaff das schon.\"",480+o,FH,col(GOLD_L,a),4)
            a2=fin(f,10,10);o2=sup(f,10,12,40)
            shtext(d,"Der Satz, den jede",590+o2,FB,col(CREAM,a2),3)
            shtext(d,"pflegende Tochter sagt.",645+o2,FB,col(CREAM,a2),3)
        elif f<6*FPS:
            items=["Morgens Mama versorgen.","Tagsüber arbeiten.","Abends Haushalt.","Nachts Sorgen."]
            y=500
            for i,t in enumerate(items):
                a=fin(f,2*FPS+i*12,10);o=sup(f,2*FPS+i*12,12,35)
                if a<=0:continue
                shtext(d,t,y+o,FB,col(CREAM,a),3);y+=68
        elif f<9*FPS:
            items=[("Du schaffst alles —",CREAM,FB),("außer an dich zu denken.",GOLD_L,FHS),
                   None,("Aber wer bist du,",CREAM,FB),("wenn du leer bist?",GOLD_L,FHS)]
            y=480
            for i,item in enumerate(items):
                if item is None:y+=30;continue
                t,c,fn=item;a=fin(f,6*FPS+i*10,10);o=sup(f,6*FPS+i*10,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+16
        else:
            items=[("Alltagsbegleitung",GOLD_L,FHS),("gibt dir Luft.",GOLD_L,FHS),
                   None,("Kein Pflegedienst.",CREAM,FB),("Ein Mensch, der Zeit mitbringt.",CREAM,FB),
                   ("Für Mama. Und für dich.",WHITE,FBB)]
            y=440
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,9*FPS+i*8,10);o=sup(f,9*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
            cta(d,f,11*FPS,"131€/Monat · Pflegekasse zahlt")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    b:{f}/{total}")
    for t in[t1,t2,t3,t4]:shutil.rmtree(t)
    return fd,total

# ═══ V27c: "Papa sitzt allein" ═══
# opa_cafe → opa_frankfurt → opa_cafe → spaziergang → app
def make_v27c():
    total=15*FPS;fd=os.path.join(TMP,"fc")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V27c clips...")
    c1,t1=ext("opa_cafe.mp4")         # Hook+Wendung: Opa am Tisch/Kaffee
    c2,t2=ext("opa_frankfurt.mp4")     # Problem: Opa allein in Stadt
    c3,t3=ext("spaziergang.mp4")      # Wendung: spazieren gehen
    app=prep(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.45))
        elif f<6*FPS:
            if f<2*FPS+12:
                old=prep(darken(vf(c1,len(c1)-1),0.45));new=prep(darken(vf(c2,0),0.40))
                p=(f-2*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c2,f-2*FPS),0.40))
        elif f<10*FPS:
            sub=f-6*FPS
            if sub<24:  # Kaffee trinken -> opa_cafe
                if sub<12:
                    old=prep(darken(vf(c2,len(c2)-1),0.40));new=prep(darken(vf(c1,40),0.38))
                    p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c1,sub+40),0.38))
            else:  # spazieren -> spaziergang
                if sub<36:
                    old=prep(darken(vf(c1,sub+40),0.38));new=prep(darken(vf(c3,0),0.36))
                    p=(sub-24)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c3,sub-24),0.36))
        else:
            if f<10*FPS+15:
                v=prep(darken(vf(c3,len(c3)-1),0.35));p=(f-10*FPS)/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        if f<2*FPS:
            a0=fin(f,0,10);o0=sup(f,0,12,40)
            if a0>0:shtext(d,"Papa sitzt allein",490+o0,FH,col(GOLD_L,a0),4)
            a1=fin(f,8,10);o1=sup(f,8,12,40)
            if a1>0:shtext(d,"am Küchentisch.",580+o1,FHS,col(WHITE,a1),4)
            a2=fin(f,18,10);o2=sup(f,18,12,40)
            if a2>0:shtext(d,"Seit 3 Stunden.",660+o2,FBB,col(RED,a2),3)
        elif f<6*FPS:
            items=["Seit Mama weg ist,","redet er kaum noch.",None,"Das Essen bleibt stehen.",
                   "Die Wohnung wird leiser.",None,"Und du?","Du kannst nicht","jeden Tag da sein."]
            y=400
            for i,t in enumerate(items):
                if t is None:y+=22;continue
                a=fin(f,2*FPS+i*7,10);o=sup(f,2*FPS+i*7,12,35)
                if a<=0:continue
                hl=t=="Und du?";cc=GOLD_L if hl else CREAM;fn=FHS if hl else FB
                y+=shtext(d,t,y+o,fn,col(cc,a),3)+10
        elif f<10*FPS:
            items=[("Aber jemand kann.",GOLD_L,FHS),None,
                   ("Trinkt Kaffee mit ihm.",CREAM,FB),("Geht spazieren.",CREAM,FB),
                   ("Redet über früher.",CREAM,FB),("Hört einfach zu.",WHITE,FBB)]
            y=440
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,6*FPS+i*8,10);o=sup(f,6*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        else:
            items=[("Keine Pflege. Keine Medizin.",CREAM,FB),None,
                   ("Einfach",GOLD_L,FHS),("menschliche Nähe.",GOLD,FH)]
            y=440
            for i,item in enumerate(items):
                if item is None:y+=20;continue
                t,c,fn=item;a=fin(f,10*FPS+i*10,10);o=sup(f,10*FPS+i*10,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
            cta(d,f,12*FPS,"131€/Monat von der Pflegekasse")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    c:{f}/{total}")
    for t in[t1,t2,t3]:shutil.rmtree(t)
    return fd,total

# ═══ V27d: "131€ die du verschenkst" ═══
# app_pflegekasse → supermarkt → auto_arzt → rollstuhl → app_home
def make_v27d():
    total=12*FPS;fd=os.path.join(TMP,"fd")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V27d clips...")
    c1,t1=ext("supermarkt.mp4")       # Fakt: Oma im Supermarkt
    c2,t2=ext("auto_arzt.mp4")        # Activities: Arzt begleiten
    c3,t3=ext("rollstuhl.mp4")        # Activities: Rollstuhl/Hospital
    appK=prep(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(18)),0.32))
    appH=prep(darken(load_screen("screenshot-1-home.png").filter(ImageFilter.GaussianBlur(20)),0.30))

    for f in range(total):
        if f<2*FPS:bg=appK.copy()
        elif f<5*FPS:
            if f<2*FPS+12:p=(f-2*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(appK,prep(darken(vf(c1,0),0.38)),p)
            else:bg=prep(darken(vf(c1,f-2*FPS),0.38))
        elif f<8*FPS:
            sub=f-5*FPS
            if sub<15:  # einkaufen -> auto/arzt
                if sub<12:
                    old=prep(darken(vf(c1,len(c1)-1),0.38));new=prep(darken(vf(c2,0),0.36))
                    p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c2,sub),0.36))
            else:  # Arzt -> Rollstuhl/spielen
                if sub<27:
                    old=prep(darken(vf(c2,sub),0.36));new=prep(darken(vf(c3,0),0.36))
                    p=(sub-15)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c3,sub-15),0.36))
        else:
            if f<8*FPS+15:
                v=prep(darken(vf(c3,len(c3)-1),0.35));p=(f-8*FPS)/15;p=p*p*(3-2*p)
                bg=Image.blend(v,appH,p)
            else:bg=appH.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        if f<2*FPS:
            a=fin(f,0,10);o=sup(f,0,15,60)
            shtext(d,"131€",400+o,FBG,col(GOLD,a),5)
            a2=fin(f,8,10);o2=sup(f,8,12,40)
            shtext(d,"im Monat stehen dir zu.",560+o2,FB,col(CREAM,a2),3)
            a3=fin(f,16,10)
            shtext(d,"Und du nutzt sie nicht.",625+o2,FBB,col(RED,a3),3)
        elif f<5*FPS:
            items=[("Ab Pflegegrad 1",CREAM,FB),("zahlt die Pflegekasse",CREAM,FB),
                   ("den Entlastungsbetrag:",CREAM,FB),None,("131€/Monat.",GOLD_L,FC),
                   None,("Für Alltagsbegleitung.",CREAM,FB),("Nicht für Pflege.",CREAM,FB)]
            y=400
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,2*FPS+i*7,10);o=sup(f,2*FPS+i*7,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        elif f<8*FPS:
            items=[("Jemand geht für",CREAM,FB),("Oma einkaufen.",CREAM,FB),
                   ("Begleitet sie zum Arzt.",CREAM,FB),("Spielt mit ihr.",CREAM,FB),
                   None,("Und du hast 3 Stunden",GOLD_L,FHS),("für DICH.",GOLD,FH)]
            y=410
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,5*FPS+i*7,10);o=sup(f,5*FPS+i*7,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        else:
            a=fin(f,8*FPS,10);o=sup(f,8*FPS,12,40)
            if a>0:
                shtext(d,"Nicht genutztes Geld",440+o,FBB,col(RED,a),3)
                shtext(d,"verfällt.",500+o,FBB,col(RED,a),3)
            a2=fin(f,8*FPS+15,10);o2=sup(f,8*FPS+15,12,35)
            if a2>0:
                shtext(d,"1.572€ im Jahr",580+o2,FC,col(GOLD,a2),4)
                shtext(d,"— einfach weg.",650+o2,FB,col(CREAM,a2),3)
            cta(d,f,10*FPS,"Nicht warten. Jetzt Engel finden.")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    d:{f}/{total}")
    for t in[t1,t2,t3]:shutil.rmtree(t)
    return fd,total

# ═══ V27e: "Was Oma wirklich braucht" ═══
# kueche_essen → supermarkt+sofa → hospital → spaziergang → app
def make_v27e():
    total=14*FPS;fd=os.path.join(TMP,"fe")
    if os.path.exists(fd):shutil.rmtree(fd)
    os.makedirs(fd)
    print("  V27e clips...")
    c1,t1=ext("kueche_essen.mp4")     # Hook: Oma in Küche (einfach da sein)
    c2,t2=ext("supermarkt.mp4")       # Realität: Markt/Einkaufen
    c3,t3=ext("sofa_gespraech.mp4")   # Realität: zuhören
    c4,t4=ext("spaziergang.mp4")      # Realität: Park
    c5,t5=ext("hospital.mp4")         # Emotional: Einsamkeit/Verletzlichkeit
    app=prep(darken(load_screen("screenshot-2-profil.png").filter(ImageFilter.GaussianBlur(20)),0.28))

    for f in range(total):
        if f<2*FPS:bg=prep(darken(vf(c1,f),0.42))
        elif f<6*FPS:
            sub=f-2*FPS
            if sub<20:  # Markt -> supermarkt
                if sub<12:
                    old=prep(darken(vf(c1,len(c1)-1),0.42));new=prep(darken(vf(c2,0),0.38))
                    p=sub/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c2,sub),0.38))
            elif sub<40:  # zuhören -> sofa
                if sub<32:
                    old=prep(darken(vf(c2,sub),0.38));new=prep(darken(vf(c3,0),0.38))
                    p=(sub-20)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c3,sub-20),0.38))
            else:  # Park -> spaziergang
                if sub<52:
                    old=prep(darken(vf(c3,sub-20),0.38));new=prep(darken(vf(c4,0),0.36))
                    p=(sub-40)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
                else:bg=prep(darken(vf(c4,sub-40),0.36))
        elif f<9*FPS:  # Einsamkeit -> hospital (verletzlich)
            if f<6*FPS+12:
                old=prep(darken(vf(c4,len(c4)-1),0.36));new=prep(darken(vf(c5,0),0.42))
                p=(f-6*FPS)/12;p=p*p*(3-2*p);bg=Image.blend(old,new,p)
            else:bg=prep(darken(vf(c5,f-6*FPS),0.42))
        else:
            if f<9*FPS+15:
                v=prep(darken(vf(c5,len(c5)-1),0.40));p=(f-9*FPS)/15;p=p*p*(3-2*p)
                bg=Image.blend(v,app,p)
            else:bg=app.copy()

        d=ImageDraw.Draw(bg);logo(d,f)
        if f<2*FPS:
            a=fin(f,0,12);o=sup(f,0,15,50)
            shtext(d,"Oma braucht keine",470+o,FHS,col(CREAM,a),4)
            a2=fin(f,8,10);o2=sup(f,8,12,40)
            shtext(d,"teure Therapie.",540+o2,FHS,col(GOLD_L,a2),4)
            a3=fin(f,15,10);o3=sup(f,15,12,35)
            shtext(d,"Sie braucht jemanden,",630+o3,FB,col(GOLD,a3),3)
            shtext(d,"der da ist.",690+o3,FBB,col(GOLD,a3),3)
        elif f<6*FPS:
            items=["Jemanden, der mit ihr","zum Markt geht.","Der beim Einkaufen hilft.",
                   "Der einfach mal zuhört.","Der mit ihr durch","den Park läuft."]
            y=440
            for i,t in enumerate(items):
                a=fin(f,2*FPS+i*8,10);o=sup(f,2*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,FB,col(CREAM,a),3)+16
        elif f<9*FPS:
            items=[("Einsamkeit ist das",CREAM,FB),("größte Problem im Alter.",WHITE,FBB),
                   None,("Kein Medikament",CREAM,FB),("hilft dagegen.",CREAM,FB),
                   None,("Aber ein Mensch schon.",GOLD_L,FHS)]
            y=440
            for i,item in enumerate(items):
                if item is None:y+=22;continue
                t,c,fn=item;a=fin(f,6*FPS+i*7,10);o=sup(f,6*FPS+i*7,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+12
        else:
            items=[("AlltagsEngel",GOLD,FH),("vermittelt Alltagsbegleiter.",CREAM,FB),
                   None,("Zertifiziert nach §45a.",CREAM,FSM),("Versichert. Geprüft.",CREAM,FSM)]
            y=410
            for i,item in enumerate(items):
                if item is None:y+=18;continue
                t,c,fn=item;a=fin(f,9*FPS+i*8,10);o=sup(f,9*FPS+i*8,12,35)
                if a<=0:continue
                y+=shtext(d,t,y+o,fn,col(c,a),3)+14
            ps=9*FPS+40;a=fin(f,ps,10)
            if a>0:
                o=sup(f,ps,12,30)
                shtext(d,"131€/Monat",y+25+o,FC,col(GOLD,a),4)
                shtext(d,"Pflegekasse übernimmt das.",y+90+o,FSM,col(CREAM,a),2)
            cta(d,f,12*FPS,"Gib Oma das, was sie wirklich braucht.")
        bg.save(os.path.join(fd,f"frame_{f:05d}.png"));del bg,d
        if f%90==0:print(f"    e:{f}/{total}")
    for t in[t1,t2,t3,t4,t5]:shutil.rmtree(t)
    return fd,total

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
    for name,fn in [("V27a_rufst_du_an.mp4",make_v27a),
                    ("V27b_ich_schaff_das_schon.mp4",make_v27b),
                    ("V27c_papa_sitzt_allein.mp4",make_v27c),
                    ("V27d_131euro_verschenkt.mp4",make_v27d),
                    ("V27e_was_oma_braucht.mp4",make_v27e)]:
        print(f"\n🎬 {name}")
        fd,total=fn();encode(fd,name,total);shutil.rmtree(fd)
    shutil.rmtree(TMP,ignore_errors=True)
    print("\n✅ All 5 UNIQUE videos done!")

if __name__=="__main__":main()
