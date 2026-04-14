#!/usr/bin/env python3
"""V27 Composite: Real video BG + text overlay. Runs on Mac."""
import os, shutil, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
FPS = 30
BASE = "/Users/work/alltagsengel"
FRAME_DIR = os.path.join(BASE, "_tmp_frames")
OUT_DIR = os.path.join(BASE, "social-media-grafiken/tiktok-v27")
CLIPS = os.path.join(BASE, "social-media-grafiken")
SCREENS = os.path.join(BASE, "app-store-screenshots")

GOLD = (201, 150, 60); GOLD_L = (219, 168, 74); CREAM = (245, 240, 230)
WHITE = (255, 255, 255); RED = (200, 60, 50)

def _font(size, bold=False):
    for p in ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Georgia.ttf",
              "/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def _sfont(size, bold=False):
    for p in ["/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/SFNSText.ttf"]:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_HOOK = _font(68); F_HOOK_SM = _font(52); F_BODY = _sfont(44)
F_BODY_B = _sfont(44, True); F_SMALL = _sfont(34); F_CTA = _sfont(52, True)
F_URL = _font(48); F_BIG = _font(110); F_BRAND = _sfont(26)

# ── Extract all frames from a clip into memory-mapped files ──
_ctr = [0]
def extract_clip(name, max_frames=150):
    _ctr[0] += 1
    d = os.path.join(BASE, f"_ext{_ctr[0]}")
    if os.path.exists(d): shutil.rmtree(d)
    os.makedirs(d)
    subprocess.run(["ffmpeg","-y","-i", os.path.join(CLIPS, name),
        "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}",
        "-frames:v", str(max_frames), os.path.join(d, "f_%05d.png")],
        capture_output=True, check=True)
    frames = sorted([os.path.join(d,f) for f in os.listdir(d) if f.endswith(".png")])
    print(f"    {name}: {len(frames)} frames extracted")
    return frames, d

def load_screen(name):
    img = Image.open(os.path.join(SCREENS, name)).convert("RGB")
    r = max(W/img.width, H/img.height)
    img = img.resize((int(img.width*r), int(img.height*r)), Image.LANCZOS)
    l = (img.width-W)//2; t = (img.height-H)//2
    return img.crop((l, t, l+W, t+H))

def vframe(frames, idx):
    return Image.open(frames[idx % len(frames)]).convert("RGB")

def ease(t): return 1-(1-t)**3
def fin(f, s, dur=8):
    if f<s: return 0.0
    if f>=s+dur: return 1.0
    return ease((f-s)/dur)
def sup(f, s, dur=10, dist=50):
    if f<s: return dist
    if f>=s+dur: return 0
    return int(dist*(1-ease((f-s)/dur)))

def darken(img, a=0.45):
    return Image.blend(img, Image.new("RGB",(W,H),(0,0,0)), 1-a)

def grad_bot(img, h=500, op=230):
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); od = ImageDraw.Draw(ov)
    for i in range(h):
        od.line([(0,H-h+i),(W,H-h+i)], fill=(13,10,8,int(op*(i/h)**1.3)))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

def grad_top(img, h=350, op=200):
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); od = ImageDraw.Draw(ov)
    for i in range(h):
        od.line([(0,i),(W,i)], fill=(13,10,8,int(op*((h-i)/h)**1.3)))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

def shtext(d, text, y, font, fill, sh=3):
    bb = d.textbbox((0,0), text, font=font); tw = bb[2]-bb[0]; x = (W-tw)//2
    d.text((x+sh, y+sh), text, font=font, fill=(0,0,0))
    d.text((x, y), text, font=font, fill=fill)
    return bb[3]-bb[1]

def logo(d, f):
    a = fin(f, 0, 15)
    if a <= 0: return
    c = tuple(int(v*a) for v in GOLD)
    bb = d.textbbox((0,0), "AlltagsEngel", font=F_BRAND); tw = bb[2]-bb[0]
    d.text(((W-tw)//2+2, 57), "AlltagsEngel", font=F_BRAND, fill=(0,0,0))
    d.text(((W-tw)//2, 55), "AlltagsEngel", font=F_BRAND, fill=c)
    d.line([(W//2-60, 90),(W//2+60, 90)], fill=c, width=1)

def cta(d, f, sf, extra=None):
    a = fin(f, sf, 12)
    if a <= 0: return
    gc = tuple(int(v*a) for v in GOLD); cc = tuple(int(v*a) for v in CREAM)
    y = H-300; d.line([(W//2-250,y),(W//2+250,y)], fill=gc, width=2); y += 30
    if extra: shtext(d, extra, y, F_SMALL, cc, 2); y += 55
    shtext(d, "alltagsengel.care", y, F_URL, gc, 3); y += 70
    shtext(d, "Finde deinen Engel.", y, F_SMALL, cc, 2)

def col(color, alpha):
    return tuple(int(v*alpha) for v in color)

def prep_bg(bg):
    return grad_bot(grad_top(bg, 280, 170), 450, 200)

# ── V27a: Rufst du oft genug an? (15s) ──
def make_v27a():
    total = 15*FPS
    print("  Extracting clips...")
    g, t1 = extract_clip("REELS-gesellschaft-neu.mp4")
    s, t2 = extract_clip("REELS-spaziergang-neu.mp4")
    e, t3 = extract_clip("REELS-einkauf-neu.mp4")
    ab = prep_bg(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(20)), 0.30))

    for f in range(total):
        if f < 2*FPS: bg = prep_bg(darken(vframe(g, f), 0.40))
        elif f < 6*FPS: bg = prep_bg(darken(vframe(s, f-2*FPS), 0.38))
        elif f < 10*FPS: bg = prep_bg(darken(vframe(e, f-6*FPS), 0.38))
        elif f < 10*FPS+15:
            v = prep_bg(darken(vframe(e, len(e)-1), 0.35))
            p = (f-10*FPS)/15; p = p*p*(3-2*p)
            bg = Image.blend(v, ab, p)
        else: bg = ab.copy()

        d = ImageDraw.Draw(bg); logo(d, f)

        if f < 2*FPS:
            a=fin(f,0,12); o=sup(f,0,15,50)
            shtext(d,"Wann hast du zuletzt",450+o,F_HOOK,col(GOLD_L,a),4)
            a2=fin(f,8,12); o2=sup(f,8,15,50)
            shtext(d,"bei Mama angerufen?",540+o2,F_HOOK,col(WHITE,a2),4)
        elif f < 6*FPS:
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
        elif f < 10*FPS:
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
            cta(d,f,12*FPS)

        bg.save(os.path.join(FRAME_DIR,f"frame_{f:05d}.png")); del bg,d
        if f%90==0: print(f"    {f}/{total}")

    for t in [t1,t2,t3]: shutil.rmtree(t)
    return total

# ── V27c: Papa sitzt allein (15s) ──
def make_v27c():
    total = 15*FPS
    print("  Extracting clips...")
    g, t1 = extract_clip("REELS-gesellschaft-neu.mp4")
    s, t2 = extract_clip("REELS-spaziergang-neu.mp4")
    c2, t3 = extract_clip("REELS-cafe-freizeit-neu.mp4")
    ab = prep_bg(darken(load_screen("screenshot-4-bestaetigt.png").filter(ImageFilter.GaussianBlur(20)), 0.28))

    for f in range(total):
        if f < 2*FPS: bg = prep_bg(darken(vframe(g, f), 0.45))
        elif f < 6*FPS: bg = prep_bg(darken(vframe(g, (f-2*FPS+30)%len(g)), 0.40))
        elif f < 10*FPS: bg = prep_bg(darken(vframe(s, f-6*FPS), 0.38))
        elif f < 10*FPS+15:
            v = prep_bg(darken(vframe(c2, 0), 0.35)); p=(f-10*FPS)/15; p=p*p*(3-2*p)
            bg = Image.blend(v, ab, p)
        else: bg = ab.copy()

        d = ImageDraw.Draw(bg); logo(d, f)

        if f < 2*FPS:
            a0=fin(f,0,10); o0=sup(f,0,12,40)
            if a0>0: shtext(d,"Papa sitzt allein",490+o0,F_HOOK,col(GOLD_L,a0),4)
            a1=fin(f,8,10); o1=sup(f,8,12,40)
            if a1>0: shtext(d,"am Küchentisch.",580+o1,F_HOOK_SM,col(WHITE,a1),4)
            a2=fin(f,18,10); o2=sup(f,18,12,40)
            if a2>0: shtext(d,"Seit 3 Stunden.",660+o2,F_BODY_B,col(RED,a2),3)
        elif f < 6*FPS:
            items=["Seit Mama weg ist,","redet er kaum noch.",None,"Das Essen bleibt stehen.",
                   "Die Wohnung wird leiser.",None,"Und du?","Du kannst nicht","jeden Tag da sein."]
            y=400
            for i,text in enumerate(items):
                if text is None: y+=22; continue
                fs=2*FPS+i*7; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                hl=text=="Und du?"; c=GOLD_L if hl else CREAM; fn=F_HOOK_SM if hl else F_BODY
                y+=shtext(d,text,y+o,fn,col(c,a),3)+10
        elif f < 10*FPS:
            items=[("Aber jemand kann.",GOLD_L,F_HOOK_SM),None,("Trinkt Kaffee mit ihm.",CREAM,F_BODY),
                   ("Geht spazieren.",CREAM,F_BODY),("Redet über früher.",CREAM,F_BODY),
                   ("Hört einfach zu.",WHITE,F_BODY_B)]
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
            cta(d,f,12*FPS,"131€/Monat von der Pflegekasse")

        bg.save(os.path.join(FRAME_DIR,f"frame_{f:05d}.png")); del bg,d
        if f%90==0: print(f"    {f}/{total}")

    for t in [t1,t2,t3]: shutil.rmtree(t)
    return total

# ── V27d: 131€ die du verschenkst (12s) ──
def make_v27d():
    total = 12*FPS
    print("  Extracting clips...")
    e, t1 = extract_clip("REELS-einkauf-neu.mp4")
    s, t2 = extract_clip("REELS-spaziergang-neu.mp4")
    ak = prep_bg(darken(load_screen("screenshot-5-pflegekasse.png").filter(ImageFilter.GaussianBlur(18)), 0.32))
    ah = prep_bg(darken(load_screen("screenshot-1-home.png").filter(ImageFilter.GaussianBlur(20)), 0.30))

    for f in range(total):
        if f < 2*FPS: bg = ak.copy()
        elif f < 5*FPS:
            if f<2*FPS+15: p=(f-2*FPS)/15; p=p*p*(3-2*p); bg=Image.blend(ak,prep_bg(darken(vframe(e,0),0.38)),p)
            else: bg = prep_bg(darken(vframe(e, f-2*FPS), 0.38))
        elif f < 8*FPS: bg = prep_bg(darken(vframe(s, f-5*FPS), 0.38))
        elif f < 8*FPS+15:
            v=prep_bg(darken(vframe(s,len(s)-1),0.35)); p=(f-8*FPS)/15; p=p*p*(3-2*p)
            bg=Image.blend(v,ah,p)
        else: bg = ah.copy()

        d = ImageDraw.Draw(bg); logo(d, f)

        if f < 2*FPS:
            a=fin(f,0,10); o=sup(f,0,15,60)
            shtext(d,"131€",400+o,F_BIG,col(GOLD,a),5)
            a2=fin(f,8,10); o2=sup(f,8,12,40)
            shtext(d,"im Monat stehen dir zu.",560+o2,F_BODY,col(CREAM,a2),3)
            a3=fin(f,16,10)
            shtext(d,"Und du nutzt sie nicht.",625+o2,F_BODY_B,col(RED,a3),3)
        elif f < 5*FPS:
            items=[("Ab Pflegegrad 1",CREAM,F_BODY),("zahlt die Pflegekasse",CREAM,F_BODY),
                   ("den Entlastungsbetrag:",CREAM,F_BODY),None,("131€/Monat.",GOLD_L,F_CTA),
                   None,("Für Alltagsbegleitung.",CREAM,F_BODY),("Nicht für Pflege.",CREAM,F_BODY)]
            y=400
            for i,item in enumerate(items):
                if item is None: y+=22; continue
                text,color,font=item
                fs=2*FPS+i*7; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+12
        elif f < 8*FPS:
            items=[("Jemand geht für",CREAM,F_BODY),("Oma einkaufen.",CREAM,F_BODY),
                   ("Begleitet sie zum Arzt.",CREAM,F_BODY),("Spielt mit ihr.",CREAM,F_BODY),
                   None,("Und du hast 3 Stunden",GOLD_L,F_HOOK_SM),("für DICH.",GOLD,F_HOOK)]
            y=410
            for i,item in enumerate(items):
                if item is None: y+=22; continue
                text,color,font=item
                fs=5*FPS+i*7; a=fin(f,fs,10); o=sup(f,fs,12,35)
                if a<=0: continue
                y+=shtext(d,text,y+o,font,col(color,a),3)+12
        else:
            a=fin(f,8*FPS,10); o=sup(f,8*FPS,12,40)
            if a>0:
                shtext(d,"Nicht genutztes Geld",440+o,F_BODY_B,col(RED,a),3)
                shtext(d,"verfällt.",500+o,F_BODY_B,col(RED,a),3)
            a2=fin(f,8*FPS+15,10); o2=sup(f,8*FPS+15,12,35)
            if a2>0:
                shtext(d,"1.572€ im Jahr",580+o2,F_CTA,col(GOLD,a2),4)
                shtext(d,"— einfach weg.",650+o2,F_BODY,col(CREAM,a2),3)
            cta(d,f,10*FPS,"Nicht warten. Jetzt Engel finden.")

        bg.save(os.path.join(FRAME_DIR,f"frame_{f:05d}.png")); del bg,d
        if f%90==0: print(f"    {f}/{total}")

    for t in [t1,t2]: shutil.rmtree(t)
    return total

def encode(name, total):
    out = os.path.join(OUT_DIR, name)
    subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",os.path.join(FRAME_DIR,"frame_%05d.png"),
        "-frames:v",str(total),"-c:v","libx264","-pix_fmt","yuv420p","-crf","18",
        "-preset","medium","-movflags","+faststart",out], check=True, capture_output=True)
    mb = os.path.getsize(out)/1024/1024
    print(f"  ✓ {name} ({total/FPS:.0f}s, {mb:.1f}MB)")

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in [("V27a_rufst_du_an.mp4", make_v27a),
                     ("V27c_papa_sitzt_allein.mp4", make_v27c),
                     ("V27d_131euro_verschenkt.mp4", make_v27d)]:
        print(f"\n🎬 {name}...")
        if os.path.exists(FRAME_DIR): shutil.rmtree(FRAME_DIR)
        os.makedirs(FRAME_DIR)
        total = fn(); encode(name, total); shutil.rmtree(FRAME_DIR)
    print("\n✅ 3 composite videos ready!")

if __name__ == "__main__":
    main()
