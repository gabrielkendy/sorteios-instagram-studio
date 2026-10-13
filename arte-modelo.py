"""Arte do ganhador usando o MODELO (template) do dono.
Coloca a foto do ganhador no circulo e o @nome na caixa, sobre o template.
"""
from PIL import Image, ImageDraw, ImageFont, ImageOps
import os, sys, json

TEMPLATE = r"C:\Users\Gabriel\Documents\New project\.hermes\desktop-attachments\ChatGPT Image 13 de out. de 2026, 08_31_43.png"
SAIDA    = r"C:\Users\Gabriel\Documents\NECHIO_SORTEIOS_STUDIO\gravacao\ARTE-MODELO.png"

# Coordenadas MEDIDAS no template (941x1672)
CIRC_CX, CIRC_CY, CIRC_R = 470, 744, 166   # raio util (dentro do anel verde)
BOX_X0, BOX_Y0, BOX_X1, BOX_Y1 = 102, 1005, 837, 1090

def acha_fonte(tamanho):
    """Fonte bold do sistema, sem depender de instalacao extra."""
    cands = [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\Arialbd.ttf",
        r"C:\Windows\Fonts\verdanab.ttf",
    ]
    for c in cands:
        if os.path.exists(c):
            return ImageFont.truetype(c, tamanho)
    return ImageFont.load_default()

def montar(foto_path, handle, saida=SAIDA):
    base = Image.open(TEMPLATE).convert('RGB')

    # --- 0) SOBE O TEMPLATE PARA 1080x1920 (9:16 exato, escala de 941x1672) ---
    ESCALA = 1080.0 / base.size[0]          # 1080/941 = 1.14772...
    base = base.resize((1080, 1920), Image.LANCZOS)
    cx = int(round(CIRC_CX * ESCALA))
    cy = int(round(CIRC_CY * ESCALA))
    rr = int(round(CIRC_R  * ESCALA))
    bx0, by0 = int(round(BOX_X0 * ESCALA)), int(round(BOX_Y0 * ESCALA))
    bx1, by1 = int(round(BOX_X1 * ESCALA)), int(round(BOX_Y1 * ESCALA))

    # --- 1) FOTO dentro do circulo ---
    if foto_path and os.path.exists(foto_path):
        foto = Image.open(foto_path).convert('RGB')
        lado = min(foto.size)
        # recorte quadrado central
        foto = ImageOps.fit(foto, (lado, lado), method=Image.LANCZOS,
                            centering=(0.5, 0.45))
        # mascara circular
        mask = Image.new('L', (lado, lado), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, lado, lado], fill=255)
        foto = foto.resize((rr*2, rr*2), Image.LANCZOS)
        mask = mask.resize((rr*2, rr*2), Image.LANCZOS)
        base.paste(foto, (cx-rr, cy-rr), mask)

    # --- 2) NOME na caixa ---
    d = ImageDraw.Draw(base)
    txt = handle if handle.startswith('@') else '@' + handle
    # fonte que caiba na largura da caixa (menos margem)
    tam = int(round(62 * ESCALA))
    while tam > 20:
        f = acha_fonte(tam)
        bb = d.textbbox((0,0), txt, font=f)
        if (bb[2]-bb[0]) <= (bx1-bx0) - int(50*ESCALA):
            break
        tam -= 2
    f = acha_fonte(tam)
    bb = d.textbbox((0,0), txt, font=f)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    tx = (bx0+bx1)//2 - tw//2 - bb[0]
    ty = (by0+by1)//2 - th//2 - bb[1]
    d.text((tx,ty), txt, font=f, fill=(255,248,241))

    base.save(saida, quality=96)
    return saida

if __name__ == '__main__':
    foto = sys.argv[1] if len(sys.argv)>1 else None
    handle = sys.argv[2] if len(sys.argv)>2 else '@ganhador'
    out = montar(foto, handle)
    print("ARTE:", out, Image.open(out).size)
