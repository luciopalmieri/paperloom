import io
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

from paperloom.ocr import figures


def _png_bytes(w: int = 800, h: int = 1000, color=(200, 200, 200)) -> bytes:
    im = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def test_parse_placeholders_full_form() -> None:
    md = (
        "Intro paragraph.\n\n"
        "[[FIGURE:fig-1|caption=Sales by region|bbox=0.10,0.20,0.50,0.60]]\n\n"
        "Body text.\n"
    )
    phs = figures.parse_placeholders(md)
    assert len(phs) == 1
    ph = phs[0]
    assert ph.n == 1
    assert ph.caption == "Sales by region"
    assert ph.bbox_norm == (0.10, 0.20, 0.50, 0.60)
    assert ph.raw == "[[FIGURE:fig-1|caption=Sales by region|bbox=0.10,0.20,0.50,0.60]]"


def test_parse_placeholders_legacy_and_partial() -> None:
    md = (
        "[[FIGURE:fig-2]]\n"
        "[[FIGURE:fig-3|caption=]]\n"
        "[[FIGURE:fig-4|caption=  spaced  |bbox=0,0,1,1]]\n"
    )
    phs = figures.parse_placeholders(md)
    assert [p.n for p in phs] == [2, 3, 4]
    assert phs[0].caption == ""
    assert phs[0].bbox_norm is None
    assert phs[1].caption == ""
    assert phs[2].caption == "spaced"
    assert phs[2].bbox_norm == (0.0, 0.0, 1.0, 1.0)


def test_parse_placeholders_invalid_bbox_dropped() -> None:
    md = "[[FIGURE:fig-1|caption=x|bbox=0.1,0.2]]"
    phs = figures.parse_placeholders(md)
    assert len(phs) == 1
    assert phs[0].bbox_norm is None


def test_iou_overlap_and_disjoint() -> None:
    a = (0.0, 0.0, 0.5, 0.5)
    b = (0.25, 0.25, 0.75, 0.75)
    score = figures.iou(a, b)
    # intersection = 0.25*0.25 = 0.0625; union = 0.25 + 0.25 - 0.0625 = 0.4375
    assert abs(score - (0.0625 / 0.4375)) < 1e-6
    assert figures.iou((0.0, 0.0, 0.1, 0.1), (0.5, 0.5, 0.6, 0.6)) == 0.0


def test_crop_from_bbox_returns_png_with_expected_size() -> None:
    page_png = _png_bytes(800, 1000)
    crop = figures.crop_from_bbox(page_png, (0.1, 0.2, 0.5, 0.6))
    assert crop is not None
    with Image.open(io.BytesIO(crop)) as im:
        assert im.format == "PNG"
        # round((0.5 - 0.1) * 800) = 320; round((0.6 - 0.2) * 1000) = 400
        assert im.size == (320, 400)


def test_crop_from_bbox_too_small_returns_none() -> None:
    page_png = _png_bytes(100, 100)
    assert figures.crop_from_bbox(page_png, (0.0, 0.0, 0.005, 0.005)) is None


def test_render_caption_line_modes() -> None:
    ph = figures.FigurePlaceholder(n=1, caption="Sales", bbox_norm=None, raw="")
    assert figures.render_caption_line(ph, "images/page-1-fig-1.png") == (
        "![Sales](images/page-1-fig-1.png)"
    )
    assert figures.render_caption_line(ph, None) == "**Figure 1.** Sales"
    empty = figures.FigurePlaceholder(n=2, caption="", bbox_norm=None, raw="")
    assert figures.render_caption_line(empty, None) == ""
    assert figures.render_caption_line(empty, "images/x.png") == "![](images/x.png)"


def test_replace_placeholders_link_and_caption_only() -> None:
    md = (
        "Para A.\n\n"
        "[[FIGURE:fig-1|caption=Sales|bbox=0,0,1,1]]\n\n"
        "Para B.\n\n"
        "[[FIGURE:fig-2|caption=Trends]]\n\n"
        "Para C.\n"
    )
    phs = figures.parse_placeholders(md)
    out = figures.replace_placeholders(md, phs, ["images/page-1-fig-1.png", None])
    assert "![Sales](images/page-1-fig-1.png)" in out
    assert "**Figure 2.** Trends" in out
    assert "[[FIGURE" not in out


def test_replace_placeholders_drops_empty_line() -> None:
    md = "Before.\n[[FIGURE:fig-1]]\nAfter.\n"
    phs = figures.parse_placeholders(md)
    out = figures.replace_placeholders(md, phs, [None])
    assert "[[FIGURE" not in out
    assert "Before.\nAfter.\n" == out


def test_build_figure_assets_llm_strategy_uses_page_png(tmp_path: Path) -> None:
    page_png = _png_bytes(400, 500)
    phs = [
        figures.FigurePlaceholder(
            n=1, caption="x", bbox_norm=(0.1, 0.1, 0.5, 0.5), raw=""
        ),
        figures.FigurePlaceholder(n=2, caption="", bbox_norm=None, raw=""),
    ]
    crops = figures.build_figure_assets(
        pdf_path=tmp_path / "missing.pdf",  # will be ignored under llm strategy
        page_index=0,
        page_png=page_png,
        placeholders=phs,
        strategy="llm",
    )
    assert crops[0] is not None
    assert crops[1] is None  # no bbox → None


def test_build_figure_assets_objects_strategy_matches_via_iou(monkeypatch) -> None:
    fake_obj = figures.FigureObject(
        bbox_norm=(0.1, 0.15, 0.55, 0.6),
        image_bytes=_png_bytes(50, 50, (10, 20, 30)),
    )
    monkeypatch.setattr(figures, "extract_image_objects", lambda p, i: [fake_obj])

    ph_match = figures.FigurePlaceholder(
        n=1, caption="m", bbox_norm=(0.12, 0.18, 0.5, 0.55), raw=""
    )
    ph_far = figures.FigurePlaceholder(
        n=2, caption="f", bbox_norm=(0.8, 0.8, 0.95, 0.95), raw=""
    )
    crops = figures.build_figure_assets(
        pdf_path=Path("/tmp/x.pdf"),
        page_index=0,
        page_png=_png_bytes(),
        placeholders=[ph_match, ph_far],
        strategy="objects",
    )
    assert crops[0] == fake_obj.image_bytes
    assert crops[1] is None  # IoU too low, no fallback under 'objects'


def test_build_figure_assets_auto_falls_back_to_llm(monkeypatch) -> None:
    fake_obj = figures.FigureObject(
        bbox_norm=(0.1, 0.1, 0.5, 0.5),
        image_bytes=_png_bytes(50, 50, (10, 20, 30)),
    )
    monkeypatch.setattr(figures, "extract_image_objects", lambda p, i: [fake_obj])

    ph_obj = figures.FigurePlaceholder(
        n=1, caption="o", bbox_norm=(0.11, 0.11, 0.49, 0.49), raw=""
    )
    ph_llm = figures.FigurePlaceholder(
        n=2, caption="l", bbox_norm=(0.6, 0.6, 0.9, 0.9), raw=""
    )
    crops = figures.build_figure_assets(
        pdf_path=Path("/tmp/x.pdf"),
        page_index=0,
        page_png=_png_bytes(400, 500),
        placeholders=[ph_obj, ph_llm],
        strategy="auto",
    )
    assert crops[0] == fake_obj.image_bytes
    assert crops[1] is not None  # fallback crop from page_png
    # crop must be a valid PNG
    with Image.open(io.BytesIO(crops[1])) as im:
        assert im.format == "PNG"


def test_extract_image_objects_invalid_pdf_returns_empty(tmp_path: Path) -> None:
    not_a_pdf = tmp_path / "x.txt"
    not_a_pdf.write_text("hello")
    assert figures.extract_image_objects(not_a_pdf, 0) == []


def test_extract_image_objects_blank_page_returns_empty(tmp_path: Path) -> None:
    pdf = pdfium.PdfDocument.new()
    try:
        pdf.new_page(width=612, height=792)
        out = tmp_path / "blank.pdf"
        with out.open("wb") as fh:
            pdf.save(fh)
    finally:
        pdf.close()
    assert figures.extract_image_objects(out, 0) == []


# --- _finalize_page_markdown integration --------------------------------


def _finalize(**kw):
    from paperloom.ocr.pipeline import _finalize_page_markdown

    return _finalize_page_markdown(**kw)


def test_finalize_image_input_no_placeholder_saves_whole_image(tmp_path: Path) -> None:
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    page_png = _png_bytes(200, 300, (10, 50, 90))
    md = "Some caption text only.\n"
    final, saved, total = _finalize(
        page_md_raw=md,
        pdf_path=tmp_path / "photo.jpg",
        page_index=0,
        page_png=page_png,
        page_number=1,
        images_dir=images_dir,
        include_images=True,
        image_strategy="auto",
        is_img_input=True,
    )
    assert saved == 1 and total == 1
    saved_file = images_dir / "page-1.png"
    assert saved_file.is_file()
    assert saved_file.read_bytes() == page_png
    # whole-image fallback does NOT inject a md link
    assert "![](" not in final
    assert final == md


def test_finalize_image_input_placeholder_no_bbox_falls_back_to_caption_only(
    tmp_path: Path,
) -> None:
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    page_png = _png_bytes(200, 300)
    md = "Intro\n[[FIGURE:fig-1|caption=Lat Machine]]\nMore text\n"
    final, saved, total = _finalize(
        page_md_raw=md,
        pdf_path=tmp_path / "photo.jpg",
        page_index=0,
        page_png=page_png,
        page_number=1,
        images_dir=images_dir,
        include_images=True,
        image_strategy="auto",
        is_img_input=True,
    )
    assert saved == 1 and total == 1
    assert (images_dir / "page-1.png").is_file()
    # md gets caption-only line; no link to the page image
    assert "**Figure 1.** Lat Machine" in final
    assert "![](" not in final
    assert "[[FIGURE" not in final


def test_finalize_image_input_with_valid_bbox_keeps_per_figure_crop(
    tmp_path: Path,
) -> None:
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    page_png = _png_bytes(400, 500)
    md = "Intro\n[[FIGURE:fig-1|caption=A|bbox=0.1,0.1,0.5,0.5]]\nEnd\n"
    final, saved, total = _finalize(
        page_md_raw=md,
        pdf_path=tmp_path / "photo.jpg",
        page_index=0,
        page_png=page_png,
        page_number=1,
        images_dir=images_dir,
        include_images=True,
        image_strategy="auto",
        is_img_input=True,
    )
    assert saved == 1 and total == 1
    assert (images_dir / "page-1-fig-1.png").is_file()
    # No whole-page fallback when crop succeeds
    assert not (images_dir / "page-1.png").exists()
    assert "![A](images/page-1-fig-1.png)" in final


def test_finalize_pdf_input_no_fallback(tmp_path: Path) -> None:
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    page_png = _png_bytes(200, 300)
    md = "Body\n[[FIGURE:fig-1|caption=Plot]]\n"
    final, saved, total = _finalize(
        page_md_raw=md,
        pdf_path=tmp_path / "doc.pdf",
        page_index=0,
        page_png=page_png,
        page_number=1,
        images_dir=images_dir,
        include_images=True,
        image_strategy="auto",
        is_img_input=False,
    )
    assert total == 1
    assert saved == 0  # no bbox, no PDF objects (file does not exist) → caption-only
    assert "**Figure 1.** Plot" in final
    assert not (images_dir / "page-1-fig-1.png").exists()


def test_finalize_off_returns_caption_only_counts(tmp_path: Path) -> None:
    images_dir = tmp_path / "images"
    md = "[[FIGURE:fig-1|caption=Foo]]\n[[FIGURE:fig-2|caption=Bar|bbox=0,0,1,1]]\n"
    final, saved, total = _finalize(
        page_md_raw=md,
        pdf_path=tmp_path / "x.jpg",
        page_index=0,
        page_png=_png_bytes(),
        page_number=1,
        images_dir=images_dir,
        include_images=False,
        image_strategy="auto",
        is_img_input=True,
    )
    assert saved == 0 and total == 2
    assert "**Figure 1.** Foo" in final
    assert "**Figure 2.** Bar" in final
    assert not images_dir.exists()
