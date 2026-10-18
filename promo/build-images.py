"""Render the 图文 (image-text post) set for 抖音 from the same copy as douyin.html.

抖音图文以 3:4 竖版显示最完整，所以画布是 1080×1440（9:16 会在信息流里被裁）。
输出 promo/images/01.png … 08.png，可直接上传发布。

usage: python build-images.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1440
BG_TOP = (0x14, 0x1A, 0x28)
BG_BOTTOM = (0x08, 0x0A, 0x0F)
BRAND = (0x7D, 0x92, 0xFF)
BRAND_DEEP = (0x4D, 0x6B, 0xFE)
FG = (0xF3, 0xF5, 0xF9)
DIM = (0x9A, 0xA4, 0xB5)
PANEL = (0x16, 0x1A, 0x22)
LINE = (0x2B, 0x33, 0x42)
BUBBLE = (0x17, 0x1C, 0x26)
BUBBLE_USER = (0x1A, 0x24, 0x40)

FONT_DIR = Path("C:/Windows/Fonts")
PAD = 84
TOTAL = 8


def font(size, bold=False):
    return ImageFont.truetype(str(FONT_DIR / ("msyhbd.ttc" if bold else "msyh.ttc")), size, index=0)


def background():
    img = Image.new("RGB", (W, H), BG_BOTTOM)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        draw.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] * (1 - t) + BG_BOTTOM[i] * t) for i in range(3)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-W * 0.15, -H * 0.42, W * 1.15, H * 0.32], fill=(0x4D, 0x6B, 0xFE, 62))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    return Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")


def wrap(draw, text, f, max_w):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        if draw.textlength(cur + ch, font=f) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def block(draw, x, y, text, f, fill, max_w, gap=1.38, center=False):
    for line in wrap(draw, text, f, max_w):
        w = draw.textlength(line, font=f)
        draw.text((x + (max_w - w) / 2 if center else x, y), line, font=f, fill=fill)
        y += int(f.size * gap)
    return y


def card(draw, box, fill, outline=LINE, radius=26, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def chrome(draw, index, tag="DeepSeek Harness 插件 · 术语速查"):
    draw.text((PAD, 62), tag, font=font(28), fill=(0x8B, 0x95, 0xA8))
    label = f"{index}/{TOTAL}"
    w = draw.textlength(label, font=font(28))
    draw.text((W - PAD - w, H - 78), label, font=font(28), fill=(0x5A, 0x63, 0x75))


def pill(draw, x, y, text, f, fill, outline, pad_x=34, pad_y=18):
    w = draw.textlength(text, font=f)
    box = [x, y, x + w + pad_x * 2, y + f.size + pad_y * 2]
    draw.rounded_rectangle(box, radius=(box[3] - box[1]) / 2, fill=fill, outline=outline, width=2)
    draw.text((x + pad_x, y + pad_y - 2), text, font=f, fill=FG)
    return box


def chat_card(draw, top, lines, term=None):
    """Dark chat bubble holding one paragraph; `term` gets a highlight box."""
    f = font(38)
    inner = W - PAD * 2 - 90 - 30
    body = "".join(lines)
    wrapped = wrap(draw, body, f, inner)
    height = len(wrapped) * int(f.size * 1.7) + 76
    card(draw, [PAD, top, W - PAD, top + height], BUBBLE)
    draw.rounded_rectangle([PAD + 26, top + 26, PAD + 26 + 44, top + 26 + 44], radius=12, fill=BRAND_DEEP)
    y = top + 34
    for line in wrapped:
        x = PAD + 90
        if term and term in line:
            head, tail = line.split(term, 1)
            draw.text((x, y), head, font=f, fill=(0xE6, 0xEA, 0xF3))
            x += draw.textlength(head, font=f)
            tw = draw.textlength(term, font=f)
            draw.rounded_rectangle([x - 6, y - 4, x + tw + 6, y + f.size + 10], radius=8, fill=(0x4D, 0x6B, 0xFE, 90))
            draw.text((x, y), term, font=f, fill=(0xFF, 0xFF, 0xFF))
            x += tw
            draw.text((x, y), tail, font=f, fill=(0xE6, 0xEA, 0xF3))
        else:
            draw.text((x, y), line, font=f, fill=(0xE6, 0xEA, 0xF3))
        y += int(f.size * 1.7)
    return top + height


def popover(draw, top):
    """The plugin's own popover, mirrored from the real UI."""
    f_term, f_body, f_foot = font(40, True), font(34), font(26)
    inner = W - PAD * 2 - 64
    lines = [
        "同一个操作执行一次和多次，对系统状态的影响相同。",
        "用途：网络超时重试、连点提交，都不会重复扣款。",
        "用法：接口带唯一 requestId，",
        "服务端记住已处理过的请求。",
    ]
    wrapped = []
    for line in lines:
        wrapped.extend(wrap(draw, line, f_body, inner))
    body_h = len(wrapped) * int(f_body.size * 1.62) + 40
    total = 96 + body_h + 74
    card(draw, [PAD, top, W - PAD, top + total], PANEL, radius=28)
    draw.text((PAD + 32, top + 26), "幂等性", font=f_term, fill=FG)
    draw.text((W - PAD - 32 - draw.textlength("术语速查", font=font(26)), top + 36), "术语速查", font=font(26), fill=DIM)
    draw.line([(PAD, top + 96), (W - PAD, top + 96)], fill=(0x23, 0x2A, 0x37), width=2)
    y = top + 118
    for line in wrapped:
        draw.text((PAD + 32, y), line, font=f_body, fill=(0xE7, 0xEB, 0xF3))
        y += int(f_body.size * 1.62)
    draw.line([(PAD, top + total - 74), (W - PAD, top + total - 74)], fill=(0x23, 0x2A, 0x37), width=2)
    draw.text((PAD + 32, top + total - 56), "token：输入 204 · 输出 330 · 合计 534", font=f_foot, fill=DIM)
    return top + total


# ── 1 · 封面 ────────────────────────────────────────────────────────────
def slide1():
    img, draw = background(), None
    draw = ImageDraw.Draw(img)
    chrome(draw, 1)
    draw.text((PAD, 176), "读文档 / 看教程时", font=font(30, True), fill=BRAND)
    block(draw, PAD, 240, "又卡在\n术语上？", font(122, True), FG, W - PAD * 2, gap=1.2)
    block(draw, PAD, 560, "选中它，就地解释", font(46, True), (0xD6, 0xDD, 0xEC), W - PAD * 2)
    card(draw, [PAD, 660, W - PAD, 950], BUBBLE)
    draw.text((PAD + 34, 700), "会话需要保证 ", font=font(38), fill=(0xE6, 0xEA, 0xF3))
    x = PAD + 34 + draw.textlength("会话需要保证 ", font=font(38))
    draw.rounded_rectangle([x - 6, 694, x + draw.textlength("幂等性", font=font(38)) + 6, 748], radius=8, fill=(0x4D, 0x6B, 0xFE, 110))
    draw.text((x, 700), "幂等性", font=font(38), fill=(0xFF, 0xFF, 0xFF))
    draw.text((PAD + 34, 770), "重复提交不会产生副作用……", font=font(38), fill=(0xE6, 0xEA, 0xF3))
    pill(draw, PAD + 420, 848, "搜索", font(32, True), BUBBLE, (0x3A, 0x42, 0x56))
    block(draw, PAD, 1010, "基本含义 · 用途 · 用法\n顺手看这次花掉多少 token", font(34), DIM, W - PAD * 2, gap=1.6)
    draw.text((PAD, 1130), "→ 左滑看效果", font=font(32, True), fill=(0x5F, 0x74, 0xC8))
    draw.text((PAD, H - 190), "术语速查  ·  开源免费", font=font(36, True), fill=FG)
    return img


# ── 2 · 痛点 ────────────────────────────────────────────────────────────
def slide2():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 2)
    block(draw, PAD, 190, "以前只能\n新开一个对话问", font(76, True), FG, W - PAD * 2, gap=1.26)
    top = chat_card(draw, 470, ["会话需要保证 幂等性 ，重复提交不会产生副作用……"], term="幂等性")
    card(draw, [PAD, top + 40, W - PAD, top + 200], BUBBLE_USER, (0x2B, 0x39, 0x60))
    draw.text((PAD + 34, top + 78), "（幂等性是啥？再开个对话问一下…）", font=font(34), fill=DIM)
    y = top + 280
    for line in ["一打断，思路就没了", "回过神还得重新找位置", "问一次要等半天"]:
        draw.text((PAD, y), "·", font=font(34, True), fill=BRAND)
        block(draw, PAD + 34, y, line, font(34), (0xC9, 0xD1, 0xE0), W - PAD * 2 - 34, gap=1.5)
        y += 96
    return img


# ── 3 · 一步 ────────────────────────────────────────────────────────────
def slide3():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 3)
    block(draw, PAD, 190, "现在只要\n选中 + 点一下", font(76, True), FG, W - PAD * 2, gap=1.26)
    top = chat_card(draw, 470, ["会话需要保证 幂等性 ，重复提交不会产生副作用……"], term="幂等性")
    pill(draw, W - PAD - 232, top + 34, "搜索", font(34, True), BUBBLE, (0x3A, 0x42, 0x56))
    block(draw, PAD, top + 180, "解释就出现在原地——不用切窗口，也不用新开对话。", font(34), DIM, W - PAD * 2, gap=1.55)
    y = 1080
    x = PAD
    for index, label in enumerate(["选中文字", "点「搜索」", "就地出解释"]):
        f = font(30, True)
        w = draw.textlength(label, font=f) + 56
        active = index == 1
        card(draw, [x, y, x + w, y + 66], (0x18, 0x22, 0x3C) if active else (0x12, 0x17, 0x22),
             BRAND_DEEP if active else LINE, radius=33)
        draw.text((x + 28, y + 14), label, font=f, fill=(0xCF, 0xDA, 0xFF) if active else (0xDF, 0xE5, 0xF1))
        x += w
        if index < 2:
            draw.text((x + 16, y + 12), "→", font=font(30, True), fill=(0x5F, 0x74, 0xC8))
            x += 56
    return img


# ── 4 · 效果 ────────────────────────────────────────────────────────────
def slide4():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 4)
    block(draw, PAD, 170, "一次说清", font(86, True), FG, W - PAD * 2)
    block(draw, PAD, 300, "基本含义 · 用途 · 用法", font(34, True), BRAND, W - PAD * 2)
    popover(draw, 370)
    block(draw, PAD, 860, "旁边那行数字，就是这次解释消耗的 token。\n只选中不发问，不花钱。", font(32), DIM, W - PAD * 2, gap=1.62)
    card(draw, [PAD, 1010, W - PAD, 1200], (0x18, 0x22, 0x3C))
    draw.rounded_rectangle([PAD + 40, 1046, PAD + 68, 1074], radius=14, fill=BRAND_DEEP)
    block(draw, PAD + 100, 1036, "点「搜索」= 一次旁路调用\n不写进会话记录，也不占上下文轮次", font(30), (0xE7, 0xEB, 0xF3), W - PAD * 2 - 140, gap=1.5)
    return img


# ── 5 · 不打断 ──────────────────────────────────────────────────────────
def slide5():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 5)
    block(draw, PAD, 200, "它不打断\n你手上的活", font(90, True), FG, W - PAD * 2, gap=1.24)
    items = [
        "不写进会话记录\n不占上下文轮次",
        "正在跑的任务、正在写的代码\n都不受影响",
        "顺手告诉你\n这次解释花了多少 token",
    ]
    y = 520
    for index, text in enumerate(items):
        card(draw, [PAD, y, W - PAD, y + 200], PANEL if index else (0x18, 0x22, 0x3C))
        draw.rounded_rectangle([PAD + 40, y + 60, PAD + 68, y + 88], radius=14, fill=BRAND_DEEP)
        block(draw, PAD + 100, y + 44, text, font(36), (0xE7, 0xEB, 0xF3), W - PAD * 2 - 140, gap=1.5)
        y += 232
    return img


# ── 6 · 领域 ────────────────────────────────────────────────────────────
def slide6():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 6)
    block(draw, PAD, 200, "按你正在聊的\n领域来回答", font(84, True), FG, W - PAD * 2, gap=1.24)
    block(draw, PAD, 480, "它读的是你这段对话本身，同一个词在医学、法律里不会被硬套成技术术语。", font(34), DIM, W - PAD * 2, gap=1.55)
    x, y = PAD, 640
    for index, chip in enumerate(["计算机", "医学", "法律", "金融", "化学", "物理"]):
        f = font(34)
        w = draw.textlength(chip, font=f) + 52
        if x + w > W - PAD:
            x, y = PAD, y + 100
        card(draw, [x, y, x + w, y + 72], (0x16, 0x20, 0x3A) if index == 0 else (0x12, 0x17, 0x22),
             (0x4D, 0x6B, 0xFE) if index == 0 else LINE, radius=36)
        draw.text((x + 26, y + 16), chip, font=f, fill=(0xCF, 0xDA, 0xFF) if index == 0 else (0xDF, 0xE5, 0xF1))
        x += w + 20
    card(draw, [PAD, 770, W - PAD, 1120], PANEL)
    draw.text((PAD + 34, 802), "同一个词，两个领域", font=font(26, True), fill=BRAND)
    draw.text((PAD + 34, 844), "「代偿」", font=font(38, True), fill=FG)
    block(draw, PAD + 34, 904, "医学：器官功能受损后，其他部分增强来补上", font(28), (0xE7, 0xEB, 0xF3), W - PAD * 2 - 68, gap=1.5)
    block(draw, PAD + 34, 952, "金融 / 法律：由第三方代替偿还债务", font(28), (0xE7, 0xEB, 0xF3), W - PAD * 2 - 68, gap=1.5)
    draw.line([(PAD + 34, 1004), (W - PAD - 34, 1004)], fill=(0x23, 0x2A, 0x37), width=2)
    block(draw, PAD + 34, 1024, "它不会硬把「代偿」解释成程序里的补偿事务。", font(26), DIM, W - PAD * 2 - 68, gap=1.5)
    return img


# ── 7 · 安装 ────────────────────────────────────────────────────────────
def slide7():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 7)
    block(draw, PAD, 190, "三步装好", font(92, True), FG, W - PAD * 2)
    block(draw, PAD, 320, "不用命令行", font(38, True), BRAND, W - PAD * 2)
    steps = [
        ("1", "设置 → 插件 → 市场"),
        ("2", "搜 dsh-term-glossary"),
        ("3", "点安装"),
    ]
    y = 470
    for index, (num, text) in enumerate(steps):
        card(draw, [PAD, y, W - PAD, y + 178], PANEL)
        draw.rounded_rectangle([PAD + 34, y + 44, PAD + 34 + 84, y + 128], radius=20, fill=(0x18, 0x22, 0x3C))
        draw.text((PAD + 34 + 26, y + 56), num, font=font(46, True), fill=BRAND)
        block(draw, PAD + 150, y + 56, text, font(36), (0xE7, 0xEB, 0xF3), W - PAD * 2 - 200, gap=1.45)
        y += 210
    block(draw, PAD, 1120, "也可以在对话里直接说：\n「帮我安装插件 dsh-term-glossary」", font(32), DIM, W - PAD * 2, gap=1.6)
    return img


# ── 8 · 结尾 ────────────────────────────────────────────────────────────
def slide8():
    img = background()
    draw = ImageDraw.Draw(img)
    chrome(draw, 8)
    draw.text((PAD, 300), "术语速查", font=font(120, True), fill=FG)
    block(draw, PAD, 470, "选中术语就地解释\n不打断对话 · 顺手看成本", font(38), DIM, W - PAD * 2, gap=1.6)
    card(draw, [PAD, 680, W - PAD, 1130], BUBBLE)
    rows = [
        ("GitHub", "github.com/ashz555/dsh-term-glossary"),
        ("插件市场", "设置 → 插件 → 市场，搜 dsh-term-glossary"),
        ("一行命令", "dsh plugin --profile <profile> add dsh-term-glossary"),
    ]
    y = 730
    for label, value in rows:
        draw.text((PAD + 34, y), label, font=font(26, True), fill=BRAND)
        y += 46
        y = block(draw, PAD + 34, y, value, font(30), (0xE7, 0xEB, 0xF3), W - PAD * 2 - 68, gap=1.4)
        y += 34
    block(draw, PAD, 1200, "开源免费 · MIT 许可 · 需要 DSH（DeepSeek Harness）", font(28), (0x6F, 0x79, 0x8C), W - PAD * 2)
    return img


SLIDES = [slide1, slide2, slide3, slide4, slide5, slide6, slide7, slide8]

out_dir = Path(__file__).with_name("images")
out_dir.mkdir(exist_ok=True)
for index, make in enumerate(SLIDES, start=1):
    path = out_dir / f"{index:02d}.png"
    make().save(path, optimize=True)
    print(f"wrote {path.name}  {path.stat().st_size // 1024} KB")
print(f"共 {len(SLIDES)} 张，画布 {W}x{H}（3:4）")
