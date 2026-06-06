#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests


API_URL = "https://vi.wikipedia.org/w/api.php"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "tmp" / "wiki"
USER_AGENT = "UltimateHistoryMapWikiImporter/1.0"

ALLOWED_TAGS = {
    "p",
    "blockquote",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "b",
    "strong",
    "i",
    "em",
    "code",
    "pre",
    "a",
    "br",
}

SKIP_TAGS = {
    "audio",
    "canvas",
    "figure",
    "form",
    "iframe",
    "img",
    "input",
    "map",
    "math",
    "meta",
    "noscript",
    "picture",
    "script",
    "style",
    "svg",
    "table",
    "video",
}

SKIP_CLASS_PARTS = (
    "ambox",
    "authority-control",
    "catlinks",
    "error",
    "hatnote",
    "metadata",
    "mw-editsection",
    "mw-empty-elt",
    "navbox",
    "navigation-not-searchable",
    "noprint",
    "reference",
    "reflist",
    "shortdescription",
    "sidebar",
    "toc",
    "vertical-navbox",
)

VOID_TAGS = {"br"}


class WikiHtmlSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self.open_tags: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.skip_depth:
            self.skip_depth += 1
            return

        attr_map = {name.lower(): value or "" for name, value in attrs}
        if tag in SKIP_TAGS or self._has_skipped_class(attr_map.get("class", "")):
            self.skip_depth = 1
            return

        if tag not in ALLOWED_TAGS:
            return

        if tag == "a":
            self.parts.append('<a href="__missing__">')
        elif tag == "br":
            self.parts.append("<br>")
            return
        else:
            self.parts.append(f"<{tag}>")
        self.open_tags.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.skip_depth:
            return
        attr_map = {name.lower(): value or "" for name, value in attrs}
        if tag in SKIP_TAGS or self._has_skipped_class(attr_map.get("class", "")):
            return
        if tag == "br":
            self.parts.append("<br>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return

        for index in range(len(self.open_tags) - 1, -1, -1):
            if self.open_tags[index] == tag:
                while len(self.open_tags) > index:
                    closing_tag = self.open_tags.pop()
                    self.parts.append(f"</{closing_tag}>")
                return

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if not data:
            return
        self.parts.append(html.escape(data, quote=False))

    def handle_entityref(self, name: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(f"&#{name};")

    def get_html(self) -> str:
        while self.open_tags:
            self.parts.append(f"</{self.open_tags.pop()}>")
        return "".join(self.parts)

    @staticmethod
    def _has_skipped_class(class_value: str) -> bool:
        classes = class_value.lower().split()
        return any(any(part in cls for part in SKIP_CLASS_PARTS) for cls in classes)


def title_from_source(source: str) -> str:
    parsed = urlparse(source)
    if parsed.scheme and parsed.netloc:
        if "/wiki/" in parsed.path:
            return unquote(parsed.path.rsplit("/wiki/", 1)[1]).replace("_", " ")
        raise ValueError(f"Unsupported Wikipedia URL: {source}")
    return source.replace("_", " ").strip()


def slugify_title(title: str) -> str:
    text = unicodedata.normalize("NFD", title.strip().lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "wiki"


def fetch_wikipedia_html(title: str) -> tuple[str, str]:
    response = requests.get(
        API_URL,
        params={
            "action": "parse",
            "page": title,
            "prop": "text",
            "format": "json",
            "formatversion": "2",
            "redirects": "1",
            "disableeditsection": "1",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(json.dumps(payload["error"], ensure_ascii=False))
    parsed = payload.get("parse") or {}
    fetched_title = str(parsed.get("title") or title).strip()
    article_html = str(parsed.get("text") or "")
    if not article_html.strip():
        raise RuntimeError(f"No article HTML returned for title: {title}")
    return fetched_title, article_html


def sanitize_wikipedia_html(article_html: str) -> str:
    parser = WikiHtmlSanitizer()
    parser.feed(article_html)
    parser.close()
    content = html.unescape(parser.get_html())
    content = normalize_fragment(content)
    return content


def normalize_fragment(content: str) -> str:
    content = re.sub(r"\r\n?", "\n", content)
    content = re.sub(r"[ \t\f\v]+", " ", content)
    content = re.sub(r"\s*\n\s*", "\n", content)
    content = re.sub(r">\s+<", "><", content)
    content = re.sub(r"<(p|li|h[2-6]|blockquote)>\s*</\1>", "", content)
    content = re.sub(r"<(ul|ol)>\s*</\1>", "", content)
    content = re.sub(r"(</(?:p|h[2-6]|ul|ol|li|blockquote|pre)>)", r"\1\n", content)
    content = re.sub(r"\n{2,}", "\n", content)
    return content.strip()


def put_first_paragraph_in_blockquote(content: str) -> str:
    match = re.search(r"<p>(.*?)</p>", content, flags=re.S)
    if not match:
        return content

    quote_inner = match.group(1).strip()
    before = content[: match.start()].strip()
    after = content[match.end() :].strip()
    parts = []
    if quote_inner:
        parts.append(f"<blockquote>{quote_inner}</blockquote>")
    if before:
        parts.append(before)
    if after:
        parts.append(after)
    return "\n".join(parts).strip()


def write_article(source: str, output_dir: Path, output_name: str | None = None) -> Path:
    title = title_from_source(source)
    fetched_title, article_html = fetch_wikipedia_html(title)
    content = sanitize_wikipedia_html(article_html)
    content = put_first_paragraph_in_blockquote(content)

    filename = output_name or f"{slugify_title(fetched_title)}.html"
    if not filename.endswith(".html"):
        filename = f"{filename}.html"

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / filename
    output_path.write_text(content + "\n", encoding="utf-8")
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch a Vietnamese Wikipedia article into UHM wiki HTML format.")
    parser.add_argument("source", help="Vietnamese Wikipedia URL or page title.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--output-name", help="Output filename. Defaults to a slug from the fetched title.")
    args = parser.parse_args()

    output_path = write_article(args.source, args.output_dir, args.output_name)
    print(output_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
