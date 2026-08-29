# -*- coding: utf-8 -*-
"""毛诗素材库工具：解析三本书 + 材料包自动装配。

用法（仓库根目录）：
    python tools/build-material.py               解析全部（年谱+传记 → data/素材库/*.jsonl）
    python tools/build-material.py 年谱|传记     只解析单个
    python tools/build-material.py pack <id>...   为指定诗生成材料包（docs/材料包/<id>.md）
    python tools/build-material.py pack --all     为全部 63 首生成材料包

材料包内容：鉴赏（诗正文/考辨/赏析）+ 年谱同期条目 + 传记同期段落 + 写作时间。
写作时间优先取 content/poems/<id>.json 的 date；否则从鉴赏题记解析中文数字日期；
都没有则标「待考」，年谱/传记段落留空（写稿时先做能对上时间的诗）。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "素材库"
NP_年谱 = ROOT / "data" / "_extracted" / "《毛泽东年谱(全九卷)》 (中央文献研究室)" / "text"
NP_传记 = ROOT / "data" / "_extracted" / "毛泽东传 (逢先知, 金冲及, 中共中央文献硏究室)" / "text"
NP_鉴赏 = ROOT / "data" / "_extracted" / "毛泽东诗词全编鉴赏" / "OEBPS" / "Text"
CATALOG = ROOT / "content" / "catalog.json"
POEMS_DIR = ROOT / "content" / "poems"
PACK_DIR = ROOT / "docs" / "材料包"

YEAR_RE = re.compile(r"(\d{4})\s*年")
DATE_SPAN_RE = re.compile(r'<span class="kindle-cn-bold">([^<]+)</span>\s*([^<]*)')
P_CALIBRE_RE = re.compile(r'<p class="calibre5">(.*?)</p>', re.S)
P_年谱_ANY = re.compile(r'<p class="(?:calibre5|kindle-cn-poem[^"]*)">(.*?)</p>', re.S)  # 保文档顺序的合并匹配
TAG_RE = re.compile(r"<[^>]+>")
P_NORMAL_RE = re.compile(r'<p class="normaltext[^"]*">(.*?)</p>', re.S)
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S)
H3_RE = re.compile(r'<h3[^>]*id="([^"]+)"[^>]*>(.*?)</h3>', re.S)
P_ANY_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.S)

CN_NUM = {"〇": 0, "○": 0, "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
          "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def strip_html(s: str) -> str:
    s = TAG_RE.sub("", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    s = s.replace("　", " ").strip()
    return re.sub(r"\s+", " ", s)


def cn_year_to_int(s: str) -> int | None:
    """一九六六年 → 1966；找不到返回 None。"""
    m = re.search(r"([〇○零一二两三四五六七八九]{4})年", s)
    if not m:
        return None
    digits = "".join(str(CN_NUM.get(ch, 0)) for ch in m.group(1))
    return int(digits)


def parse_年谱() -> tuple[int, int]:
    rows: list[dict] = []
    for f in sorted(NP_年谱.glob("*.html")):
        html = f.read_text(encoding="utf-8")
        tm = TITLE_RE.search(html)
        title = tm.group(1) if tm else ""
        m = YEAR_RE.search(title)  # 年份只认 <title>：出版说明/修订说明等文件整体跳过
        if not m:
            continue
        year = m.group(1)
        prev = None
        for pm in P_年谱_ANY.finditer(html):
            inner = pm.group(1)
            dm = DATE_SPAN_RE.search(inner)
            if dm:
                date = dm.group(1).strip()
                text = strip_html(dm.group(2) + inner[dm.end():])
                row = {"year": year, "date": date, "text": text, "file": f.name}
                rows.append(row)
                prev = row
            else:
                text = strip_html(inner)
                if text:
                    if prev is not None:
                        prev["text"] += " " + text
                    else:
                        rows.append({"year": year, "date": "", "text": text, "file": f.name})
                        prev = rows[-1]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "年谱.jsonl"
    with out.open("w", encoding="utf-8") as fp:
        for r in rows:
            fp.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(rows), len({r["year"] for r in rows})


def parse_传记() -> tuple[int, int]:
    rows: list[dict] = []
    for f in sorted(NP_传记.glob("*.html")):
        html = f.read_text(encoding="utf-8")
        tm = TITLE_RE.search(html)
        chapter = strip_html(tm.group(1)) if tm else f.stem
        for pm in P_NORMAL_RE.finditer(html):
            t = strip_html(pm.group(1))
            if t:
                rows.append({"chapter": chapter, "text": t, "file": f.name})
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "传记.jsonl"
    with out.open("w", encoding="utf-8") as fp:
        for r in rows:
            fp.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(rows), len({r["chapter"] for r in rows})


def load_年谱() -> dict[str, list[dict]]:
    by_year: dict[str, list[dict]] = {}
    p = OUT_DIR / "年谱.jsonl"
    if not p.exists():
        parse_年谱()
    for line in p.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        by_year.setdefault(r["year"], []).append(r)
    return by_year


def load_传记() -> list[dict]:
    p = OUT_DIR / "传记.jsonl"
    if not p.exists():
        parse_传记()
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines()]


def extract_anchored(html: str, anchor: str) -> str:
    """提取锚点 <h3 id="cXXX">…</h3> 之后到下一个 h3 之前的全部段落文本。"""
    m = re.search(r'<h3[^>]*id="' + re.escape(anchor) + r'"[^>]*>', html)
    if not m:
        return ""
    seg = html[m.end():]
    nxt = re.search(r'<h3[^>]*id="', seg)
    if nxt:
        seg = seg[:nxt.start()]
    paras = [strip_html(pm.group(1)) for pm in P_ANY_RE.finditer(seg)]
    return "\n".join(t for t in paras if t)


def extract_poem_text(html: str, src_anchor: str | None) -> str:
    """诗正文：优先 src 锚点 (#bXXX) 之后到第一个 h3 前的段落；无锚点取文件前部诗行。"""
    if src_anchor:
        m = re.search(r'<[a-z]+[^>]*id="' + re.escape(src_anchor) + r'"[^>]*>', html)
        if m:
            seg = html[m.end():]
            nxt = re.search(r'<h3[^>]*id="', seg)
            if nxt:
                seg = seg[:nxt.start()]
            paras = [strip_html(pm.group(1)) for pm in P_ANY_RE.finditer(seg)]
            return "\n".join(t for t in paras if t)
    # 兜底：文件开头到第一个 h3 之间的段落（含诗行与题记）
    seg = html
    nxt = re.search(r'<h3[^>]*id="', seg)
    if nxt:
        seg = seg[:nxt.start()]
    paras = [strip_html(pm.group(1)) for pm in P_ANY_RE.finditer(seg)]
    return "\n".join(t for t in paras if t)


def resolve_date(poem_id: str, poem_head: str) -> tuple[str | None, str | None]:
    """返回 (year, date_text)。优先 content/poems/<id>.json；其次鉴赏题记。
    poem_head 是去 HTML 的诗正文：只认第一段短行（题记行，如「一九六六年六月」），
    诗行与「最早发表在一九九六年…」等长句不会误匹配。"""
    f = POEMS_DIR / f"{poem_id}.json"
    if f.exists():
        try:
            d = json.loads(f.read_text(encoding="utf-8")).get("date")
            if d:
                m = re.search(r"(\d{4})", d)
                return (m.group(1) if m else None, d)
        except Exception:
            pass
    first = (poem_head or "").split("\n")[0].strip()
    if first and len(first) <= 20:
        m = cn_year_to_int(first)
        if m:
            return (str(m), f"{m}年（自鉴赏题记解析）")
    return (None, "待考（未对上时间）")


def month_of(date: str | None) -> int:
    """日期文本提取月份数字："11月1日" → 11；无月份返回 0。"""
    m = re.search(r"(\d{1,2})月", date or "")
    return int(m.group(1)) if m else 0


def build_pack(rec: dict, 年谱: dict[str, list[dict]], 传记: list[dict]) -> str:
    src_full = rec["source"]["src"]  # 形如 "OEBPS/Text/part0067.xhtml" 或带 #b001 锚点
    fpath = NP_鉴赏 / src_full.replace("OEBPS/Text/", "").split("#", 1)[0]
    html = fpath.read_text(encoding="utf-8") if fpath.exists() else ""

    src_anchor = src_full.split("#", 1)[1] if "#" in src_full else None
    poem_text = extract_poem_text(html, src_anchor) if html else "（鉴赏文件缺失）"
    kaobian = extract_anchored(html, rec["source"]["kaobian"].split("#")[-1]) if rec["source"].get("kaobian") else ""
    essays = []
    for e in rec["source"].get("essays", []):
        a = e["src"].split("#")[-1]
        essays.append(f"### {e['title']}\n\n{extract_anchored(html, a)}")

    year, date_text = resolve_date(rec["id"], (poem_text or "")[:200])

    lines = [
        f"# 材料包：{rec['title']}（{rec['id']}）",
        "",
        f"- 诗体：{rec['form'] or '未知'}｜编次：{rec['section']}｜状态：{rec['status']}",
        f"- 写作时间：{date_text}",
        "",
        "## 一、鉴赏原文",
        "",
        "### 诗正文",
        "",
        poem_text or "（未提取到）",
        "",
    ]
    if kaobian:
        lines += ["### 【考辨】", "", kaobian, ""]
    for es in essays:
        lines += [es, ""]

    if year and year in 年谱:
        entries: list[dict] = []
        # 月份窗口：±2 月（按月份数值匹配，避免 "1月" 误中 "11月"），跨年时延伸
        dm = re.search(r"(\d{1,2})月", date_text or "")
        if dm:
            mo = int(dm.group(1))
            lo, hi = max(1, mo - 2), min(12, mo + 2)
            cand = [(year, set(range(lo, hi + 1)))]
            if mo <= 2:
                cand.append((str(int(year) - 1), {10, 11, 12}))
            if mo >= 11:
                cand.append((str(int(year) + 1), {1, 2}))
            for y, ms in cand:
                for r in 年谱.get(y, []):
                    if month_of(r["date"]) in ms:
                        entries.append(r)
            entries = entries or 年谱[year]
        else:
            entries = 年谱[year]
        window_note = f"，{dm.group(1)}月前后" if dm else ""
        lines += [f"## 二、年谱同期（{year} 年{window_note}，{len(entries)} 条）", ""]
        for r in entries[:30]:
            lines += [f"- **{r['date'] or '—'}** {r['text']}", ""]
    else:
        lines += ["## 二、年谱同期", "", "（写作时间未定，未检索；写稿前先对上年谱）", ""]

    if year:
        cn_year = int_to_cn_year(year)
        hits = [r for r in 传记 if f"{year}年" in r["text"] or f"{cn_year}年" in r["text"]]
        lines += [f"## 三、传记同期（{year} 年相关，{len(hits)} 段，按章去重）", ""]
        # 按章分组；排除"正文偶然提及该年份"的跨时代章节（如 1954 宪法章列举 1923 年宪法）：
        # 保留条件 = 该章命中段数 ≥ 2，或首个命中段位于章节前 3 段（章节开头即定位到该年代）
        by_chapter: dict[str, list[dict]] = {}
        for r in hits:
            by_chapter.setdefault(r["chapter"], []).append(r)
        shown = 0
        for chapter, paras in by_chapter.items():
            if shown >= 10:
                break
            ch_all = [r for r in 传记 if r["chapter"] == chapter]
            idx = {id(r): i for i, r in enumerate(ch_all)}
            first_hit = min(paras, key=lambda r: idx.get(id(r), 999))
            strong = len(paras) >= 2 or idx.get(id(first_hit), 999) < 3
            if not strong:
                continue
            lines += [f"### {chapter}", "", first_hit["text"], ""]
            shown += 1
    else:
        lines += ["## 三、传记同期", "", "（写作时间未定，未检索）", ""]

    return "\n".join(lines)


CN_DIGITS = "〇一二三四五六七八九"


def int_to_cn_year(y: str) -> str:
    """1966 → 一九六六（传记文本中的年份是中文数字）。"""
    return "".join(CN_DIGITS[int(d)] for d in y)


def pack(ids: list[str]) -> None:
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    年谱 = load_年谱()
    传记 = load_传记()
    if not ids or "all" in ids or "--all" in ids:
        recs = cat["poems"]
    else:
        recs = [p for p in cat["poems"] if p["id"] in ids]
        missing = [i for i in ids if i not in {p["id"] for p in cat["poems"]}]
        if missing:
            print("目录中不存在:", ", ".join(missing))
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    for rec in recs:
        out = PACK_DIR / f"{rec['id']}.md"
        out.write_text(build_pack(rec, 年谱, 传记), encoding="utf-8")
        print(f"packed {rec['id']} -> {out.relative_to(ROOT)}")


def main(argv: list[str]) -> None:
    if len(argv) > 1 and argv[1] == "pack":
        pack(argv[2:] or ["--all"])
        return
    only = argv[1] if len(argv) > 1 else "all"
    if only in ("all", "年谱"):
        n, y = parse_年谱()
        print(f"年谱: {n} 条 / {y} 年 -> data/素材库/年谱.jsonl")
    if only in ("all", "传记"):
        n, c = parse_传记()
        print(f"传记: {n} 段 / {c} 章 -> data/素材库/传记.jsonl")
    if only not in ("all", "年谱", "传记"):
        print(f"未知命令: {only}\n用法: python tools/build-material.py [pack <id>... | --all | 年谱 | 传记]")
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv)
