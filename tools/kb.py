# -*- coding: utf-8 -*-
"""毛诗知识库：从鉴赏目录生成编辑队列，并把 content/poems 编进 web/data/poems.js。"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NCX = ROOT / "data" / "_extracted" / "毛泽东诗词全编鉴赏" / "toc.ncx"
EXTRACTED = "data/_extracted/毛泽东诗词全编鉴赏"
CONTENT = ROOT / "content"
POEMS_DIR = CONTENT / "poems"
CATALOG = CONTENT / "catalog.json"
WEB_POEMS = ROOT / "web" / "data" / "poems.js"
NS = {"n": "http://www.daisy.org/z3986/2005/ncx/"}

# 鉴赏 xhtml 文件名 partNNNN → 产品 id。已写入 App 的八首保持原 id。
ID_BY_PART = {
    7: "he-xin-lang",
    8: "changsha",
    9: "huanghelou",
    10: "jinggangshan",
    11: "jianggui",
    12: "chongyang",
    13: "yuandan",
    14: "guangchang",
    15: "tingzhou",
    16: "weijiao-1",
    17: "weijiao-2",
    18: "dabaidi",
    19: "huichang",
    20: "shiliu-zi-ling",
    21: "loushanguan",
    22: "changzheng",
    23: "kunlun",
    24: "liupanshan",
    25: "xue",
    26: "nanjing",
    27: "he-liuyazi",
    28: "huanxisha-he-liuyazi",
    29: "beidaihe",
    30: "youyong",
    31: "da-lishuyi",
    32: "song-wenshen",
    33: "shaoshan",
    34: "lushan",
    35: "nvminbing",
    36: "da-youren",
    37: "xianrendong",
    38: "he-guomoro",
    39: "yongmei",
    40: "dongyun",
    41: "manjianghong-he-guomoro",
    42: "diao-luoronghuan",
    43: "dushi",
    44: "chongshang-jinggangshan",
    45: "niaoer-wenda",
    46: "wan-yichangtao",
    47: "song-zongyu",
    48: "zhenshang",
    49: "qiushou",
    50: "gei-pengdehuai",
    51: "gei-dingling",
    52: "wan-daianlan",
    53: "zhangguandao",
    54: "xiwen-jiebao",
    55: "huanxisha-miaoxiangshan",
    56: "he-zhoushizhao",
    57: "kanshan",
    58: "moganshan",
    59: "wuyunshan",
    60: "guanchao",
    61: "liufen",
    62: "quyuan",
    63: "jinian-luxun",
    64: "balian-song",
    65: "niannujiao-jinggangshan",
    66: "hongdu",
    67: "you-suo-si",
    68: "jiayi",
    69: "yong-jiayi",
}

TITLE_OVERRIDE = {
    7: "贺新郎·别友",
    46: "五古·挽易昌陶",
    61: "七绝·刘蕡",
}

CI_PAI = {
    "贺新郎", "沁园春", "菩萨蛮", "西江月", "清平乐", "采桑子", "如梦令",
    "减字木兰花", "蝶恋花", "渔家傲", "十六字令", "十六字令三首", "忆秦娥",
    "念奴娇", "浣溪沙", "浪淘沙", "水调歌头", "卜算子", "满江红", "虞美人",
    "临江仙",
}

SHI_TI = {
    "七律", "七绝", "七律二首", "七绝二首", "七古", "五古", "五律", "六言诗", "杂言诗",
}


def part_no(src: str) -> int:
    m = re.search(r"part(\d+)\.xhtml", src)
    if not m:
        raise ValueError(src)
    return int(m.group(1))


def label(el: ET.Element) -> str:
    t = el.find("n:navLabel/n:text", NS)
    return (t.text or "").strip() if t is not None else ""


def href(el: ET.Element) -> str:
    c = el.find("n:content", NS)
    return c.get("src") if c is not None else ""


def children(el: ET.Element) -> list[ET.Element]:
    return el.findall("n:navPoint", NS)


def display_title(part: int, toc_title: str) -> str:
    if part in TITLE_OVERRIDE:
        return TITLE_OVERRIDE[part]
    return toc_title.replace(" ", "·", 1)


def form_of(title: str) -> str:
    head = title.split("·", 1)[0].split(" ", 1)[0]
    if head in CI_PAI or head.startswith("十六字令"):
        return "词"
    if head in SHI_TI:
        return head
    return ""


def build_catalog() -> dict:
    root = ET.parse(NCX).getroot()
    nav = root.find("n:navMap", NS)
    poems = []
    published = {p.stem for p in poem_files()}

    for top in children(nav):
        section = label(top)
        if section not in ("正编", "副编"):
            continue
        for item in children(top):
            kids = children(item)
            names = [label(k) for k in kids]
            if "【考辨】" not in names:
                continue
            src = href(item)
            part = part_no(src)
            pid = ID_BY_PART[part]
            essays = []
            kaobian = ""
            for k in kids:
                name = label(k)
                if name == "【考辨】":
                    kaobian = href(k)
                else:
                    essays.append({"title": name, "src": href(k)})
            toc_title = label(item)
            title = display_title(part, toc_title)
            status = "published" if pid in published else "queued"
            rec = {
                "id": pid,
                "title": title,
                "tocTitle": toc_title,
                "form": form_of(title),
                "section": section,
                "status": status,
                "file": f"poems/{pid}.json" if status == "published" else None,
                "source": {
                    "book": "毛泽东诗词全编鉴赏",
                    "extracted": EXTRACTED,
                    "src": src,
                    "kaobian": kaobian,
                    "essays": essays,
                },
            }
            poems.append(rec)

    return {
        "product": "毛诗",
        "note": "这是编辑队列，不是运行时自动写稿。App 只读 content/poems 里已经写完、再编进 web/data/poems.js 的记录。",
        "sources": {
            "鉴赏": EXTRACTED,
            "年谱": "data/_extracted/《毛泽东年谱(全九卷)》",
            "传记": "data/_extracted/毛泽东传 (逢先知, 金冲及, 中共中央文献硏究室)",
        },
        "counts": {
            "catalog": len(poems),
            "published": sum(1 for p in poems if p["status"] == "published"),
            "queued": sum(1 for p in poems if p["status"] == "queued"),
        },
        "poems": poems,
    }


def dump_web_poems() -> None:
    script = r"""
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = process.cwd();
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'web/data/poems.js'), 'utf8'), ctx);
const dir = path.join(root, 'content/poems');
fs.mkdirSync(dir, { recursive: true });
(ctx.window.POEMS || []).forEach((p, i) => {
  const rec = { order: i + 1, ...p };
  fs.writeFileSync(path.join(dir, rec.id + '.json'), JSON.stringify(rec, null, 2) + '\n', 'utf8');
});
console.log((ctx.window.POEMS || []).length);
"""
    r = subprocess.run(["node", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True)
    print("dumped", r.stdout.strip(), "poems")


def build_web_poems() -> None:
    files = sorted(
        poem_files(),
        key=lambda p: json.loads(p.read_text(encoding="utf-8")).get("order", 99),
    )
    poems = []
    for f in files:
        rec = json.loads(f.read_text(encoding="utf-8"))
        rec.pop("order", None)
        poems.append(rec)
    WEB_POEMS.parent.mkdir(parents=True, exist_ok=True)
    WEB_POEMS.write_text(
        "window.POEMS = " + json.dumps(poems, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print("wrote", WEB_POEMS.relative_to(ROOT), "n=", len(poems))


def poem_files() -> list[Path]:
    return [p for p in POEMS_DIR.glob("*.json") if not p.name.startswith("_")]


def main(argv: list[str]) -> None:
    cmd = argv[1] if len(argv) > 1 else "all"
    POEMS_DIR.mkdir(parents=True, exist_ok=True)
    CONTENT.mkdir(parents=True, exist_ok=True)
    if cmd == "dump":
        dump_web_poems()
        return
    if cmd in ("poems", "all") and not poem_files():
        dump_web_poems()
    if cmd in ("poems", "all") and poem_files():
        build_web_poems()
    if cmd in ("catalog", "all"):
        data = build_catalog()
        CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("catalog", data["counts"])


if __name__ == "__main__":
    main(sys.argv)
