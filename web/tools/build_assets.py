#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
素材处理脚本 —— 把收集到的原始图片转成网页可用的资源，并生成清单 JSON。
只需运行一次；以后新增素材再运行即可。
"""
import os, re, json, sys, unicodedata
from PIL import Image

SRC = r"D:\Blue and White porcelain\_work\青花瓷资料收集"
SRC2 = r"D:\Blue and White porcelain\_work\传承人故事文章与照片"
OUT = r"D:\Blue and White porcelain\web\assets"

MAX_FULL = 1400
MAX_THUMB = 520
Q = 82

if not os.path.isdir(SRC):
    sys.exit('源目录不存在：\n  %s\n请先把「资料素材\\青花瓷资料收集 (2).zip」解压到 _work\\青花瓷资料收集，\n或修改本文件顶部的 SRC / SRC2。' % SRC)

def slug(s):
    """中文 → 安全的 ASCII 片段（保留英文数字，其余转拼音首字母不可得则用 hash）"""
    s = unicodedata.normalize('NFKC', s).strip()
    s = re.sub(r'[\\/:*?"<>|\s]+', '-', s)
    return s

def safe(name):
    """把不适合出现在 URL 里的字符换成连字符，保留中文（现代浏览器都支持）"""
    name = unicodedata.normalize('NFKC', name).strip()
    name = re.sub(r'[\\/:*?"<>|\s]+', '-', name)
    return name.strip('-.') or 'item'

def process(src_path, rel_out, name_hint=""):
    """压缩 + 生成缩略图，返回 (relative_url, thumb_url, 宽, 高)"""
    try:
        im = Image.open(src_path)
        im = im.convert('RGB')
    except Exception as e:
        print('  ! skip', src_path, e)
        return None

    w, h = im.size
    # 全图
    full = im.copy()
    full.thumbnail((MAX_FULL, MAX_FULL), Image.LANCZOS)
    fp = os.path.join(rel_out + '.jpg')
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    full.save(fp, 'JPEG', quality=Q, optimize=True, progressive=True)

    # 缩略图
    th = im.copy()
    th.thumbnail((MAX_THUMB, MAX_THUMB), Image.LANCZOS)
    tp = fp.replace('.jpg', '_t.jpg')
    th.save(tp, 'JPEG', quality=78, optimize=True, progressive=True)

    return {
        'img': os.path.relpath(fp, OUT).replace('\\', '/'),
        'thumb': os.path.relpath(tp, OUT).replace('\\', '/'),
        'w': w, 'h': h,
        'bytes': os.path.getsize(fp),
    }

manifest = {'patterns': [], 'shapes': [], 'masters': [], 'videos': []}

# ============ 1. 纹样（按朝代） ============
print('[1/4] 纹样 ...')
base = os.path.join(SRC, '名称')
for era in sorted(os.listdir(base)):
    d = os.path.join(base, era)
    if not os.path.isdir(d): continue
    ekey = safe(era)
    for fn in sorted(os.listdir(d)):
        p = os.path.join(d, fn)
        if not os.path.isfile(p): continue
        stem = os.path.splitext(fn)[0]
        r = process(p, os.path.join(OUT, 'img', 'patterns', ekey, safe(stem)))
        if not r: continue
        r.update({'name': stem, 'era': era, 'file': fn})
        manifest['patterns'].append(r)

# ============ 2. 器型（按大类/朝代） ============
print('[2/4] 器型 ...')
base = os.path.join(SRC, '器型')
for cat in sorted(os.listdir(base)):
    d = os.path.join(base, cat)
    if not os.path.isdir(d): continue
    ckey = safe(cat)
    for sub in sorted(os.listdir(d)):
        sd = os.path.join(d, sub)
        if not os.path.isdir(sd): continue
        if sub.startswith('.'): continue
        for fn in sorted(os.listdir(sd)):
            p = os.path.join(sd, fn)
            if not os.path.isfile(p): continue
            stem = os.path.splitext(fn)[0]
            r = process(p, os.path.join(OUT, 'img', 'shapes', ckey, safe(sub), safe(stem)))
            if not r: continue
            r.update({'name': stem, 'cat': cat, 'dynasty': sub, 'file': fn})
            manifest['shapes'].append(r)

# ============ 3. 匠人 ============
print('[3/4] 匠人 ...')
if os.path.isdir(SRC2):
    for person in sorted(os.listdir(SRC2)):
        d = os.path.join(SRC2, person)
        if not os.path.isdir(d): continue
        for fn in sorted(os.listdir(d)):
            if not fn.lower().endswith(('.jpeg', '.jpg', '.png')): continue
            p = os.path.join(d, fn)
            r = process(p, os.path.join(OUT, 'img', 'masters', safe(person), safe(person)))
            if not r: continue
            r['name'] = person
            r['key'] = safe(person)
            manifest['masters'].append(r)

out_json = os.path.join(OUT, 'data', 'manifest.json')
os.makedirs(os.path.dirname(out_json), exist_ok=True)
with open(out_json, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)

print('\n完成：')
print('  纹样 %d 张 / 器型 %d 张 / 匠人 %d 位' % (
    len(manifest['patterns']), len(manifest['shapes']), len(manifest['masters'])))