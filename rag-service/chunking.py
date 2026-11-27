import io
from typing import List, Tuple
import pypdf

def extract_text_from_pdf(file_bytes: bytes) -> List[Tuple[int, str]]:
    """Extracts text page-by-page from PDF binary bytes. Returns list of (page_num, page_text)."""
    pages_data = []
    pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    for page_idx, page in enumerate(pdf_reader.pages, start=1):
        text = page.extract_text() or ""
        clean_text = text.strip()
        if clean_text:
            pages_data.append((page_idx, clean_text))
    return pages_data

def extract_text_from_plain(file_bytes: bytes) -> List[Tuple[int, str]]:
    """Extracts text from UTF-8/Latin-1 plain text or markdown files."""
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1", errors="ignore")
    clean_text = text.strip()
    return [(1, clean_text)] if clean_text else []

def chunk_text(text: str, chunk_size: int = 700, overlap: int = 100) -> List[str]:
    """
    Sliding window chunker.
    Splits text into overlapping ~500-800 character windows with boundary detection.
    """
    if not text:
        return []
    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        if end < text_len:
            # Find natural punctuation or line break boundary
            break_point = max(
                text.rfind(".\n", start, end),
                text.rfind(". ", start, end),
                text.rfind("\n\n", start, end),
                text.rfind("\n", start, end),
                text.rfind(" ", start, end),
            )
            if break_point > start + 250:
                end = break_point + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_len:
            break
        start = max(end - overlap, start + 1)

    return chunks
